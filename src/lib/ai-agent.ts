import { z } from "zod";

import {
  chunkItems,
  type ClassificationResult,
  type DuplicatePolicy,
  mergeClassificationResults,
  type NormalizedTrack,
  type SplitMode,
  validateClassificationResult
} from "@/lib/split-plan";

const AI_AGENT_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TRACKS_PER_CHUNK = 150;

type ClassifyInput = {
  tracks: NormalizedTrack[];
  prompt?: string;
  mode: SplitMode;
  duplicatePolicy: DuplicatePolicy;
  manualCategories: string[];
  maxRepeatsPerTrack?: number | null;
  maxTracksPerPlaylist?: number | null;
  maxPlaylists?: number | null;
  knownCategories?: string[];
  onProgress?: (chunksDone: number, chunksTotal: number) => void;
};

const responseSchema = {
  type: "object",
  properties: {
    categories: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          trackIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1
          }
        },
        required: ["name", "trackIds"]
      }
    }
  },
  required: ["categories"]
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function compactTrack(track: NormalizedTrack) {
  return {
    id: track.id,
    title: track.name,
    artists: track.artists,
    album: track.album,
    genres: track.genres && track.genres.length > 0 ? track.genres : undefined
  };
}

function buildSystemPrompt() {
  return [
    "You are Splitify, an expert music curator.",
    "Classify Spotify tracks into useful destination playlists.",
    "Prefer fewer, larger, cohesive playlists over many tiny ones.",
    "One concept means one category: never create near-duplicate categories",
    "such as 'Hip Hop & Rap' next to 'Rap & Hip Hop Hits'.",
    "When knownCategories are provided, reuse those exact names whenever a",
    "track fits one; only create a new category when nothing fits.",
    "Never create vague catch-all categories like 'Mixed', 'Misc' or 'Various'.",
    "When tracks include a genres field, trust it over guesses from the title.",
    "Return only valid JSON matching the provided schema.",
    "Use track IDs exactly as provided; never invent IDs.",
    "Do not mention songs that are not in the input."
  ].join(" ");
}

function buildUserPrompt(input: Omit<ClassifyInput, "tracks">, tracks: NormalizedTrack[]) {
  return JSON.stringify({
    task: "Classify this Spotify playlist chunk.",
    rules: {
      mode: input.mode,
      userPrompt: input.prompt ?? "",
      manualCategories: input.manualCategories,
      duplicatePolicy: input.duplicatePolicy,
      allowTrackOverlap: input.duplicatePolicy === "overlap",
      maxPlaylistsPerTrack: input.maxRepeatsPerTrack ?? "unlimited",
      maxTracksPerPlaylist: input.maxTracksPerPlaylist ?? "unlimited",
      maxTotalPlaylists: input.maxPlaylists ?? "no hard limit",
      knownCategories: input.knownCategories ?? [],
      categoryGuidance:
        input.mode === "manual"
          ? "Use only the manual categories."
          : input.mode === "both"
            ? "Prefer the manual categories, but use the prompt to refine names and assignments."
            : "Create category names from the prompt and track metadata."
    },
    tracks: tracks.map(compactTrack)
  });
}

