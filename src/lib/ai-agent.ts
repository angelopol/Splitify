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
    album: track.album
  };
}

function buildSystemPrompt() {
  return [
    "You are Splitify, an expert music curator.",
    "Classify Spotify tracks into useful destination playlists.",
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

async function callAiProvider(prompt: string) {
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
          responseSchema
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

export async function classifyTracksWithAiAgent(
  input: ClassifyInput
): Promise<ClassificationResult> {
  if (input.tracks.length === 0) {
    throw new Error("The selected playlist has no usable tracks.");
  }

  const chunks = chunkItems(input.tracks, TRACKS_PER_CHUNK);
  const chunkResults: ClassificationResult[] = [];

  for (const tracks of chunks) {
    chunkResults.push(await classifyChunk(input, tracks));
  }

  return mergeClassificationResults(chunkResults, input.duplicatePolicy);
}
