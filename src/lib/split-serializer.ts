import type { Prisma } from "@prisma/client";

export const splitRunInclude = {
  categories: {
    include: {
      assignments: {
        orderBy: {
          categoryOrder: "asc"
        }
      }
    },
    orderBy: {
      order: "asc"
    }
  }
} satisfies Prisma.SplitRunInclude;

export type SplitRunWithCategories = Prisma.SplitRunGetPayload<{
  include: typeof splitRunInclude;
}>;

export function serializeSplitRun(run: SplitRunWithCategories) {
  return {
    id: run.id,
    sourcePlaylistId: run.sourcePlaylistId,
    sourcePlaylistName: run.sourcePlaylistName,
    prompt: run.prompt,
    mode: run.mode,
    duplicatePolicy: run.duplicatePolicy,
    playlistPrefix: run.playlistPrefix,
    visibility: run.visibility,
    status: run.status,
    error: run.error,
    categories: run.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      spotifyPlaylistId: category.spotifyPlaylistId,
      spotifyUrl: category.spotifyUrl,
      assignments: category.assignments.map((assignment) => ({
        id: assignment.id,
        trackId: assignment.trackId,
        trackUri: assignment.trackUri,
        trackName: assignment.trackName,
        artists: assignment.artists,
        album: assignment.album,
        durationMs: assignment.durationMs,
        sourceOrder: assignment.sourceOrder,
        categoryOrder: assignment.categoryOrder,
        trackMetadata: assignment.trackMetadata
      }))
    }))
  };
}
