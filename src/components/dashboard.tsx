"use client";

import {
  Check,
  ExternalLink,
  Loader2,
  Music2,
  Play,
  Save,
  Send,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Playlist = {
  id: string;
  name: string;
  imageUrl?: string;
  ownerName?: string;
  trackCount: number;
};

type Assignment = {
  id: string;
  trackId: string;
  trackUri: string;
  trackName: string;
  artists: string;
  album?: string;
  durationMs?: number;
  sourceOrder: number;
};

type SplitCategory = {
  id: string;
  name: string;
  description?: string;
  spotifyUrl?: string;
  assignments: Assignment[];
};

type SplitRun = {
  id: string;
  sourcePlaylistName: string;
  mode: "prompt" | "manual" | "both";
  duplicatePolicy: "single" | "overlap";
  playlistPrefix: string;
  visibility: "private" | "public";
  status: string;
  error?: string;
  categories: SplitCategory[];
};

type ApiError = {
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = (text ? JSON.parse(text) : {}) as T & ApiError;

  if (!response.ok) {
    throw new Error(payload.error ?? response.statusText ?? "Request failed.");
  }

  return payload;
}

export function Dashboard({ userName }: { userName?: string | null }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [mode, setMode] = useState<"prompt" | "manual" | "both">("both");
  const [duplicatePolicy, setDuplicatePolicy] = useState<"single" | "overlap">(
    "single"
  );
  const [playlistPrefix, setPlaylistPrefix] = useState("Splitify -");
  const [prompt, setPrompt] = useState(
    "Split this playlist into clear, useful listening moods."
  );
  const [manualCategories, setManualCategories] = useState(
    "Late Night\nEnergy\nOld School"
  );
  const [split, setSplit] = useState<SplitRun | null>(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [removingPlaylist, setRemovingPlaylist] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPlaylists() {
      try {
        const data = await readJson<{ playlists: Playlist[] }>(
          await fetch("/api/playlists")
        );

        if (!mounted) {
          return;
        }

        setPlaylists(data.playlists);
        setSelectedPlaylistId(data.playlists[0]?.id ?? "");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load.");
      } finally {
        if (mounted) {
          setLoadingPlaylists(false);
        }
      }
    }

    loadPlaylists();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId),
    [playlists, selectedPlaylistId]
  );

  const totalAssigned = useMemo(
    () =>
      split?.categories.reduce(
        (total, category) => total + category.assignments.length,
        0
      ) ?? 0,
    [split]
  );

  async function generateSplit() {
    if (!selectedPlaylist) {
      return;
    }

    setWorking(true);
    setMessage("Classifying with the AI agent...");

    try {
      const data = await readJson<{ split: SplitRun }>(
        await fetch("/api/splits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sourcePlaylistId: selectedPlaylist.id,
            sourcePlaylistName: selectedPlaylist.name,
            prompt,
            mode,
            duplicatePolicy,
            playlistPrefix,
            visibility: "private",
            manualCategories: manualCategories
              .split(/\r?\n|,/)
              .map((item) => item.trim())
              .filter(Boolean)
          })
        })
      );

      setSplit(data.split);
      setMessage("Preview ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to classify.");
    } finally {
      setWorking(false);
    }
  }

  async function removeSelectedPlaylist() {
    if (!selectedPlaylist) {
      return;
    }

    const confirmed = window.confirm(
      `Remove "${selectedPlaylist.name}" from your Spotify library?`
    );

    if (!confirmed) {
      return;
    }

    setRemovingPlaylist(true);
    setMessage("Removing playlist...");

    try {
      await readJson<{ ok: boolean }>(
        await fetch(`/api/playlists/${selectedPlaylist.id}`, {
          method: "DELETE"
        })
      );

      setPlaylists((current) => {
        const next = current.filter(
          (playlist) => playlist.id !== selectedPlaylist.id
        );
        setSelectedPlaylistId(next[0]?.id ?? "");
        return next;
      });
      setSplit(null);
      setMessage("Playlist removed from your library.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to remove playlist."
      );
    } finally {
      setRemovingPlaylist(false);
    }
  }

  function updateCategoryName(categoryId: string, name: string) {
    setSplit((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((category) =>
              category.id === categoryId ? { ...category, name } : category
            )
          }
        : current
    );
  }

  function moveAssignment(
    sourceCategoryId: string,
    assignmentId: string,
    targetCategoryId: string
  ) {
    if (sourceCategoryId === targetCategoryId) {
      return;
    }

    setSplit((current) => {
      if (!current) {
        return current;
      }

      const source = current.categories.find(
        (category) => category.id === sourceCategoryId
      );
      const assignment = source?.assignments.find((item) => item.id === assignmentId);

      if (!assignment) {
        return current;
      }

      return {
        ...current,
        categories: current.categories.map((category) => {
          if (category.id === sourceCategoryId) {
            return {
              ...category,
              assignments: category.assignments.filter(
                (item) => item.id !== assignmentId
              )
            };
          }

          if (category.id === targetCategoryId) {
            return {
              ...category,
              assignments: [...category.assignments, assignment]
            };
          }

          return category;
        })
      };
    });
  }

  function removeAssignment(categoryId: string, assignmentId: string) {
    setSplit((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((category) =>
              category.id === categoryId
                ? {
                    ...category,
                    assignments: category.assignments.filter(
                      (item) => item.id !== assignmentId
                    )
                  }
                : category
            )
          }
        : current
    );
  }

  async function savePreview() {
    if (!split) {
      return;
    }

    setSaving(true);
    setMessage("Saving preview...");

    try {
      const data = await readJson<{ split: SplitRun }>(
        await fetch(`/api/splits/${split.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            playlistPrefix,
            categories: split.categories.map((category) => ({
              name: category.name,
              description: category.description,
              trackIds: category.assignments.map((assignment) => assignment.trackId)
            }))
          })
        })
      );

      setSplit(data.split);
      setMessage("Preview saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function executeSplit() {
    if (!split) {
      return;
    }

    setExecuting(true);
    setMessage("Creating playlists in Spotify...");

    try {
      const data = await readJson<{ split: SplitRun }>(
        await fetch(`/api/splits/${split.id}/execute`, {
          method: "POST"
        })
      );

      setSplit(data.split);
      setMessage("Playlists created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to run.");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-[var(--accent-strong)]">
            Splitify
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-[var(--foreground)]">
            {userName ? `Hello, ${userName}` : "Dashboard"}
          </h1>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">
          {message ?? "Ready to split playlists."}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="h-fit rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Music2 aria-hidden="true" size={20} />
            New split
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">
              Source playlist
              <select
                className="focus-ring mt-2 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                disabled={loadingPlaylists || working}
                onChange={(event) => setSelectedPlaylistId(event.target.value)}
                value={selectedPlaylistId}
              >
                {loadingPlaylists ? (
                  <option>Loading...</option>
                ) : (
                  playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name} ({playlist.trackCount})
                    </option>
                  ))
                )}
              </select>
            </label>

            {selectedPlaylist ? (
              <div className="flex items-center gap-3 rounded-md border border-[var(--line)] bg-[#f9fbf8] p-3">
                <div
                  aria-hidden="true"
                  className="h-14 w-14 shrink-0 rounded-md bg-[var(--ink)] bg-cover bg-center"
                  style={{
                    backgroundImage: selectedPlaylist.imageUrl
                      ? `url(${selectedPlaylist.imageUrl})`
                      : undefined
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{selectedPlaylist.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {selectedPlaylist.trackCount} tracks
                  </p>
                </div>
                <button
                  className="focus-ring ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[#9b1c1c] transition hover:border-[#9b1c1c]"
                  disabled={working || removingPlaylist}
                  onClick={removeSelectedPlaylist}
                  title="Remove from library"
                  type="button"
                >
                  {removingPlaylist ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={16}
                    />
                  ) : (
                    <Trash2 aria-hidden="true" size={16} />
                  )}
                </button>
              </div>
            ) : null}

            <label className="block text-sm font-semibold">
              Mode
              <select
                className="focus-ring mt-2 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                onChange={(event) =>
                  setMode(event.target.value as "prompt" | "manual" | "both")
                }
                value={mode}
              >
                <option value="both">Prompt + categories</option>
                <option value="prompt">Prompt only</option>
                <option value="manual">Categories only</option>
              </select>
            </label>

            <label className="block text-sm font-semibold">
              Prompt
              <textarea
                className="focus-ring mt-2 min-h-24 w-full resize-y rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm leading-6"
                onChange={(event) => setPrompt(event.target.value)}
                value={prompt}
              />
            </label>

            <label className="block text-sm font-semibold">
              Categories
              <textarea
                className="focus-ring mt-2 min-h-24 w-full resize-y rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm leading-6"
                onChange={(event) => setManualCategories(event.target.value)}
                value={manualCategories}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label className="block text-sm font-semibold">
                Duplicates
                <select
                  className="focus-ring mt-2 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                  onChange={(event) =>
                    setDuplicatePolicy(event.target.value as "single" | "overlap")
                  }
                  value={duplicatePolicy}
                >
                  <option value="single">One playlist</option>
                  <option value="overlap">Allow overlap</option>
                </select>
              </label>

              <label className="block text-sm font-semibold">
                Prefix
                <input
                  className="focus-ring mt-2 h-11 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                  onChange={(event) => setPlaylistPrefix(event.target.value)}
                  value={playlistPrefix}
                />
              </label>
            </div>

            <button
              className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 font-semibold text-white transition hover:bg-[var(--accent-strong)]"
              disabled={!selectedPlaylist || working}
              onClick={generateSplit}
              type="button"
            >
              {working ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={18} />
              ) : (
                <Send aria-hidden="true" size={18} />
              )}
              Generate preview
            </button>
          </div>
        </aside>

        <section className="min-w-0 rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] pb-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-bold">Editable preview</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {split
                  ? `${split.categories.length} playlists, ${totalAssigned} assignments`
                  : "Generate a split to review the tracks."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold transition hover:border-[var(--accent)]"
                disabled={!split || saving || executing}
                onClick={savePreview}
                type="button"
              >
                {saving ? (
                  <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                ) : (
                  <Save aria-hidden="true" size={16} />
                )}
                Save
              </button>
              <button
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-md bg-[var(--ink)] px-3 text-sm font-semibold text-white transition hover:bg-[#18345c]"
                disabled={!split || executing || saving || split.status === "completed"}
                onClick={executeSplit}
                type="button"
              >
                {executing ? (
                  <Loader2 aria-hidden="true" className="animate-spin" size={16} />
                ) : split?.status === "completed" ? (
                  <Check aria-hidden="true" size={16} />
                ) : (
                  <Play aria-hidden="true" size={16} />
                )}
                Create
              </button>
            </div>
          </div>

          {!split ? (
            <div className="flex min-h-96 items-center justify-center rounded-md bg-[#f9fbf8] p-6 text-center text-sm text-[var(--muted)]">
              Select a playlist and generate the preview.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {split.categories.map((category) => (
                <article
                  className="rounded-md border border-[var(--line)] bg-[#fcfdfb]"
                  key={category.id}
                >
                  <div className="border-b border-[var(--line)] p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="focus-ring h-10 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-white px-3 font-semibold"
                        onChange={(event) =>
                          updateCategoryName(category.id, event.target.value)
                        }
                        value={category.name}
                      />
                      {category.spotifyUrl ? (
                        <a
                          className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink)]"
                          href={category.spotifyUrl}
                          rel="noreferrer"
                          target="_blank"
                          title="Open in Spotify"
                        >
                          <ExternalLink aria-hidden="true" size={18} />
                        </a>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {category.assignments.length} tracks
                    </p>
                  </div>

                  <div className="max-h-[520px] overflow-auto p-2">
                    {category.assignments.length === 0 ? (
                      <p className="p-3 text-sm text-[var(--muted)]">No tracks.</p>
                    ) : (
                      category.assignments.map((assignment) => (
                        <div
                          className="mb-2 grid gap-2 rounded-md border border-[var(--line)] bg-white p-2"
                          key={assignment.id}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {assignment.trackName}
                            </p>
                            <p className="truncate text-xs text-[var(--muted)]">
                              {assignment.artists}
                              {assignment.album ? ` - ${assignment.album}` : ""}
                            </p>
                          </div>

                          <div className="grid grid-cols-[1fr_40px] gap-2">
                            <select
                              className="focus-ring h-9 min-w-0 rounded-md border border-[var(--line)] bg-white px-2 text-xs"
                              onChange={(event) =>
                                moveAssignment(
                                  category.id,
                                  assignment.id,
                                  event.target.value
                                )
                              }
                              value={category.id}
                            >
                              {split.categories.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="focus-ring inline-flex h-9 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[#9b1c1c] transition hover:border-[#9b1c1c]"
                              onClick={() =>
                                removeAssignment(category.id, assignment.id)
                              }
                              title="Remove"
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
