import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { classifyTracksWithAiAgent } from "@/lib/ai-agent";
import { prisma } from "@/lib/prisma";
import {
  duplicatePolicies,
  enforcePlanLimits,
  parseManualCategories,
  splitModes,
  type ClassificationResult,
  type NormalizedTrack,
  visibilityOptions
} from "@/lib/split-plan";
import {
  fillGenresFromLastFm,
  fillMissingGenresFromLastFm
} from "@/lib/lastfm";
import {
  clearSplitProgress,
  setSplitProgress
} from "@/lib/progress";
import { serializeSplitRun, splitRunInclude } from "@/lib/split-serializer";
import { getArtistsGenres, getPlaylistTracks } from "@/lib/spotify";

const createSplitSchema = z.object({
  sourcePlaylists: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1)
      })
    )
    .min(1),
  prompt: z.string().trim().optional(),
  mode: z.enum(splitModes),
  duplicatePolicy: z.enum(duplicatePolicies),
  playlistPrefix: z.string().default("Splitify - "),
  visibility: z.enum(visibilityOptions).default("private"),
  manualCategories: z.array(z.string()).default([]),
  maxRepeatsPerTrack: z.number().int().min(1).max(50).nullable().default(3),
  maxTracksPerPlaylist: z.number().int().min(1).max(10000).nullable().default(null),
  maxPlaylists: z.number().int().min(1).max(100).nullable().default(null),
  progressToken: z.string().max(100).optional()
});

async function persistClassification(
  splitRunId: string,
  tracks: NormalizedTrack[],
  result: ClassificationResult
) {
  const tracksById = new Map(tracks.map((track) => [track.id, track]));

  await prisma.$transaction(async (tx) => {
    await tx.splitAssignment.deleteMany({ where: { splitRunId } });
    await tx.splitCategory.deleteMany({ where: { splitRunId } });

    for (const [categoryIndex, category] of result.categories.entries()) {
      const createdCategory = await tx.splitCategory.create({
        data: {
          splitRunId,
          name: category.name,
          description: category.description,
          order: categoryIndex
        }
      });

      await tx.splitAssignment.createMany({
        data: category.trackIds
          .map((trackId, categoryOrder) => {
            const track = tracksById.get(trackId);
            if (!track) {
              return null;
            }

            return {
              splitRunId,
              categoryId: createdCategory.id,
              trackId: track.id,
              trackUri: track.uri,
              trackName: track.name,
              artists: track.artists.join(", "),
              album: track.album,
              durationMs: track.durationMs,
              sourceOrder: track.sourceOrder,
              categoryOrder,
              trackMetadata: JSON.stringify(track)
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
      });
    }

    await tx.splitRun.update({
      where: { id: splitRunId },
      data: {
        status: "ready",
        error: null
      }
    });
  });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSplitSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid split request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const manualCategories = parseManualCategories(input.manualCategories);

  const run = await prisma.splitRun.create({
    data: {
      userId: session.user.id,
      sourcePlaylistId: input.sourcePlaylists.map((item) => item.id).join(","),
      sourcePlaylistName: input.sourcePlaylists
        .map((item) => item.name)
        .join(" + "),
      prompt: input.prompt,
      mode: input.mode,
      duplicatePolicy: input.duplicatePolicy,
      playlistPrefix: input.playlistPrefix,
      visibility: input.visibility,
      status: "classifying"
    }
  });

  const userId = session.user.id;
  const progressToken = input.progressToken;

  function reportProgress(message: string, current?: number, total?: number) {
    if (progressToken) {
      setSplitProgress(userId, progressToken, { message, current, total });
    }
  }

  try {
    // Combine every selected playlist, dropping duplicate tracks and
    // renumbering sourceOrder across the merged list.
    const seenTrackIds = new Set<string>();
    const tracks: NormalizedTrack[] = [];

    for (const [index, source] of input.sourcePlaylists.entries()) {
      reportProgress(
        `Reading "${source.name}" (${index + 1}/${input.sourcePlaylists.length})…`
      );
      const sourceTracks = await getPlaylistTracks(userId, source.id);

      for (const track of sourceTracks) {
        if (seenTrackIds.has(track.id)) {
          continue;
        }
        seenTrackIds.add(track.id);
        tracks.push({ ...track, sourceOrder: tracks.length });
      }
    }

    // Genres are resolved before any playlist is built. Last.fm strategy:
    // albums first (cached, wide coverage), track tags for singles, then a
    // random sample of album songs refined with their own tags. Song tags
    // beat album tags; whatever is left falls back to artist genres.
    reportProgress("Resolving genres on Last.fm…");
    await fillGenresFromLastFm(tracks, reportProgress);

    const missingAfterTrackTags = tracks.filter(
      (track) => !track.genres || track.genres.length === 0
    );

    if (missingAfterTrackTags.length > 0) {
      reportProgress(
        `Filling ${missingAfterTrackTags.length} genres from Spotify artists…`
      );
      const artistIds = missingAfterTrackTags.flatMap(
        (track) => track.artistIds ?? []
      );
      const genresByArtist = await getArtistsGenres(userId, artistIds);

      for (const track of missingAfterTrackTags) {
        const genres = Array.from(
          new Set(
            (track.artistIds ?? []).flatMap(
              (artistId) => genresByArtist.get(artistId) ?? []
            )
          )
        ).slice(0, 4);

        if (genres.length > 0) {
          track.genres = genres;
        }
      }

      // Last resort: Last.fm artist tags.
      if (
        missingAfterTrackTags.some(
          (track) => !track.genres || track.genres.length === 0
        )
      ) {
        reportProgress("Filling remaining genres from Last.fm artists…");
        await fillMissingGenresFromLastFm(tracks);
      }
    }

    // With the "single" policy each track already appears at most once.
    const maxRepeats =
      input.duplicatePolicy === "single" ? 1 : input.maxRepeatsPerTrack;

    const classification = enforcePlanLimits(
      await classifyTracksWithAiAgent({
        tracks,
        prompt: input.prompt,
        mode: input.mode,
        duplicatePolicy: input.duplicatePolicy,
        manualCategories,
        maxRepeatsPerTrack: maxRepeats,
        maxTracksPerPlaylist: input.maxTracksPerPlaylist,
        maxPlaylists: input.maxPlaylists,
        onProgress: (done, total) => {
          reportProgress(
            done === total
              ? "Consolidating the plan…"
              : `Classifying songs with the AI agent (batch ${done + 1}/${total})…`,
            done,
            total
          );
        }
      }),
      {
        maxRepeatsPerTrack: maxRepeats,
        maxTracksPerPlaylist: input.maxTracksPerPlaylist,
        maxPlaylists: input.maxPlaylists
      }
    );

    reportProgress("Saving the preview…");
    await persistClassification(run.id, tracks, classification);

    const savedRun = await prisma.splitRun.findFirstOrThrow({
      where: {
        id: run.id,
        userId: session.user.id
      },
      include: splitRunInclude
    });

    if (progressToken) {
      clearSplitProgress(userId, progressToken);
    }

    return NextResponse.json({ split: serializeSplitRun(savedRun) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to classify playlist.";

    if (progressToken) {
      clearSplitProgress(userId, progressToken);
    }

    await prisma.splitRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: message
      }
    });

    return NextResponse.json({ error: message, splitId: run.id }, { status: 500 });
  }
}
