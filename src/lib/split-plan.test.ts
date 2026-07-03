import { describe, expect, it } from "vitest";

import {
  chunkItems,
  enforcePlanLimits,
  formatPlaylistName,
  mergeClassificationResults,
  parseManualCategories,
  validateClassificationResult,
  type NormalizedTrack
} from "@/lib/split-plan";

describe("enforcePlanLimits", () => {
  it("caps how many playlists a track can appear in", () => {
    const result = enforcePlanLimits(
      {
        categories: [
          { name: "One", trackIds: ["a", "b"] },
          { name: "Two", trackIds: ["a", "c"] },
          { name: "Three", trackIds: ["a"] }
        ]
      },
      { maxRepeatsPerTrack: 2, maxTracksPerPlaylist: null }
    );

    expect(result.categories.map((category) => category.trackIds)).toEqual([
      ["a", "b"],
      ["a", "c"]
    ]);
  });

  it("caps the number of playlists by merging the smallest into Mixed", () => {
    const result = enforcePlanLimits(
      {
        categories: [
          { name: "Big", trackIds: ["a", "b", "c"] },
          { name: "Medium", trackIds: ["d", "e"] },
          { name: "Tiny 1", trackIds: ["f"] },
          { name: "Tiny 2", trackIds: ["g"] }
        ]
      },
      { maxRepeatsPerTrack: null, maxTracksPerPlaylist: null, maxPlaylists: 3 }
    );

    expect(result.categories.map((category) => category.name)).toEqual([
      "Big",
      "Medium",
      "Mixed"
    ]);
    expect(result.categories[2].trackIds.sort()).toEqual(["f", "g"]);
  });

  it("splits oversized playlists into numbered parts", () => {
    const result = enforcePlanLimits(
      {
        categories: [{ name: "Big", trackIds: ["a", "b", "c", "d", "e"] }]
      },
      { maxRepeatsPerTrack: null, maxTracksPerPlaylist: 2 }
    );

    expect(result.categories.map((category) => category.name)).toEqual([
      "Big",
      "Big (2)",
      "Big (3)"
    ]);
    expect(result.categories.map((category) => category.trackIds)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"]
    ]);
  });
});

const tracks: NormalizedTrack[] = [
  {
    id: "a",
    uri: "spotify:track:a",
    name: "Track A",
    artists: ["Artist A"],
    album: "Album",
    sourceOrder: 0
  },
  {
    id: "b",
    uri: "spotify:track:b",
    name: "Track B",
    artists: ["Artist B"],
    album: "Album",
    sourceOrder: 1
  },
  {
    id: "c",
    uri: "spotify:track:c",
    name: "Track C",
    artists: ["Artist C"],
    album: "Album",
    sourceOrder: 2
  }
];

describe("split-plan", () => {
  it("chunks arrays without dropping items", () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("parses manual categories from lines and commas", () => {
    expect(parseManualCategories("Late Night\nEnergy, Late Night")).toEqual([
      "Late Night",
      "Energy"
    ]);
  });

  it("removes duplicate assignments when policy is single", () => {
    const result = validateClassificationResult(
      {
        categories: [
          { name: "One", trackIds: ["a", "b"] },
          { name: "Two", trackIds: ["b", "c", "missing"] }
        ]
      },
      tracks,
      "single"
    );

    expect(result.categories).toEqual([
      { name: "One", description: undefined, trackIds: ["a", "b"] },
      { name: "Two", description: undefined, trackIds: ["c"] }
    ]);
  });

  it("merges chunk results by category name", () => {
    expect(
      mergeClassificationResults(
        [
          { categories: [{ name: "Energy", trackIds: ["a"] }] },
          { categories: [{ name: " energy ", trackIds: ["b"] }] }
        ],
        "single"
      )
    ).toEqual({
      categories: [{ name: "Energy", description: undefined, trackIds: ["a", "b"] }]
    });
  });

  it("formats generated playlist names with a configurable prefix", () => {
    expect(formatPlaylistName("Splitify -", "Late Night")).toBe(
      "Splitify - Late Night"
    );
    expect(formatPlaylistName("", "Late Night")).toBe("Late Night");
  });
});
