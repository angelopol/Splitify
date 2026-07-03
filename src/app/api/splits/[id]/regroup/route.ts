import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { regroupTracksWithAiAgent } from "@/lib/ai-agent";
import { prisma } from "@/lib/prisma";
import type { NormalizedTrack } from "@/lib/split-plan";
import { serializeSplitRun, splitRunInclude } from "@/lib/split-serializer";

function maxRegroupTracks() {
  const value = Number.parseInt(process.env.REGROUP_MAX_TRACKS ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 1500;
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const regroupSchema = z.object({
  categoryIds: z.array(z.string().min(1)).min(2),
  hint: z.string().max(500).optional()
});

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = regroupSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid regroup request." },
      { status: 400 }
    );
  }

  const run = await prisma.splitRun.findFirst({
    where: {
      id,
      userId: session.user.id
    },
    include: splitRunInclude
  });

  if (!run) {
    return NextResponse.json({ error: "Split not found." }, { status: 404 });
  }

  if (run.status === "executing" || run.status === "completed") {
    return NextResponse.json(
      { error: "This split can no longer be edited." },
      { status: 409 }
    );
  }

  const selectedIds = new Set(parsed.data.categoryIds);
  const selected = run.categories.filter((category) =>
    selectedIds.has(category.id)
  );

  if (selected.length < 2) {
    return NextResponse.json(
      { error: "Select at least two playlists to regroup." },
      { status: 400 }
    );
  }

  // One representative assignment per track, plus its stored metadata
  // (which carries the genres found during generation).
  const byTrackId = new Map<
    string,
    { assignment: (typeof selected)[number]["assignments"][number]; track: NormalizedTrack }
  >();

  for (const category of selected) {
    for (const assignment of category.assignments) {
      if (byTrackId.has(assignment.trackId)) {
        continue;
      }

      let metadata: Partial<NormalizedTrack> = {};
      try {
        metadata = JSON.parse(assignment.trackMetadata) as NormalizedTrack;
      } catch {
        // Metadata is best-effort.
      }

      byTrackId.set(assignment.trackId, {
        assignment,
        track: {
          id: assignment.trackId,
          uri: assignment.trackUri,
          name: assignment.trackName,
          artists: metadata.artists ?? assignment.artists.split(", "),
          album: metadata.album ?? assignment.album ?? undefined,
          genres: metadata.genres,
          durationMs: assignment.durationMs ?? undefined,
          sourceOrder: assignment.sourceOrder
        }
      });
    }
  }

  const entries = Array.from(byTrackId.values());

  const limit = maxRegroupTracks();
  if (entries.length > limit) {
    return NextResponse.json(
      {
        error: `Too many tracks to regroup at once (${entries.length}). Select playlists totalling up to ${limit} tracks.`
      },
      { status: 400 }
    );
  }

  try {
    const result = await regroupTracksWithAiAgent({
      tracks: entries.map((entry) => entry.track),
      targetCount: selected.length,
      hint: parsed.data.hint,
      avoidNames: run.categories
        .filter((category) => !selectedIds.has(category.id))
        .map((category) => category.name),
      duplicatePolicy: "single"
    });

    const maxOrder = Math.max(
      -1,
      ...run.categories
        .filter((category) => !selectedIds.has(category.id))
        .map((_, index) => index)
    );

    await prisma.$transaction(async (tx) => {
      await tx.splitAssignment.deleteMany({
        where: {
          splitRunId: run.id,
          categoryId: { in: Array.from(selectedIds) }
        }
      });
      await tx.splitCategory.deleteMany({
        where: {
          id: { in: Array.from(selectedIds) },
          splitRunId: run.id
        }
      });

      for (const [groupIndex, category] of result.categories.entries()) {
        const createdCategory = await tx.splitCategory.create({
          data: {
            splitRunId: run.id,
            name: category.name,
            description: category.description,
            order: maxOrder + 1 + groupIndex
          }
        });

        await tx.splitAssignment.createMany({
          data: category.trackIds
            .map((trackId, categoryOrder) => {
              const entry = byTrackId.get(trackId);
              if (!entry) {
                return null;
              }

              return {
                splitRunId: run.id,
                categoryId: createdCategory.id,
                trackId: entry.assignment.trackId,
                trackUri: entry.assignment.trackUri,
                trackName: entry.assignment.trackName,
                artists: entry.assignment.artists,
                album: entry.assignment.album,
                durationMs: entry.assignment.durationMs,
                sourceOrder: entry.assignment.sourceOrder,
                categoryOrder,
                trackMetadata: entry.assignment.trackMetadata
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
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

    return NextResponse.json({ split: serializeSplitRun(savedRun) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to regroup playlists."
      },
      { status: 500 }
    );
  }
}
