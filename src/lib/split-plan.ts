import { z } from "zod";

export const splitModes = ["prompt", "manual", "both"] as const;
export const duplicatePolicies = ["single", "overlap"] as const;
export const visibilityOptions = ["private", "public"] as const;

export type SplitMode = (typeof splitModes)[number];
export type DuplicatePolicy = (typeof duplicatePolicies)[number];
export type PlaylistVisibility = (typeof visibilityOptions)[number];

export type NormalizedTrack = {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  artistIds?: string[];
  genres?: string[];
  /** Where the genres came from: track | album | artist-spotify | artist-lastfm. */
  genreSource?: string;
  album?: string;
  durationMs?: number;
  sourceOrder: number;
};

export type ClassificationCategory = {
  name: string;
  description?: string;
  trackIds: string[];
};

export type ClassificationResult = {
  categories: ClassificationCategory[];
};

export const classificationResultSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        description: z.string().trim().optional(),
        trackIds: z.array(z.string().trim().min(1)).min(1)
      })
    )
    .min(1)
});

export function chunkItems<T>(items: T[], size: number): T[][] {
  if (size < 1) {
    throw new Error("Chunk size must be greater than zero.");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function parseManualCategories(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value : value?.split(/\r?\n|,/);

  return Array.from(
    new Set(
      (raw ?? [])
        .map((item) => normalizeCategoryName(item))
        .filter((item) => item.length > 0)
    )
  );
}

export function validateClassificationResult(
  input: unknown,
  tracks: NormalizedTrack[],
  duplicatePolicy: DuplicatePolicy
): ClassificationResult {
  const parsed = classificationResultSchema.parse(input);
  const validTrackIds = new Set(tracks.map((track) => track.id));
  const seen = new Set<string>();

  const categories = parsed.categories.map((category) => {
    const name = normalizeCategoryName(category.name);
    const uniqueTrackIds = Array.from(new Set(category.trackIds));

    const knownTrackIds = uniqueTrackIds.filter((trackId) =>
      validTrackIds.has(trackId)
    );

    if (duplicatePolicy === "single") {
      return {
        name,
        description: category.description,
        trackIds: knownTrackIds.filter((trackId) => {
          if (seen.has(trackId)) {
            return false;
          }

          seen.add(trackId);
          return true;
        })
      };
    }

    return {
      name,
      description: category.description,
      trackIds: knownTrackIds
    };
  });

  const compacted = categories.filter((category) => category.trackIds.length > 0);

  if (compacted.length === 0) {
    throw new Error("The AI agent did not return any usable track assignments.");
  }

  return { categories: compacted };
}

export function mergeClassificationResults(
  results: ClassificationResult[],
  duplicatePolicy: DuplicatePolicy
): ClassificationResult {
  const categories = new Map<
    string,
    { name: string; description?: string; trackIds: string[] }
  >();
  const globallySeen = new Set<string>();

  for (const result of results) {
    for (const category of result.categories) {
      const name = normalizeCategoryName(category.name);
      // Ignore case and punctuation so "Latin Hip-Hop" and "latin hip hop"
      // land in the same bucket.
      const key = name
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
      const existing =
        categories.get(key) ??
        categories
          .set(key, {
            name,
            description: category.description,
            trackIds: []
          })
          .get(key)!;

      for (const trackId of category.trackIds) {
        if (duplicatePolicy === "single" && globallySeen.has(trackId)) {
          continue;
        }

        if (!existing.trackIds.includes(trackId)) {
          existing.trackIds.push(trackId);
        }

        globallySeen.add(trackId);
      }
    }
  }

  return {
    categories: Array.from(categories.values()).filter(
      (category) => category.trackIds.length > 0
    )
  };
}

export type PlanLimits = {
  /** Max playlists a single track may appear in; null means unlimited. */
  maxRepeatsPerTrack: number | null;
  /** Max tracks per generated playlist; null means unlimited. */
  maxTracksPerPlaylist: number | null;
  /** Max number of generated playlists; null means unlimited. */
  maxPlaylists?: number | null;
};

export function enforcePlanLimits(
  result: ClassificationResult,
  limits: PlanLimits
): ClassificationResult {
  let categories = result.categories.map((category) => ({
    ...category,
    trackIds: [...category.trackIds]
  }));

  if (limits.maxRepeatsPerTrack !== null && limits.maxRepeatsPerTrack >= 1) {
    const occurrences = new Map<string, number>();

    categories = categories.map((category) => ({
      ...category,
      trackIds: category.trackIds.filter((trackId) => {
        const count = occurrences.get(trackId) ?? 0;
        if (count >= limits.maxRepeatsPerTrack!) {
          return false;
        }
        occurrences.set(trackId, count + 1);
        return true;
      })
    }));
  }

  let maxPlaylists = limits.maxPlaylists ?? null;

  // If maxPlaylists × maxTracksPerPlaylist cannot hold every assignment,
  // allow extra playlists instead of overflowing into endless "Mixed" parts.
  if (
    maxPlaylists !== null &&
    limits.maxTracksPerPlaylist !== null &&
    limits.maxTracksPerPlaylist >= 1
  ) {
    const totalAssignments = categories.reduce(
      (total, category) => total + category.trackIds.length,
      0
    );
    maxPlaylists = Math.max(
      maxPlaylists,
      Math.ceil(totalAssignments / limits.maxTracksPerPlaylist)
    );
  }

  if (maxPlaylists !== null && maxPlaylists >= 1 && categories.length > maxPlaylists) {
    // Keep the largest categories; everything else merges into one bucket
    // so no track is silently dropped.
    const sorted = [...categories].sort(
      (a, b) => b.trackIds.length - a.trackIds.length
    );
    const kept = sorted.slice(0, Math.max(1, maxPlaylists - 1));
    const merged = sorted.slice(Math.max(1, maxPlaylists - 1));

    if (merged.length > 0) {
      const keptTrackIds = new Set(
        kept.flatMap((category) => category.trackIds)
      );
      const mixedTrackIds: string[] = [];

      for (const category of merged) {
        for (const trackId of category.trackIds) {
          if (!keptTrackIds.has(trackId) && !mixedTrackIds.includes(trackId)) {
            mixedTrackIds.push(trackId);
          }
        }
      }

      categories = [
        ...kept,
        {
          name: "Mixed",
          description: "Combined from smaller categories.",
          trackIds: mixedTrackIds
        }
      ];
    } else {
      categories = kept;
    }
  }

  if (limits.maxTracksPerPlaylist !== null && limits.maxTracksPerPlaylist >= 1) {
    // Overflowing categories are split into numbered parts so no track is
    // silently dropped: "Energy", "Energy (2)", ...
    categories = categories.flatMap((category) => {
      if (category.trackIds.length <= limits.maxTracksPerPlaylist!) {
        return [category];
      }

      return chunkItems(category.trackIds, limits.maxTracksPerPlaylist!).map(
        (trackIds, index) => ({
          name: index === 0 ? category.name : `${category.name} (${index + 1})`,
          description: category.description,
          trackIds
        })
      );
    });
  }

  const compacted = categories.filter((category) => category.trackIds.length > 0);

  if (compacted.length === 0) {
    throw new Error("No tracks remain after applying the configured limits.");
  }

  return { categories: compacted };
}

export function formatPlaylistName(prefix: string, categoryName: string) {
  const cleanPrefix = prefix.trimEnd();
  const cleanName = normalizeCategoryName(categoryName);

  if (!cleanPrefix) {
    return cleanName;
  }

  return `${cleanPrefix} ${cleanName}`.replace(/\s+/g, " ");
}

export function validateEditablePlan(
  categories: ClassificationCategory[],
  duplicatePolicy: DuplicatePolicy,
  validTrackIds: Set<string>
) {
  if (categories.length === 0) {
    throw new Error("At least one category is required.");
  }

  const seen = new Set<string>();

  for (const category of categories) {
    category.name = normalizeCategoryName(category.name);

    if (!category.name) {
      throw new Error("Every category needs a name.");
    }

    for (const trackId of category.trackIds) {
      if (!validTrackIds.has(trackId)) {
        throw new Error(`Unknown track in preview: ${trackId}`);
      }

      if (duplicatePolicy === "single" && seen.has(trackId)) {
        throw new Error("A track is assigned to more than one category.");
      }

      seen.add(trackId);
    }
  }
}