async function callAiProvider(
  prompt: string,
  schema: Record<string, unknown> = responseSchema
) {
  const apiKey = requiredEnv("AI_AGENT_API_KEY");
  const model = requiredEnv("AI_AGENT_MODEL");
  const response = await fetch(
    `${AI_AGENT_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildSystemPrompt() }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI agent request failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("The AI agent returned an empty response.");
  }

  return JSON.parse(text) as unknown;
}

async function classifyChunk(input: ClassifyInput, tracks: NormalizedTrack[]) {
  const prompt = buildUserPrompt(input, tracks);

  try {
    return validateClassificationResult(
      await callAiProvider(prompt),
      tracks,
      input.duplicatePolicy
    );
  } catch (error) {
    const repairPrompt = JSON.stringify({
      repair: true,
      previousError: error instanceof Error ? error.message : "Unknown error",
      instruction:
        "Return a corrected JSON object. Use only provided track IDs and the schema.",
      originalInput: JSON.parse(prompt)
    });

    return validateClassificationResult(
      await callAiProvider(repairPrompt),
      tracks,
      input.duplicatePolicy
    );
  }
}

const consolidationSchema = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          sourceCategories: {
            type: "array",
            items: { type: "string" },
            minItems: 1
          }
        },
        required: ["name", "sourceCategories"]
      }
    }
  },
  required: ["groups"]
};

const consolidationResultSchema = z.object({
  groups: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        sourceCategories: z.array(z.string().trim().min(1)).min(1)
      })
    )
    .min(1)
});

export type ConsolidationGroup = {
  name: string;
  sourceCategories: string[];
};

export async function consolidateCategoriesWithAiAgent(input: {
  categories: { name: string; description?: string; trackCount: number }[];
  maxPlaylists?: number | null;
  userPrompt?: string | null;
}): Promise<ConsolidationGroup[]> {
  const prompt = JSON.stringify({
    task: "Merge near-duplicate or overlapping playlist categories into fewer, coherent ones.",
    rules: {
      guidance: [
        "Group categories that describe the same or a very similar concept.",
        "Keep genuinely distinct genres, moods or eras separate.",
        "Small categories (under ~30 tracks) should be merged into the closest bigger concept.",
        "Give each group a clear, concise name.",
        "Every input category must appear in exactly one group.",
        "Never name a group 'Mixed', 'Misc' or 'Various'."
      ],
      maxTotalPlaylists: input.maxPlaylists ?? "no hard limit",
      userPrompt: input.userPrompt ?? ""
    },
    categories: input.categories
  });

  const raw = await callAiProvider(prompt, consolidationSchema);
  const parsed = consolidationResultSchema.parse(raw);

  const validNames = new Map(
    input.categories.map((category) => [
      category.name.toLocaleLowerCase(),
      category.name
    ])
  );
  const claimed = new Set<string>();
  const groups: ConsolidationGroup[] = [];

  for (const group of parsed.groups) {
    const sources: string[] = [];

    for (const source of group.sourceCategories) {
      const canonical = validNames.get(source.toLocaleLowerCase());
      if (canonical && !claimed.has(canonical)) {
        claimed.add(canonical);
        sources.push(canonical);
      }
    }

    if (sources.length > 0) {
      groups.push({ name: group.name.trim(), sourceCategories: sources });
    }
  }

  // Any category the model forgot stays as its own group.
  for (const category of input.categories) {
    if (!claimed.has(category.name)) {
      groups.push({ name: category.name, sourceCategories: [category.name] });
    }
  }

  return groups;
}

export async function classifyTracksWithAiAgent(
  input: ClassifyInput
): Promise<ClassificationResult> {
  if (input.tracks.length === 0) {
    throw new Error("The selected playlist has no usable tracks.");
  }

  const chunks = chunkItems(input.tracks, TRACKS_PER_CHUNK);
  const chunkResults: ClassificationResult[] = [];

  input.onProgress?.(0, chunks.length);

  // Later chunks see the category names created so far, so the agent reuses
  // them instead of inventing ten variations of the same concept.
  const knownCategories: string[] = [...(input.knownCategories ?? [])];
  const knownKeys = new Set(
    knownCategories.map((name) => name.toLocaleLowerCase())
  );

  for (const [index, tracks] of chunks.entries()) {
    const result = await classifyChunk({ ...input, knownCategories }, tracks);
    chunkResults.push(result);

    for (const category of result.categories) {
      const key = category.name.toLocaleLowerCase();
      if (!knownKeys.has(key)) {
        knownKeys.add(key);
        knownCategories.push(category.name);
      }
    }

    input.onProgress?.(index + 1, chunks.length);
  }

  return mergeClassificationResults(chunkResults, input.duplicatePolicy);
}
