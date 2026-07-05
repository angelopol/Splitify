import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { NormalizedTrack } from "@/lib/split-plan";
import { serializeSplitRun, splitRunInclude } from "@/lib/split-serializer";
import { getPlaylistTracks } from "@/lib/spotify";

const importSchema = z.object({
  sourcePlaylists: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1)
      })
    )
    .min(1),
  text: z.string().min(1).max(2_000_000),
  playlistPrefix: z.string().default("Splitify -")
});

function normalizeLine(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = importSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import request." },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    // Same multi-source read as a normal split.
    const seenTrackIds = new Set<string>();
    const tracks: NormalizedTrack[] = [];

    for (const source of input.sourcePlaylists) {
      const sourceTracks = await getPlaylistTracks(session.user.id, source.id);

      for (const track of sourceTracks) {
        if (seenTrackIds.has(track.id)) {
          continue;
        }
        seenTrackIds.add(track.id);
        tracks.push({ ...track, sourceOrder: tracks.length });
      }
    }

    const trackByLine = new Map<string, NormalizedTrack>();
    for (const track of tracks) {
      const key = normalizeLine(`${track.name} — ${track.artists.join(", ")}`);
      if (!trackByLine.has(key)) {
        trackByLine.set(key, track);
      }
    }

    // Parse "## Name (n)" headers and "- Track — Artists" lines.
    const categories: { name: string; trackIds: string[] }[] = [];
    let current: { name: string; trackIds: string[] } | null = null;
    let unmatched = 0;

    for (const raw of input.text.split(/\r?\n/)) {
      const line = raw.trim();

      const header = line.match(/^##\s+(.+?)\s*(?:\(\d+\))?\s*$/);
      if (header) {
        current = { name: header[1], trackIds: [] };
        categories.push(current);
        continue;
      }

      const item = line.match(/^-\s+(.+)$/);
      if (item && current) {
        const track = trackByLine.get(normalizeLine(item[1]));
        if (!track) {
          unmatched += 1;
          continue;
        }
        if (!current.trackIds.includes(track.id)) {
          current.trackIds.push(track.id);
        }
      }
    }

    const nonEmpty = categories.filter(
      (category) => category.trackIds.length > 0
    );

    if (nonEmpty.length === 0) {
      return NextResponse.json(
        {
          error:
            "No tracks matched. Check that the text uses the “## Playlist” / “- Track — Artists” format and that the right source playlists are selected."
        },
        { status: 400 }
      );
    }

    const tracksById = new Map(tracks.map((track) => [track.id, track]));

    // Overlap policy so a track repeated across pasted playlists never
    // fails validation later.
    const run = await prisma.splitRun.create({
      data: {
        userId: session.user.id,
        sourcePlaylistId: input.sourcePlaylists.map((item) => item.id).join(","),
        sourcePlaylistName: input.sourcePlaylists
          .map((item) => item.name)
          .join(" + "),
        prompt: null,
        mode: "manual",
        duplicatePolicy: "overlap",
        playlistPrefix: input.playlistPrefix,
        visibility: "private",
        status: "classifying"
      }
    });

    await prisma.$transaction(async (tx) => {
      for (const [categoryIndex, category] of nonEmpty.entries()) {
        const createdCategory = await tx.splitCategory.create({
          data: {
            splitRunId: run.id,
            name: category.name,
            order: categoryIndex
          }
        });

        await tx.splitAssignment.createMany({
          data: category.trackIds.map((trackId, categoryOrder) => {
            const track = tracksById.get(trackId)!;

            return {
              splitRunId: run.id,
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
        });
      }

      await tx.splitRun.update({
        where: { id: run.id },
        data: { status: "ready", error: null }
      });
    });

    const savedRun = await prisma.splitRun.findFirstOrThrow({
      where: {
        id: run.id,
        userId: session.user.id
      },
      include: splitRunInclude
    });

    return NextResponse.json({
      split: serializeSplitRun(savedRun),
      unmatched
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to import the plan."
      },
      { status: 500 }
    );
  }
}
