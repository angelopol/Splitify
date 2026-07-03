import type { Account } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { NormalizedTrack, PlaylistVisibility } from "@/lib/split-plan";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

type SpotifyPage<T> = {
  items: T[];
  next: string | null;
  total?: number;
};

type SpotifyPlaylistItem = {
  id: string;
  name: string;
  images?: { url: string }[];
  owner?: { display_name?: string };
  tracks?: { total: number };
};

type SpotifyTrackItem = {
  track: {
    id: string | null;
    uri: string;
    name: string;
    type: string;
    is_local?: boolean;
    duration_ms?: number;
    album?: { name?: string };
    artists?: { name: string }[];
  } | null;
};

type SpotifyProfile = {
  id: string;
  display_name?: string;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  imageUrl?: string;
  ownerName?: string;
  trackCount: number;
};

export type CreatedSpotifyPlaylist = {
  id: string;
  name: string;
  externalUrl?: string;
};

export function chunkSpotifyUris(uris: string[], size = 100) {
  const chunks: string[][] = [];
  for (let index = 0; index < uris.length; index += size) {
    chunks.push(uris.slice(index, index + size));
  }
  return chunks;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function spotifyAuthHeader() {
  const clientId = requiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SPOTIFY_CLIENT_SECRET");
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function getSpotifyAccount(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "spotify"
    }
  });

  if (!account) {
    throw new Error("Spotify account is not connected.");
  }

  return account;
}

export async function refreshSpotifyAccessToken(account: Account) {
  if (!account.refresh_token) {
    throw new Error("Spotify refresh token is missing.");
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${spotifyAuthHeader()}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token
    })
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
  };

  const expiresAt = Math.floor(Date.now() / 1000) + (payload.expires_in ?? 3600);

  return prisma.account.update({
    where: {
      id: account.id
    },
    data: {
      access_token: payload.access_token,
      expires_at: expiresAt,
      refresh_token: payload.refresh_token ?? account.refresh_token,
      token_type: payload.token_type ?? account.token_type,
      scope: payload.scope ?? account.scope
    }
  });
}

export async function getValidSpotifyAccessToken(userId: string) {
  const account = await getSpotifyAccount(userId);
  const expiresAt = account.expires_at ?? 0;
  const expiresSoon = expiresAt < Math.floor(Date.now() / 1000) + 60;

  if (!account.access_token || expiresSoon) {
    const refreshed = await refreshSpotifyAccessToken(account);
    return refreshed.access_token!;
  }

  return account.access_token;
}

async function spotifyFetch<T>(
  userId: string,
  pathOrUrl: string,
  init: RequestInit = {},
  retried = false
): Promise<T> {
  const token = await getValidSpotifyAccessToken(userId);
  const url = pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : `${SPOTIFY_API_BASE}${pathOrUrl}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (response.status === 401 && !retried) {
    const account = await getSpotifyAccount(userId);
    await refreshSpotifyAccessToken(account);
    return spotifyFetch<T>(userId, pathOrUrl, init, true);
  }

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Spotify request failed: ${response.status} ${body}`);
  }

  if (response.status === 204 || body.trim().length === 0) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
}

export async function getCurrentSpotifyProfile(userId: string) {
  return spotifyFetch<SpotifyProfile>(userId, "/me");
}

async function getPlaylistTrackTotal(userId: string, playlistId: string) {
  const page = await spotifyFetch<{ total?: number }>(
    userId,
    `/playlists/${playlistId}/tracks?limit=1&fields=total`
  );

  return page.total ?? 0;
}

export async function listUserPlaylists(userId: string) {
  const playlists: SpotifyPlaylist[] = [];
  let next: string | null = `${SPOTIFY_API_BASE}/me/playlists?limit=50`;

  while (next) {
    const page: SpotifyPage<SpotifyPlaylistItem> =
      await spotifyFetch<SpotifyPage<SpotifyPlaylistItem>>(userId, next);

    playlists.push(
      ...page.items.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        imageUrl: playlist.images?.[0]?.url,
        ownerName: playlist.owner?.display_name,
        trackCount: playlist.tracks?.total ?? 0
      }))
    );

    next = page.next;
  }

  const resolvedCounts = await Promise.allSettled(
    playlists.map((playlist) => getPlaylistTrackTotal(userId, playlist.id))
  );

  return playlists.map((playlist, index) => {
    const resolved = resolvedCounts[index];

    if (resolved?.status !== "fulfilled") {
      return playlist;
    }

    return {
      ...playlist,
      trackCount: resolved.value
    };
  });
}

export async function getPlaylistTracks(
  userId: string,
  playlistId: string
): Promise<NormalizedTrack[]> {
  const tracks: NormalizedTrack[] = [];
  const fields =
    "items(track(id,uri,name,type,is_local,duration_ms,album(name),artists(name))),next,total,limit,offset";
  let next: string | null = `${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks?limit=100&fields=${encodeURIComponent(fields)}`;

  while (next) {
    const page: SpotifyPage<SpotifyTrackItem> =
      await spotifyFetch<SpotifyPage<SpotifyTrackItem>>(userId, next);

    for (const item of page.items) {
      const track = item.track;
      if (!track || !track.id || track.type !== "track" || track.is_local) {
        continue;
      }

      tracks.push({
        id: track.id,
        uri: track.uri,
        name: track.name,
        artists: track.artists?.map((artist) => artist.name) ?? [],
        album: track.album?.name,
        durationMs: track.duration_ms,
        sourceOrder: tracks.length
      });
    }

    next = page.next;
  }

  return tracks;
}

export async function unfollowPlaylist(userId: string, playlistId: string) {
  await spotifyFetch(userId, `/playlists/${playlistId}/followers`, {
    method: "DELETE"
  });
}

export async function createSpotifyPlaylist(
  userId: string,
  name: string,
  visibility: PlaylistVisibility
) {
  const profile = await getCurrentSpotifyProfile(userId);

  const playlist = await spotifyFetch<
    CreatedSpotifyPlaylist & { external_urls?: { spotify?: string } }
  >(userId, `/users/${profile.id}/playlists`, {
    method: "POST",
    body: JSON.stringify({
      name,
      public: visibility === "public",
      description: "Created by Splitify."
    })
  });

  return {
    id: playlist.id,
    name: playlist.name,
    externalUrl: playlist.external_urls?.spotify
  };
}

export async function addTracksToPlaylist(
  userId: string,
  playlistId: string,
  uris: string[]
) {
  for (const chunk of chunkSpotifyUris(uris)) {
    await spotifyFetch(userId, `/playlists/${playlistId}/tracks`, {
      method: "POST",
      body: JSON.stringify({
        uris: chunk
      })
    });
  }
}
