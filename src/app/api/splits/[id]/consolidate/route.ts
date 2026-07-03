import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { consolidateCategoriesWithAiAgent } from "@/lib/ai-agent";
import { prisma } from "@/lib/prisma";
import { serializeSplitRun, splitRunInclude } from "@/lib/split-serializer";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
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

  if (run.categories.length < 2) {
    return NextResponse.json(
      { error: "Nothing to merge — the plan has a single playlist." },
      { status: 400 }
    );
  }

  try {
    const groups = await consolidateCategoriesWithAiAgent({
      categories: run.categories.map((category) => ({
        name: category.name,
        description: category.description ?? undefined,
        trackCount: category.assignments.length
      })),
      userPrompt: run.prompt
    });

    const categoriesByName = new Map(
      run.categories.map((category) => [category.name, category])
    );

    await prisma.$transaction(async (tx) => {
      await tx.splitAssignment.deleteMany({ where: { splitRunId: run.id } });
      await tx.splitCategory.deleteMany({ where: { splitRunId: run.id } });

      for (const [groupIndex, group] of groups.entries()) {
        const createdCategory = await tx.splitCategory.create({
          data: {
            splitRunId: run.id,
            name: group.name,
            order: groupIndex
          }
        });

        const seenTrackIds = new Set<string>();
        let categoryOrder = 0;
        const rows = [];

        for (const sourceName of group.sourceCategories) {
          const source = categoriesByName.get(sourceName);
          if (!source) {
            continue;
          }

          for (const assignment of source.assignments) {
            if (seenTrackIds.has(assignment.trackId)) {
              continue;
            }
            seenTrackIds.add(assignment.trackId);

            rows.push({
              splitRunId: run.id,
              categoryId: createdCategory.id,
              trackId: assignment.trackId,
              trackUri: assignment.trackUri,
              trackName: assignment.trackName,
              artists: assignment.artists,
              album: assignment.album,
              durationMs: assignment.durationMs,
              sourceOrder: assignment.sourceOrder,
              categoryOrder: categoryOrder++,
              trackMetadata: assignment.trackMetadata
            });
          }
        }

        if (rows.length > 0) {
          await tx.splitAssignment.createMany({ data: rows });
        }
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
          error instanceof Error ? error.message : "Unable to merge playlists."
      },
      { status: 500 }
    );
  }
}
