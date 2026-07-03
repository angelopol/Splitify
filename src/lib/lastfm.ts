import type { NormalizedTrack } from "@/lib/split-plan";

const LASTFM_API_BASE = "https://ws.audioscrobbler.com/2.0/";
const CONCURRENCY = 5;

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Last.fm allows roughly 5 req/s sustained per key; the defaults aim a bit
// above that for bursts while the batch delay keeps the average safe.
// All tunable from .env:
function limits() {
  const requestsPerSecond = envInt("LASTFM_REQUESTS_PER_SECOND", 8);
  return {
    maxTrackLookups: envInt("LASTFM_MAX_TRACK_LOOKUPS", 2000),
    maxAlbumLookups: envInt("LASTFM_MAX_ALBUM_LOOKUPS", 800),
    maxArtistLookups: envInt("LASTFM_MAX_ARTIST_LOOKUPS", 300),
    batchDelayMs: Math.round((CONCURRENCY / requestsPerSecond) * 1000)
  };
}

// Community tags that are popular on Last.fm but useless as genres.
const JUNK_TAGS = new Set([
  "seen live",
  "favorites",
  "favourite",
  "favourites",
  "awesome",
  "beautiful",
  "love",
  "spotify",
  "albums i own",
  "under 2000 listeners",
  "male vocalists",
  "female vocalists",
  "all"
]);

// Tag caches survive dev HMR reloads and repeat runs.
const globalStore = globalThis as unknown as {
  __lastfmArtistTags?: Map<string, string[]>;
  __lastfmTrackTags?: Map<string, string[]>;
  __lastfmAlbumTags?: Map<string, string[]>;
};
const artistCache = (globalStore.__lastfmArtistTags ??= new Map<
  string,
  string[]
>());
const trackCache = (globalStore.__lastfmTrackTags ??= new Map<
  string,
  string[]
>());
const albumCache = (globalStore.__lastfmAlbumTags ??= new Map<
  string,
  string[]
>());

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(...parts: string[]) {
  return parts.map((part) => part.toLocaleLowerCase()).join("|");
}

function cleanTags(
  tags: { name?: string; count?: number }[],
  minCount: number,
  excludeName?: string
) {
  const excluded = excludeName?.toLocaleLowerCase();

  return tags
    .filter(
      (tag) =>
        tag.name &&
        (tag.count ?? 0) >= minCount &&
        !JUNK_TAGS.has(tag.name.toLocaleLowerCase()) &&
        // Users often tag songs with the artist's own name.
        tag.name.toLocaleLowerCase() !== excluded
    )
    .slice(0, 3)
    .map((tag) => tag.name!.toLocaleLowerCase());
}

async function fetchTopTags(
  params: Record<string, string>,
  cache: Map<string, string[]>,
  key: string,
  minCount: number,
  excludeName: string,
  apiKey: string
) {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  let tags: string[] = [];

  try {
    const query = new URLSearchParams({
      ...params,
      api_key: apiKey,
      format: "json",
      autocorrect: "1"
    });
    const response = await fetch(`${LASTFM_API_BASE}?${query.toString()}`);

    if (response.ok) {
      const payload = (await response.json()) as {
        toptags?: { tag?: { name?: string; count?: number }[] };
      };
      tags = cleanTags(payload.toptags?.tag ?? [], minCount, excludeName);
    }
  } catch {
    // Tag lookups are best-effort.
  }

  cache.set(key, tags);
  return tags;
}

function trackKey(track: NormalizedTrack) {
  return cacheKey(track.artists[0], track.name);
}

function albumKey(track: NormalizedTrack) {
  return cacheKey(track.artists[0], track.album ?? "");
}

