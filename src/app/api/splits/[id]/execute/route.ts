import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  formatPlaylistName,
  validateEditablePlan,
  type ClassificationCategory,
  type PlaylistVisibility
} from "@/lib/split-plan";
import { serializeSplitRun, splitRunInclude } from "@/lib/split-serializer";
import { addTracksToPlaylist, createSpotifyPlaylist } from "@/lib/spotify";

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

  if (run.status !== "ready") {
    return NextResponse.json(
      { error: "Only ready splits can be executed." },
      { status: 409 }
    );
  }

  const allAssignments = run.categories.flatMap((category) =>
    category.assignments.map((assignment) => assignment.trackId)
  );
  const categories: ClassificationCategory[] = run.categories.map((category) => ({
    name: category.name,
    description: category.description ?? undefined,
    trackIds: category.assignments.map((assignment) => assignment.trackId)
  }));

  try {
    validateEditablePlan(
      categories,
      run.duplicatePolicy === "overlap" ? "overlap" : "single",
      new Set(allAssignments)
    );

    await prisma.splitRun.update({
      where: { id: run.id },
      data: {
        status: "executing",
        error: null
      }
    });

    for (const category of run.categories) {
      const playlist = await createSpotifyPlaylist(
        session.user.id,
        formatPlaylistName(run.playlistPrefix, category.name),
        run.visibility as PlaylistVisibility
      );

      await addTracksToPlaylist(
        session.user.id,
        playlist.id,
        category.assignments.map((assignment) => assignment.trackUri)
      );

      await prisma.splitCategory.update({
        where: {
          id: category.id
        },
        data: {
          spotifyPlaylistId: playlist.id,
          spotifyUrl: playlist.externalUrl
        }
      });
    }

    await prisma.splitRun.update({
      where: { id: run.id },
      data: {
        status: "completed"
      }
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
    const message =
      error instanceof Error ? error.message : "Unable to execute split.";

    await prisma.splitRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error: message
      }
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
