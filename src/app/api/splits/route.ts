import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { classifyTracksWithAiAgent } from "@/lib/ai-agent";
import { prisma } from "@/lib/prisma";
import {
  duplicatePolicies,
  parseManualCategories,
  splitModes,
  type ClassificationResult,
  type NormalizedTrack,
  visibilityOptions
} from "@/lib/split-plan";
import { serializeSplitRun, splitRunInclude } from "@/lib/split-serializer";
import { getPlaylistTracks } from "@/lib/spotify";

const createSplitSchema = z.object({
  sourcePlaylistId: z.string().min(1),
  sourcePlaylistName: z.string().min(1),
  prompt: z.string().trim().optional(),
  mode: z.enum(splitModes),
  duplicatePolicy: z.enum(duplicatePolicies),
  playlistPrefix: z.string().default("Splitify - "),
  visibility: z.enum(visibilityOptions).default("private"),
  manualCategories: z.array(z.string()).default([])
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
      sourcePlaylistId: input.sourcePlaylistId,
      sourcePlaylistName: input.sourcePlaylistName,
      prompt: input.prompt,
      mode: input.mode,
      duplicatePolicy: input.duplicatePolicy,
      playlistPrefix: input.playlistPrefix,
      visibility: input.visibility,
      status: "classifying"
    }
  });

  try {
    const tracks = await getPlaylistTracks(session.user.id, input.sourcePlaylistId);
    const classification = await classifyTracksWithAiAgent({
      tracks,
      prompt: input.prompt,
      mode: input.mode,
      duplicatePolicy: input.duplicatePolicy,
      manualCategories
    });

    await persistClassification(run.id, tracks, classification);

    const savedRun = await prisma.splitRun.findFirstOrThrow({
      where: {
        id: run.id,
        userId: session.user.id
      },
      include: splitRunInclude
    });

    return NextResponse.json({ split: serializeSplitRun(savedRun) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to classify playlist.";

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