async function runBatches<T>(
  items: T[],
  worker: (item: T) => Promise<unknown>,
  isCached: (item: T) => boolean,
  batchDelayMs: number,
  onBatch?: (done: number, total: number) => void
) {
  for (let index = 0; index < items.length; index += CONCURRENCY) {
    const batch = items.slice(index, index + CONCURRENCY);
    const uncached = batch.some((item) => !isCached(item));

    await Promise.all(batch.map(worker));
    onBatch?.(Math.min(index + CONCURRENCY, items.length), items.length);

    // Cached entries are free; only real network batches pay the delay.
    if (uncached && index + CONCURRENCY < items.length) {
      await sleep(batchDelayMs);
    }
  }
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/**
 * Resolves genres from Last.fm before the playlists are built.
 *
 * Strategy, in order:
 * 1. Album top tags for every unique album (one request covers many songs).
 * 2. Track top tags for songs without an album.
 * 3. Any remaining track-lookup budget is spent on a random sample of
 *    album songs, since a song's own tags beat its album's tags.
 *
 * Per-track priority: song tags > album tags. Tracks still empty fall back
 * to artist genres (Spotify, then Last.fm) elsewhere.
 */
export async function fillGenresFromLastFm(
  tracks: NormalizedTrack[],
  onProgress?: (message: string) => void
) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return;
  }

  const { maxTrackLookups, maxAlbumLookups, batchDelayMs } = limits();
  const withArtist = tracks.filter((track) => track.artists.length > 0);
  const albumTracks = withArtist.filter((track) => track.album);
  const singles = withArtist.filter((track) => !track.album);

  // Phase 1: unique albums.
  const uniqueAlbums = new Map<string, NormalizedTrack>();
  for (const track of albumTracks) {
    const key = albumKey(track);
    if (!uniqueAlbums.has(key)) {
      uniqueAlbums.set(key, track);
    }
  }

  const albumEntries = Array.from(uniqueAlbums.values()).slice(
    0,
    maxAlbumLookups
  );

  await runBatches(
    albumEntries,
    (track) =>
      fetchTopTags(
        {
          method: "album.gettoptags",
          artist: track.artists[0],
          album: track.album!
        },
        albumCache,
        albumKey(track),
        5,
        track.artists[0],
        apiKey
      ),
    (track) => albumCache.has(albumKey(track)),
    batchDelayMs,
    (done, total) =>
      onProgress?.(`Looking up album genres on Last.fm (${done}/${total})…`)
  );

  for (const track of albumTracks) {
    const tags = albumCache.get(albumKey(track));
    if (tags && tags.length > 0) {
      track.genres = tags;
    }
  }

  // Phase 2: songs without an album must use the track endpoint.
  let trackBudget = maxTrackLookups;
  const singleLookups = singles.slice(0, trackBudget);
  trackBudget -= singleLookups.length;

  await runBatches(
    singleLookups,
    async (track) => {
      const tags = await fetchTopTags(
        {
          method: "track.getTopTags",
          artist: track.artists[0],
          track: track.name
        },
        trackCache,
        trackKey(track),
        5,
        track.artists[0],
        apiKey
      );
      if (tags.length > 0) {
        track.genres = tags;
      }
    },
    (track) => trackCache.has(trackKey(track)),
    batchDelayMs,
    (done, total) =>
      onProgress?.(`Looking up song genres on Last.fm (${done}/${total})…`)
  );

  // Phase 3: spend the remaining budget refining random album songs with
  // their own tags, which override the album's tags when present.
  if (trackBudget > 0 && albumTracks.length > 0) {
    const sample = shuffled(albumTracks).slice(0, trackBudget);

    await runBatches(
      sample,
      async (track) => {
        const tags = await fetchTopTags(
          {
            method: "track.getTopTags",
            artist: track.artists[0],
            track: track.name
          },
          trackCache,
          trackKey(track),
          5,
          track.artists[0],
          apiKey
        );
        if (tags.length > 0) {
          track.genres = tags;
        }
      },
      (track) => trackCache.has(trackKey(track)),
      batchDelayMs,
      (done, total) =>
        onProgress?.(`Refining song genres on Last.fm (${done}/${total})…`)
    );
  }
}

/**
 * Last-resort fallback: fills `genres` for tracks that are still empty,
 * using Last.fm community tags for the track's artists.
 */
export async function fillMissingGenresFromLastFm(tracks: NormalizedTrack[]) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return;
  }

  const pendingArtists: string[] = [];
  const seen = new Set<string>();

  for (const track of tracks) {
    if (track.genres && track.genres.length > 0) {
      continue;
    }
    for (const artist of track.artists) {
      const key = artist.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        pendingArtists.push(artist);
      }
    }
  }

  const { maxArtistLookups, batchDelayMs } = limits();
  const limited = pendingArtists.slice(0, maxArtistLookups);

  await runBatches(
    limited,
    (artist) =>
      fetchTopTags(
        { method: "artist.gettoptags", artist },
        artistCache,
        cacheKey(artist),
        10,
        artist,
        apiKey
      ),
    (artist) => artistCache.has(cacheKey(artist)),
    batchDelayMs
  );

  for (const track of tracks) {
    if (track.genres && track.genres.length > 0) {
      continue;
    }

    const genres = Array.from(
      new Set(
        track.artists.flatMap(
          (artist) => artistCache.get(cacheKey(artist)) ?? []
        )
      )
    ).slice(0, 4);

    if (genres.length > 0) {
      track.genres = genres;
    }
  }
}
