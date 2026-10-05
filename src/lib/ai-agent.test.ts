import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyTracksWithAiAgent } from "@/lib/ai-agent";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Gemini configuration", () => {
  it("uses Flash Lite by default and sends the API key only in a header", async () => {
    vi.stubEnv("AI_AGENT_API_KEY", "test-private-key");
    vi.stubEnv("AI_AGENT_MODEL", "");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ categories: [{ name: "Rap", trackIds: ["a"] }] }) }] } }] })));
    vi.stubGlobal("fetch", request);
    const result = await classifyTracksWithAiAgent({ tracks: [{ id: "a", uri: "spotify:track:a", name: "Song", artists: ["Artist"], sourceOrder: 0 }], mode: "prompt", duplicatePolicy: "single", manualCategories: [] });
    expect(result.categories[0].trackIds).toEqual(["a"]);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("test-private-key");
    expect(init.redirect).toBe("error");
  });
  it("does not expose provider error bodies containing secrets", async () => {
    vi.stubEnv("AI_AGENT_API_KEY", "test-private-key");
    vi.stubEnv("AI_AGENT_MODEL", "gemini-3.5-flash-lite");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response("test-private-key", {status: 403}))));
    await expect(classifyTracksWithAiAgent({ tracks: [{ id: "a", uri: "spotify:track:a", name: "Song", artists: [], sourceOrder: 0 }], mode: "prompt", duplicatePolicy: "single", manualCategories: [] })).rejects.toThrow("403. Check model access");
  });
});
