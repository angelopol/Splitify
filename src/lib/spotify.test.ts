import { beforeEach, describe, expect, it, vi } from "vitest";

const { accountFindFirst, accountUpdate } = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  accountUpdate: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findFirst: accountFindFirst,
      update: accountUpdate
    }
  }
}));

import {
  chunkSpotifyUris,
  refreshSpotifyAccessToken,
  unfollowPlaylist
} from "@/lib/spotify";

describe("spotify helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SPOTIFY_CLIENT_ID = "client";
    process.env.SPOTIFY_CLIENT_SECRET = "secret";
  });

  it("chunks Spotify URIs into API-sized batches", () => {
    const uris = Array.from({ length: 205 }, (_, index) => `spotify:track:${index}`);

    expect(chunkSpotifyUris(uris).map((chunk) => chunk.length)).toEqual([
      100,
      100,
      5
    ]);
  });

  it("refreshes access tokens and preserves refresh token when omitted", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: "new-access",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "playlist-read-private"
      })
    }));

    vi.stubGlobal("fetch", fetchMock);
    accountUpdate.mockImplementation(async ({ data }) => ({
      id: "account-id",
      refresh_token: "old-refresh",
      ...data
    }));

    const refreshed = await refreshSpotifyAccessToken({
      id: "account-id",
      userId: "user-id",
      type: "oauth",
      provider: "spotify",
      providerAccountId: "spotify-user",
      refresh_token: "old-refresh",
      access_token: "old-access",
      expires_at: 1,
      token_type: "Bearer",
      scope: null,
      id_token: null,
      session_state: null
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(accountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-id" },
        data: expect.objectContaining({
          access_token: "new-access",
          refresh_token: "old-refresh"
        })
      })
    );
    expect(refreshed.access_token).toBe("new-access");
  });

  it("accepts empty successful Spotify responses when unfollowing playlists", async () => {
    accountFindFirst.mockResolvedValue({
      id: "account-id",
      userId: "user-id",
      type: "oauth",
      provider: "spotify",
      providerAccountId: "spotify-user",
      refresh_token: "refresh",
      access_token: "access",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "Bearer",
      scope: null,
      id_token: null,
      session_state: null
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => ""
    }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(unfollowPlaylist("user-id", "playlist-id")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/playlists/playlist-id/followers",
      expect.objectContaining({
        method: "DELETE"
      })
    );
  });
});
