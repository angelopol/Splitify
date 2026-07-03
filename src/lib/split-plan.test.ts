import { describe, expect, it } from "vitest";

import {
  chunkItems,
  formatPlaylistName,
  mergeClassificationResults,
  parseManualCategories,
  validateClassificationResult,
  type NormalizedTrack
} from "@/lib/split-plan";

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
