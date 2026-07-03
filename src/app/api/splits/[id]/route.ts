import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  validateEditablePlan,
  type ClassificationCategory
} from "@/lib/split-plan";
import { serializeSplitRun, splitRunInclude } from "@/lib/split-serializer";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const updateSplitSchema = z.object({
  playlistPrefix: z.string().optional(),
  categories: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        trackIds: z.array(z.string()).default([])
      })
    )
    .min(1)
});

export async function GET(_request: Request, context: RouteContext) {
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

  return NextResponse.json({ split: serializeSplitRun(run) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = updateSplitSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid preview update.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const run = await prisma.splitRun.findFirst({
    where: {
      id,
      userId: session.user.id
    },
    include: {
      assignments: true
    }
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

  const assignmentsByTrackId = new Map(
    run.assignments.map((assignment) => [assignment.trackId, assignment])
  );
  const validTrackIds = new Set(assignmentsByTrackId.keys());
  const categories: ClassificationCategory[] = parsed.data.categories.map(
    (category) => ({
      name: category.name,
      description: category.description,
      trackIds: category.trackIds
    })
  );

  try {
    validateEditablePlan(
      categories,
      run.duplicatePolicy === "overlap" ? "overlap" : "single",
      validTrackIds
    );

    await prisma.$transaction(async (tx) => {
      await tx.splitAssignment.deleteMany({ where: { splitRunId: run.id } });
      await tx.splitCategory.deleteMany({ where: { splitRunId: run.id } });

      for (const [categoryIndex, category] of categories.entries()) {
        const createdCategory = await tx.splitCategory.create({
          data: {
            splitRunId: run.id,
            name: category.name,
            description: category.description,
            order: categoryIndex
          }
        });

        await tx.splitAssignment.createMany({
          data: category.trackIds.map((trackId, categoryOrder) => {
            const existing = assignmentsByTrackId.get(trackId)!;

            return {
              splitRunId: run.id,
              categoryId: createdCategory.id,
              trackId: existing.trackId,
              trackUri: existing.trackUri,
              trackName: existing.trackName,
              artists: existing.artists,
              album: existing.album,
              durationMs: existing.durationMs,
              sourceOrder: existing.sourceOrder,
              categoryOrder,
              trackMetadata: existing.trackMetadata
            };
          })
        });
      }

      await tx.splitRun.update({
        where: { id: run.id },
        data: {
          playlistPrefix: parsed.data.playlistPrefix ?? run.playlistPrefix,
          status: "ready",
          error: null
        }
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
      { error: error instanceof Error ? error.message : "Unable to save preview." },
      { status: 400 }
    );
  }
}
