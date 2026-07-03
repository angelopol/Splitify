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
import {
  addTracksToPlaylist,
  createSpotifyPlaylist,
  getPlaylistTracks,
  listUserPlaylists
} from "@/lib/spotify";

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

    // Existing playlists (from a previous run or already in the library)
    // are reused: only the missing tracks get added.
    const libraryPlaylists = await listUserPlaylists(session.user.id);
    const libraryByName = new Map(
      libraryPlaylists.map((playlist) => [
        playlist.name.trim().toLowerCase(),
        playlist
      ])
    );

    for (const category of run.categories) {
      const targetName = formatPlaylistName(run.playlistPrefix, category.name);
      const existing = category.spotifyPlaylistId
        ? { id: category.spotifyPlaylistId, url: category.spotifyUrl }
        : (() => {
            const match = libraryByName.get(targetName.trim().toLowerCase());
            return match
              ? {
                  id: match.id,
                  url: `https://open.spotify.com/playlist/${match.id}`
                }
              : null;
          })();

      let playlistId: string;
      let playlistUrl: string | null;
      let uris = category.assignments.map((assignment) => assignment.trackUri);

      if (existing) {
        playlistId = existing.id;
        playlistUrl = existing.url ?? null;

        const currentTracks = await getPlaylistTracks(
          session.user.id,
          playlistId
        );
        const currentUris = new Set(currentTracks.map((track) => track.uri));
        uris = uris.filter((uri) => !currentUris.has(uri));
      } else {
        const playlist = await createSpotifyPlaylist(
          session.user.id,
          targetName,
          run.visibility as PlaylistVisibility
        );
        playlistId = playlist.id;
        playlistUrl = playlist.externalUrl ?? null;
      }

      if (uris.length > 0) {
        await addTracksToPlaylist(session.user.id, playlistId, uris);
      }

      await prisma.splitCategory.update({
        where: {
          id: category.id
        },
        data: {
          spotifyPlaylistId: playlistId,
          spotifyUrl: playlistUrl
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
