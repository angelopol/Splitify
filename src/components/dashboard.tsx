"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  FolderPlus,
  Layers,
  GripVertical,
  Info,
  Loader2,
  Music2,
  Play,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  trackMetadata?: string;
};

type SavedSplit = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  categories: number;
  tracks: number;
};

type SummaryData = {
  totalTracks: number;
  totals: Record<string, number>;
  albums: { name: string; tracks: number; refined: number; viaAlbum: number }[];
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

type Toast = {
  id: number;
  tone: "info" | "success" | "error";
  text: string;
};

type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "accent";
  onConfirm: () => void;
};

const PROMPT_PRESETS = [
  "Split by mood: chill, energy, melancholic, party.",
  "Group by decade and era.",
  "Separate by genre as precisely as possible.",
  "Workout, focus, and wind-down playlists.",
  "Road trip chapters: departure, highway, night drive."
];

const CATEGORY_COLORS = [
  "#1db954",
  "#4f8ef7",
  "#e8a13c",
  "#e05fa0",
  "#8b5cf6",
  "#2dd4bf",
  "#f87171",
  "#facc15"
];

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = (text ? JSON.parse(text) : {}) as T & ApiError;

  if (!response.ok) {
    throw new Error(payload.error ?? response.statusText ?? "Request failed.");
  }

  return payload;
}

function formatDuration(totalMs: number) {
  const minutes = Math.round(totalMs / 60000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function ToastStack({
  toasts,
  dismiss
}: {
  toasts: Toast[];
  dismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          className="rise pointer-events-auto flex items-start gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-sm shadow-xl"
          key={toast.id}
          role="status"
        >
          {toast.tone === "success" ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--accent-strong)]"
              size={16}
            />
          ) : toast.tone === "error" ? (
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--danger)]"
              size={16}
            />
          ) : (
            <Info
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#4f8ef7]"
              size={16}
            />
          )}
          <p className="min-w-0 flex-1 leading-5">{toast.text}</p>
          <button
            className="focus-ring shrink-0 text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={() => dismiss(toast.id)}
            title="Dismiss"
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({
  request,
  close
}: {
  request: ConfirmRequest | null;
  close: () => void;
}) {
  useEffect(() => {
    if (!request) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request, close]);

  if (!request) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={close}
      role="dialog"
    >
      <div
        className="rise w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
              request.tone === "danger"
                ? "bg-[rgba(255,107,107,0.12)] text-[var(--danger)]"
                : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
            }`}
          >
            <AlertCircle aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold">{request.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              {request.message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            autoFocus
            className="focus-ring inline-flex h-10 items-center rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted)] transition hover:border-[#3a4740] hover:text-[var(--foreground)]"
            onClick={close}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`focus-ring inline-flex h-10 items-center rounded-full px-4 text-sm font-bold transition ${
              request.tone === "danger"
                ? "bg-[var(--danger)] text-[#1c0808] hover:brightness-110"
                : "bg-[var(--accent)] text-[#04140a] hover:bg-[var(--accent-strong)]"
            }`}
            onClick={() => {
              close();
              request.onConfirm();
            }}
            type="button"
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ userName }: { userName?: string | null }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistQuery, setPlaylistQuery] = useState("");
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"prompt" | "manual" | "both">("both");
  const [duplicatePolicy, setDuplicatePolicy] = useState<"single" | "overlap">(
    "single"
  );
  const [playlistPrefix, setPlaylistPrefix] = useState("Splitify -");
  const [maxRepeats, setMaxRepeats] = useState("3");
  const [unlimitedRepeats, setUnlimitedRepeats] = useState(false);
  const [maxPerPlaylist, setMaxPerPlaylist] = useState("");
  const [minPerPlaylist, setMinPerPlaylist] = useState("");
  const [maxPlaylists, setMaxPlaylists] = useState("10");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [progress, setProgress] = useState<{
    message: string;
    current?: number;
    total?: number;
  } | null>(null);
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [moveMenu, setMoveMenu] = useState<{
    categoryId: string;
    assignmentId: string;
    right: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importSource, setImportSource] = useState<"local" | "playlists">(
    "local"
  );
  const [importing, setImporting] = useState(false);
  const [savedSplits, setSavedSplits] = useState<SavedSplit[]>([]);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const importId = useRef(0);

  async function loadSavedSplits() {
    try {
      const data = await readJson<{ splits: SavedSplit[] }>(
        await fetch("/api/splits")
      );
      setSavedSplits(data.splits);
    } catch {
      // The saved list is never blocking.
    }
  }

  async function resumeSplit(id: string) {
    setResumingId(id);

    try {
      const data = await readJson<{ split: SplitRun }>(
        await fetch(`/api/splits/${id}`)
      );
      setSplit(data.split);
      setDirty(false);
      setTrackFilter("");
      setVisibleCounts({});
      setMoveMenu(null);
      setMergeMode(false);
      setMergeSelect([]);
      goToStep(2);
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Unable to load the split."
      );
    } finally {
      setResumingId(null);
    }
  }

  function requestDeleteSaved(saved: SavedSplit) {
    setConfirmRequest({
      title: "Delete saved split",
      message: `Delete the saved split for "${saved.name}" (${saved.categories} playlists)? Playlists already created in Spotify are not affected.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        try {
          await readJson<{ ok: boolean }>(
            await fetch(`/api/splits/${saved.id}`, { method: "DELETE" })
          );
          setSavedSplits((current) =>
            current.filter((item) => item.id !== saved.id)
          );
          if (split?.id === saved.id) {
            setSplit(null);
            setDirty(false);
          }
          notify("success", "Saved split deleted.");
        } catch (error) {
          notify(
            "error",
            error instanceof Error ? error.message : "Unable to delete."
          );
        }
      }
    });
  }
  const [merging, setMerging] = useState(false);
  const [planText, setPlanText] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelect, setMergeSelect] = useState<string[]>([]);
  const [regroupHint, setRegroupHint] = useState("");
  const [regroupCount, setRegroupCount] = useState("");
  const [regrouping, setRegrouping] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0]);
  const [manualCategories, setManualCategories] = useState(
    "Late Night\nEnergy\nOld School"
  );
  const [split, setSplit] = useState<SplitRun | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [removingPlaylist, setRemovingPlaylist] = useState(false);
  const [trackFilter, setTrackFilter] = useState("");
  const [dragging, setDragging] = useState<{
    assignmentId: string;
    sourceCategoryId: string;
  } | null>(null);
  const [dropCategoryId, setDropCategoryId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null
  );
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const toastId = useRef(0);
  const localCategoryId = useRef(0);

  function goToStep(next: number) {
    setDirection(next >= step ? "forward" : "back");
    setStep(next);
  }

  function restart() {
    setSplit(null);
    setDirty(false);
    setTrackFilter("");
    setPlaylistQuery("");
    goToStep(0);
  }

  function notify(tone: Toast["tone"], text: string) {
    const id = ++toastId.current;
    setToasts((current) => [...current.slice(-3), { id, tone, text }]);
    setTimeout(
      () => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      },
      tone === "error" ? 15000 : 5000
    );
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

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
      } catch (error) {
        if (mounted) {
          notify(
            "error",
            error instanceof Error ? error.message : "Unable to load playlists."
          );
        }
      } finally {
        if (mounted) {
          setLoadingPlaylists(false);
        }
      }
    }

    async function loadSaved() {
      try {
        const data = await readJson<{ splits: SavedSplit[] }>(
          await fetch("/api/splits")
        );
        if (mounted) {
          setSavedSplits(data.splits);
        }
      } catch {
        // The saved list is never blocking.
      }
    }

    loadPlaylists();
    loadSaved();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedPlaylists = useMemo(
    () =>
      selectedPlaylistIds
        .map((id) => playlists.find((playlist) => playlist.id === id))
        .filter((playlist): playlist is Playlist => Boolean(playlist)),
    [playlists, selectedPlaylistIds]
  );

  function togglePlaylist(id: string) {
    setSelectedPlaylistIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  const visiblePlaylists = useMemo(() => {
    const query = playlistQuery.trim().toLowerCase();
    if (!query) {
      return playlists;
    }
    return playlists.filter((playlist) =>
      playlist.name.toLowerCase().includes(query)
    );
  }, [playlists, playlistQuery]);

  const totalAssigned =
    split?.categories.reduce(
      (total, category) => total + category.assignments.length,
      0
    ) ?? 0;

  const isLocked = split?.status === "executing" || split?.status === "completed";

  function markDirty() {
    setDirty(true);
  }

  async function generateSplit() {
    if (selectedPlaylists.length === 0) {
      return;
    }

    setWorking(true);
    setProgress({ message: "Starting…" });

    const progressToken = crypto.randomUUID();
    const poller = setInterval(async () => {
      try {
        const data = await readJson<{
          progress: { message: string; current?: number; total?: number } | null;
        }>(await fetch(`/api/splits/progress?token=${progressToken}`));

        if (data.progress) {
          setProgress(data.progress);
        }
      } catch {
        // Polling errors are never fatal.
      }
    }, 1500);

    try {
      const data = await readJson<{ split: SplitRun; warnings?: string[] }>(
        await fetch("/api/splits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sourcePlaylists: selectedPlaylists.map((playlist) => ({
              id: playlist.id,
              name: playlist.name
            })),
            prompt,
            mode,
            duplicatePolicy,
            playlistPrefix,
            visibility: "private",
            manualCategories: manualCategories
              .split(/\r?\n|,/)
              .map((item) => item.trim())
              .filter(Boolean),
            maxRepeatsPerTrack: unlimitedRepeats
              ? null
              : Math.max(1, Number.parseInt(maxRepeats, 10) || 3),
            maxTracksPerPlaylist:
              Number.parseInt(maxPerPlaylist, 10) > 0
                ? Number.parseInt(maxPerPlaylist, 10)
                : null,
            maxPlaylists:
              Number.parseInt(maxPlaylists, 10) > 0
                ? Number.parseInt(maxPlaylists, 10)
                : null,
            minTracksPerPlaylist:
              Number.parseInt(minPerPlaylist, 10) > 0
                ? Number.parseInt(minPerPlaylist, 10)
                : null,
            progressToken
          })
        })
      );

      setSplit(data.split);
      setDirty(false);
      setTrackFilter("");
      setVisibleCounts({});
      setMoveMenu(null);
      notify(
        "success",
        `Preview ready: ${data.split.categories.length} playlists proposed.`
      );
      for (const warning of data.warnings ?? []) {
        notify("error", warning);
      }
      loadSavedSplits();
      goToStep(2);
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Unable to classify."
      );
    } finally {
      clearInterval(poller);
      setProgress(null);
      setWorking(false);
    }
  }

  function requestRemovePlaylists(targets: Playlist[]) {
    if (targets.length === 0) {
      return;
    }

    setConfirmRequest({
      title: targets.length === 1 ? "Remove playlist" : "Remove playlists",
      message:
        targets.length === 1
          ? `Remove "${targets[0].name}" from your Spotify library? You can re-follow it later only if someone else owns it.`
          : `Remove these ${targets.length} playlists from your Spotify library? ${targets
              .map((playlist) => `"${playlist.name}"`)
              .join(", ")}.`,
      confirmLabel: targets.length === 1 ? "Remove" : `Remove ${targets.length}`,
      tone: "danger",
      onConfirm: () => removePlaylists(targets)
    });
  }

  async function removePlaylists(targets: Playlist[]) {
    setRemovingPlaylist(true);

    const removedIds: string[] = [];
    const failed: string[] = [];

    for (const playlist of targets) {
      try {
        await readJson<{ ok: boolean }>(
          await fetch(`/api/playlists/${playlist.id}`, {
            method: "DELETE"
          })
        );
        removedIds.push(playlist.id);
      } catch {
        failed.push(playlist.name);
      }
    }

    if (removedIds.length > 0) {
      setPlaylists((current) =>
        current.filter((item) => !removedIds.includes(item.id))
      );
      setSelectedPlaylistIds((current) =>
        current.filter((id) => !removedIds.includes(id))
      );
      notify(
        "success",
        removedIds.length === 1
          ? "Playlist removed from your library."
          : `${removedIds.length} playlists removed from your library.`
      );
    }

    if (failed.length > 0) {
      notify("error", `Could not remove: ${failed.join(", ")}.`);
    }

    setRemovingPlaylist(false);
  }

  function updateCategoryName(categoryId: string, name: string) {
    markDirty();
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

    markDirty();
    setSplit((current) => {
      if (!current) {
        return current;
      }

      const source = current.categories.find(
        (category) => category.id === sourceCategoryId
      );
      const assignment = source?.assignments.find(
        (item) => item.id === assignmentId
      );

      if (!assignment) {
        return current;
      }

      const target = current.categories.find(
        (category) => category.id === targetCategoryId
      );
      const duplicate = target?.assignments.some(
        (item) => item.trackId === assignment.trackId
      );

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

          if (category.id === targetCategoryId && !duplicate) {
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
    markDirty();
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

  function addCategory() {
    markDirty();
    const id = `local-${++localCategoryId.current}`;
    setSplit((current) =>
      current
        ? {
            ...current,
            categories: [
              ...current.categories,
              {
                id,
                name: `New playlist ${current.categories.length + 1}`,
                assignments: []
              }
            ]
          }
        : current
    );
  }

  function deleteCategory(categoryId: string) {
    markDirty();
    setSplit((current) =>
      current
        ? {
            ...current,
            categories: current.categories.filter(
              (item) => item.id !== categoryId
            )
          }
        : current
    );
  }

  function removeCategory(categoryId: string) {
    const category = split?.categories.find((item) => item.id === categoryId);
    if (!category || !split) {
      return;
    }

    if (split.categories.length <= 1) {
      notify("error", "You need at least one playlist in the plan.");
      return;
    }

    if (category.assignments.length > 0) {
      setConfirmRequest({
        title: "Delete playlist from plan",
        message: `Delete "${category.name}" and drop its ${category.assignments.length} tracks from the plan? The songs stay in your source playlist.`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm: () => deleteCategory(categoryId)
      });
      return;
    }

    deleteCategory(categoryId);
  }

  async function savePreview() {
    if (!split) {
      return;
    }

    setSaving(true);

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
              trackIds: category.assignments.map(
                (assignment) => assignment.trackId
              )
            }))
          })
        })
      );

      setSplit(data.split);
      setDirty(false);
      notify("success", "Preview saved.");
      return data.split;
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to save.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function mergeSimilar() {
    if (!split) {
      return;
    }

    if (dirty) {
      const saved = await savePreview();
      if (!saved) {
        return;
      }
    }

    setMerging(true);
    notify("info", "Asking the agent to merge similar playlists…");

    try {
      const data = await readJson<{ split: SplitRun }>(
        await fetch(`/api/splits/${split.id}/consolidate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            minTracksPerPlaylist:
              Number.parseInt(minPerPlaylist, 10) > 0
                ? Number.parseInt(minPerPlaylist, 10)
                : null
          })
        })
      );

      const before = split.categories.length;
      setSplit(data.split);
      setDirty(false);
      setVisibleCounts({});
      setMoveMenu(null);
      notify(
        "success",
        `Merged ${before} playlists into ${data.split.categories.length}.`
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Unable to merge playlists."
      );
    } finally {
      setMerging(false);
    }
  }

  function toggleMergeSelection(categoryId: string) {
    setMergeSelect((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  }

  function mergeSelectedCategories() {
    if (!split || mergeSelect.length < 2) {
      return;
    }

    const selectedSet = new Set(mergeSelect);
    // Target keeps the name of the first selected playlist (plan order).
    const ordered = split.categories.filter((category) =>
      selectedSet.has(category.id)
    );
    const target = ordered[0];
    const seenTrackIds = new Set(
      target.assignments.map((assignment) => assignment.trackId)
    );
    const mergedAssignments = [...target.assignments];

    for (const category of ordered.slice(1)) {
      for (const assignment of category.assignments) {
        if (!seenTrackIds.has(assignment.trackId)) {
          seenTrackIds.add(assignment.trackId);
          mergedAssignments.push(assignment);
        }
      }
    }

    markDirty();
    setSplit((current) =>
      current
        ? {
            ...current,
            categories: current.categories
              .filter(
                (category) =>
                  category.id === target.id || !selectedSet.has(category.id)
              )
              .map((category) =>
                category.id === target.id
                  ? { ...category, assignments: mergedAssignments }
                  : category
              )
          }
        : current
    );
    setMergeSelect([]);
    setMergeMode(false);
    setVisibleCounts({});
    notify(
      "success",
      `Merged ${ordered.length} playlists into "${target.name}".`
    );
  }

  function openSummary() {
    if (!split) {
      return;
    }

    // Computed lazily on open; parses trackMetadata only here.
    const totals: Record<string, number> = {
      track: 0,
      album: 0,
      "artist-spotify": 0,
      "artist-lastfm": 0,
      none: 0
    };
    const albums = new Map<
      string,
      { tracks: number; refined: number; viaAlbum: number }
    >();
    const seenTrackIds = new Set<string>();

    for (const category of split.categories) {
      for (const assignment of category.assignments) {
        if (seenTrackIds.has(assignment.trackId)) {
          continue;
        }
        seenTrackIds.add(assignment.trackId);

        let source = "none";
        let albumName = assignment.album ?? "";

        if (assignment.trackMetadata) {
          try {
            const metadata = JSON.parse(assignment.trackMetadata) as {
              genreSource?: string;
              album?: string;
              genres?: string[];
            };
            source = metadata.genreSource ?? (metadata.genres?.length ? "track" : "none");
            albumName = metadata.album ?? albumName;
          } catch {
            // Ignore bad metadata.
          }
        }

        totals[source] = (totals[source] ?? 0) + 1;

        if (albumName) {
          const entry = albums.get(albumName) ?? {
            tracks: 0,
            refined: 0,
            viaAlbum: 0
          };
          entry.tracks += 1;
          if (source === "track") {
            entry.refined += 1;
          }
          if (source === "album") {
            entry.viaAlbum += 1;
          }
          albums.set(albumName, entry);
        }
      }
    }

    setSummary({
      totalTracks: seenTrackIds.size,
      totals,
      albums: Array.from(albums.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.tracks - a.tracks)
    });
  }

  async function regroupSelected(targetCount?: number) {
    if (!split || mergeSelect.length < 2) {
      return;
    }

    // Saving recreates every category with new ids, so remember the
    // selection by position and remap it after the save.
    let categoryIds = mergeSelect;

    if (dirty) {
      const selectedIndexes = split.categories
        .map((category, index) => ({ id: category.id, index }))
        .filter((entry) => mergeSelect.includes(entry.id))
        .map((entry) => entry.index);

      const saved = await savePreview();
      if (!saved) {
        return;
      }

      categoryIds = selectedIndexes
        .map((index) => saved.categories[index]?.id)
        .filter((id): id is string => Boolean(id));

      if (categoryIds.length < 2) {
        notify(
          "error",
          "The selection was lost while saving — please reselect the playlists."
        );
        setMergeSelect([]);
        return;
      }

      setMergeSelect(categoryIds);
    }

    setRegrouping(true);
    notify(
      "info",
      `Refreshing song genres and regrouping ${mergeSelect.length} playlists — this can take a while…`
    );

    try {
      const data = await readJson<{ split: SplitRun; warnings?: string[] }>(
        await fetch(`/api/splits/${split.id}/regroup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            categoryIds,
            hint: regroupHint.trim() || undefined,
            targetCount
          })
        })
      );

      setSplit(data.split);
      setDirty(false);
      setVisibleCounts({});
      setMergeSelect([]);
      setMergeMode(false);
      setRegroupHint("");
      notify("success", "Playlists regrouped with freshly resolved genres.");
      for (const warning of data.warnings ?? []) {
        notify("error", warning);
      }
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Unable to regroup."
      );
    } finally {
      setRegrouping(false);
    }
  }

  async function importFromPlaylists() {
    if (selectedPlaylists.length === 0) {
      return;
    }

    setImporting(true);
    notify(
      "info",
      `Reading ${selectedPlaylists.length} playlist(s) and matching the pasted plan…`
    );

    try {
      const data = await readJson<{ split: SplitRun; unmatched: number }>(
        await fetch("/api/splits/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sourcePlaylists: selectedPlaylists.map((playlist) => ({
              id: playlist.id,
              name: playlist.name
            })),
            text: importText,
            playlistPrefix
          })
        })
      );

      setSplit(data.split);
      setDirty(false);
      setTrackFilter("");
      setVisibleCounts({});
      setMoveMenu(null);
      setImportOpen(false);
      setImportText("");
      notify(
        data.unmatched > 0 ? "error" : "success",
        `Imported ${data.split.categories.length} playlists from text.${
          data.unmatched > 0
            ? ` ${data.unmatched} lines didn't match any track in the selected playlists.`
            : ""
        }`
      );
      loadSavedSplits();
      goToStep(2);
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Unable to import the plan."
      );
    } finally {
      setImporting(false);
    }
  }

  function importPlanFromText() {
    if (importSource === "playlists") {
      void importFromPlaylists();
      return;
    }

    if (!split) {
      return;
    }

    // Match "- Track — Artists" lines against the current split's tracks.
    const byLine = new Map<string, Assignment>();
    for (const category of split.categories) {
      for (const assignment of category.assignments) {
        const key = `${assignment.trackName} — ${assignment.artists}`
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (!byLine.has(key)) {
          byLine.set(key, assignment);
        }
      }
    }

    const categories: SplitCategory[] = [];
    let current: SplitCategory | null = null;
    let unmatched = 0;
    let duplicates = 0;
    const usedTrackIds = new Set<string>();
    const enforceSingle = split.duplicatePolicy === "single";

    for (const raw of importText.split(/\r?\n/)) {
      const line = raw.trim();

      const header = line.match(/^##\s+(.+?)\s*(?:\(\d+\))?\s*$/);
      if (header) {
        current = {
          id: `local-import-${++importId.current}`,
          name: header[1],
          assignments: []
        };
        categories.push(current);
        continue;
      }

      const item = line.match(/^-\s+(.+)$/);
      if (item && current) {
        const key = item[1].toLowerCase().replace(/\s+/g, " ").trim();
        const found = byLine.get(key);

        if (!found) {
          unmatched += 1;
          continue;
        }

        if (enforceSingle && usedTrackIds.has(found.trackId)) {
          duplicates += 1;
          continue;
        }
        usedTrackIds.add(found.trackId);

        current.assignments.push({
          ...found,
          id: `local-a-${++importId.current}`
        });
      }
    }

    if (categories.length === 0) {
      notify(
        "error",
        "No playlists found — expected lines like “## Playlist name” followed by “- Track — Artists”."
      );
      return;
    }

    markDirty();
    setSplit({ ...split, categories });
    setVisibleCounts({});
    setMoveMenu(null);
    setImportOpen(false);
    setImportText("");

    const notes: string[] = [];
    if (unmatched > 0) {
      notes.push(`${unmatched} lines didn't match any track and were skipped`);
    }
    if (duplicates > 0) {
      notes.push(`${duplicates} duplicate tracks skipped (single policy)`);
    }
    notify(
      notes.length > 0 ? "error" : "success",
      `Imported ${categories.length} playlists from text.${
        notes.length > 0 ? ` ${notes.join("; ")}.` : ""
      }`
    );
  }

  function openPlanText() {
    if (!split) {
      return;
    }

    // Generated lazily on open so big plans don't slow the normal render.
    const lines: string[] = [
      `${split.sourcePlaylistName} — ${split.categories.length} playlists, ${totalAssigned} tracks`,
      ""
    ];

    for (const category of split.categories) {
      lines.push(`## ${category.name} (${category.assignments.length})`);
      for (const assignment of category.assignments) {
        lines.push(`- ${assignment.trackName} — ${assignment.artists}`);
      }
      lines.push("");
    }

    setPlanText(lines.join("\n"));
  }

  async function executeSplit() {
    if (!split) {
      return;
    }

    if (dirty) {
      const saved = await savePreview();
      if (!saved) {
        return;
      }
    }

    setExecuting(true);
    notify("info", "Creating playlists in Spotify…");

    try {
      const data = await readJson<{ split: SplitRun }>(
        await fetch(`/api/splits/${split.id}/execute`, {
          method: "POST"
        })
      );

      setSplit(data.split);
      notify(
        "success",
        `Done — ${data.split.categories.length} playlists created in Spotify.`
      );
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to run.");
    } finally {
      setExecuting(false);
    }
  }

  function categoryColor(index: number) {
    return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
  }

  const filter = trackFilter.trim().toLowerCase();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <ToastStack dismiss={dismissToast} toasts={toasts} />

      {step === 2 &&
      split &&
      !mergeMode &&
      !isLocked &&
      split.categories.length >= 2 ? (
        <button
          className="focus-ring fixed bottom-4 left-1/2 z-40 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--panel-soft)] px-6 font-bold text-[var(--accent-strong)] shadow-[0_8px_40px_rgba(0,0,0,0.6)] transition hover:bg-[var(--accent)] hover:text-[#04140a]"
          disabled={saving || executing || merging || regrouping}
          onClick={() => {
            setMergeMode(true);
            setMergeSelect([]);
          }}
          type="button"
        >
          <Check aria-hidden="true" size={16} />
          Select &amp; merge
        </button>
      ) : null}
      {moveMenu ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-10"
          onClick={() => setMoveMenu(null)}
        />
      ) : null}
      <ConfirmDialog
        close={() => setConfirmRequest(null)}
        request={confirmRequest}
      />

      {summary !== null ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setSummary(null)}
          role="dialog"
        >
          <div
            className="rise flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--line)] p-4">
              <Info
                aria-hidden="true"
                className="text-[var(--accent-strong)]"
                size={18}
              />
              <h3 className="min-w-0 flex-1 truncate text-lg font-bold">
                Genre analysis summary
              </h3>
              <button
                className="focus-ring rounded-full p-1.5 text-[var(--muted)] transition hover:text-[var(--foreground)]"
                onClick={() => setSummary(null)}
                title="Close"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    ["track", "Song tags"],
                    ["album", "Album tags"],
                    ["artist-spotify", "Artist (Spotify)"],
                    ["artist-lastfm", "Artist (Last.fm)"],
                    ["none", "No genre"]
                  ] as const
                ).map(([key, label]) => (
                  <div
                    className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-center"
                    key={key}
                  >
                    <p className="text-xl font-black">
                      {summary.totals[key] ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                {summary.totalTracks} unique tracks · genre priority: song tags
                &gt; album tags &gt; artist genres. &ldquo;Refined&rdquo; songs
                were looked up individually on top of their album&rsquo;s tags.
              </p>

              <h4 className="mt-5 text-sm font-bold">
                Albums detected ({summary.albums.length})
              </h4>
              <div className="mt-2 space-y-1">
                {summary.albums.map((album) => (
                  <div
                    className="flex items-center gap-3 rounded-lg bg-[var(--panel)] px-3 py-2 text-sm"
                    key={album.name}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {album.name}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {album.tracks} tracks · {album.viaAlbum} via album ·{" "}
                      {album.refined} refined
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setImportOpen(false)}
          role="dialog"
        >
          <div
            className="rise flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--line)] p-4">
              <Upload
                aria-hidden="true"
                className="text-[var(--accent-strong)]"
                size={18}
              />
              <h3 className="min-w-0 flex-1 truncate text-lg font-bold">
                Import plan from text
              </h3>
              <button
                className="focus-ring rounded-full p-1.5 text-[var(--muted)] transition hover:text-[var(--foreground)]"
                onClick={() => setImportOpen(false)}
                title="Close"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
              <p className="text-sm text-[var(--muted)]">
                Paste a plan in the &ldquo;As text&rdquo; format —{" "}
                <code className="rounded bg-[var(--panel)] px-1">
                  ## Playlist (n)
                </code>{" "}
                headers followed by{" "}
                <code className="rounded bg-[var(--panel)] px-1">
                  - Track — Artists
                </code>{" "}
                lines.{" "}
                {importSource === "playlists"
                  ? `Tracks are matched against the ${selectedPlaylists.length} selected playlist(s) and a new editable preview is created — no AI involved.`
                  : "Tracks are matched against the current preview; the plan is replaced with what you paste."}
              </p>
              <textarea
                className="field focus-ring min-h-64 flex-1 resize-y px-3 py-2 font-mono text-xs leading-5"
                onChange={(event) => setImportText(event.target.value)}
                placeholder={"## Latin Trap & Rap (2)\n- Dile — Don Omar\n- Mi Gente — Héctor Lavoe"}
                value={importText}
              />
              <div className="flex justify-end gap-2">
                <button
                  className="focus-ring inline-flex h-10 items-center rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  onClick={() => setImportOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-sm font-bold text-[#04140a] transition hover:bg-[var(--accent-strong)]"
                  disabled={importText.trim().length === 0 || importing}
                  onClick={importPlanFromText}
                  type="button"
                >
                  {importing ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={14}
                    />
                  ) : (
                    <Upload aria-hidden="true" size={14} />
                  )}
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {planText !== null ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPlanText(null)}
          role="dialog"
        >
          <div
            className="rise flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--line)] p-4">
              <FileText
                aria-hidden="true"
                className="text-[var(--accent-strong)]"
                size={18}
              />
              <h3 className="min-w-0 flex-1 truncate text-lg font-bold">
                Plan as text
              </h3>
              <button
                className="focus-ring inline-flex h-9 items-center gap-2 rounded-full border border-[var(--line)] px-3 text-xs font-semibold transition hover:border-[var(--accent)]"
                onClick={async () => {
                  await navigator.clipboard.writeText(planText);
                  notify("success", "Plan copied to clipboard.");
                }}
                type="button"
              >
                <Copy aria-hidden="true" size={13} />
                Copy
              </button>
              <button
                className="focus-ring rounded-full p-1.5 text-[var(--muted)] transition hover:text-[var(--foreground)]"
                onClick={() => setPlanText(null)}
                title="Close"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-xs leading-5 text-[var(--muted)]">
              {planText}
            </pre>
          </div>
        </div>
      ) : null}

      <header className="rise">
        <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[var(--accent-strong)]">
          <Sparkles aria-hidden="true" size={14} />
          Splitify
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">
          {userName ? `Hey, ${userName.split(" ")[0]}` : "Dashboard"}
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Pick a playlist, describe the split, and let the agent do the sorting.
        </p>
      </header>

      {/* Stepper */}
      <nav aria-label="Steps" className="rise flex items-center gap-2">
        {["Choose playlist", "Describe split", "Review & ship"].map(
          (label, index) => {
            const reachable =
              index === 0 ||
              (index === 1 && selectedPlaylists.length > 0) ||
              (index === 2 && Boolean(split));
            const done =
              index < step ||
              (index === 2 && split?.status === "completed");

            return (
              <div className="flex min-w-0 flex-1 items-center gap-2" key={label}>
                <button
                  aria-current={step === index ? "step" : undefined}
                  className={`focus-ring flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    step === index
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--foreground)]"
                      : reachable
                        ? "border-[var(--line)] text-[var(--muted)] hover:border-[#3a4740] hover:text-[var(--foreground)]"
                        : "border-[var(--line)] text-[var(--muted)]"
                  }`}
                  disabled={!reachable}
                  onClick={() => goToStep(index)}
                  type="button"
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-black ${
                      done
                        ? "bg-[var(--accent)] text-[#04140a]"
                        : step === index
                          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                          : "bg-[var(--panel-soft)] text-[var(--muted)]"
                    }`}
                  >
                    {done ? <Check aria-hidden="true" size={12} /> : index + 1}
                  </span>
                  <span className="hidden truncate sm:inline">{label}</span>
                </button>
                {index < 2 ? (
                  <span
                    aria-hidden="true"
                    className={`h-px flex-1 ${
                      index < step ? "bg-[var(--accent)]" : "bg-[var(--line)]"
                    }`}
                  />
                ) : null}
              </div>
            );
          }
        )}
      </nav>

      {/* Step 1: playlist picker */}
      {step === 0 ? (
      <section
        className={`panel p-5 ${direction === "forward" ? "slide-forward" : "slide-back"}`}
        key="step-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-black text-[var(--accent-strong)]">
              1
            </span>
            Choose a source playlist
          </h2>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              size={15}
            />
            <input
              className="field focus-ring h-10 w-64 max-w-full pl-9 pr-3 text-sm"
              onChange={(event) => setPlaylistQuery(event.target.value)}
              placeholder="Search your playlists…"
              value={playlistQuery}
            />
          </div>
        </div>

        {loadingPlaylists ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                className="pulse-soft h-40 rounded-xl bg-[var(--panel-soft)]"
                key={index}
              />
            ))}
          </div>
        ) : visiblePlaylists.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--muted)]">
            No playlists match “{playlistQuery}”.
          </p>
        ) : (
          <div className="mt-4 grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-6">
            {visiblePlaylists.map((playlist) => {
              const selected = selectedPlaylistIds.includes(playlist.id);
              return (
                <button
                  className={`focus-ring group relative overflow-hidden rounded-xl border text-left transition ${
                    selected
                      ? "border-[var(--accent)] shadow-[0_0_24px_rgba(29,185,84,0.25)]"
                      : "border-[var(--line)] hover:border-[#3a4740]"
                  }`}
                  aria-pressed={selected}
                  disabled={working}
                  key={playlist.id}
                  onClick={() => togglePlaylist(playlist.id)}
                  type="button"
                >
                  <div
                    className="aspect-square w-full bg-[var(--panel-soft)] bg-cover bg-center transition duration-300 group-hover:scale-[1.04]"
                    style={{
                      backgroundImage: playlist.imageUrl
                        ? `url(${playlist.imageUrl})`
                        : undefined
                    }}
                  >
                    {!playlist.imageUrl ? (
                      <div className="grid h-full w-full place-items-center text-[var(--muted)]">
                        <Music2 aria-hidden="true" size={28} />
                      </div>
                    ) : null}
                  </div>
                  {selected ? (
                    <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-[#04140a]">
                      <Check aria-hidden="true" size={14} />
                    </span>
                  ) : null}
                  <div className="bg-[var(--panel)] p-2">
                    <p className="truncate text-sm font-semibold">
                      {playlist.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedPlaylists.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span>
              Selected ({selectedPlaylists.length})
              {selectedPlaylists.length > 1 ? " — they will be combined:" : ":"}
            </span>
            {selectedPlaylists.map((playlist) => (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] py-1 pl-3 pr-1.5 text-xs font-semibold text-[var(--foreground)]"
                key={playlist.id}
              >
                {playlist.name}
                <button
                  className="focus-ring rounded-full p-0.5 text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  onClick={() => togglePlaylist(playlist.id)}
                  title="Deselect"
                  type="button"
                >
                  <X aria-hidden="true" size={12} />
                </button>
              </span>
            ))}
            <button
              className="focus-ring inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)] transition hover:border-[var(--danger)]"
              disabled={working || removingPlaylist}
              onClick={() => requestRemovePlaylists(selectedPlaylists)}
              type="button"
            >
              {removingPlaylist ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={12} />
              ) : (
                <Trash2 aria-hidden="true" size={12} />
              )}
              {selectedPlaylists.length === 1
                ? "Remove from library"
                : `Remove ${selectedPlaylists.length} from library`}
            </button>
          </div>
        ) : null}

        {savedSplits.length > 0 ? (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <h3 className="text-sm font-bold">Saved splits</h3>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {savedSplits.map((saved) => (
                <div
                  className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5"
                  key={saved.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {saved.name}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {saved.categories} playlists · {saved.tracks} tracks ·{" "}
                      {new Date(saved.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      saved.status === "completed"
                        ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : saved.status === "failed"
                          ? "bg-[rgba(255,107,107,0.12)] text-[var(--danger)]"
                          : "bg-[var(--panel-soft)] text-[var(--muted)]"
                    }`}
                  >
                    {saved.status}
                  </span>
                  <button
                    className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-xs font-semibold transition hover:border-[var(--accent)]"
                    disabled={resumingId !== null}
                    onClick={() => resumeSplit(saved.id)}
                    type="button"
                  >
                    {resumingId === saved.id ? (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                        size={13}
                      />
                    ) : (
                      <ArrowRight aria-hidden="true" size={13} />
                    )}
                    Open
                  </button>
                  <button
                    className="focus-ring shrink-0 rounded-md p-1.5 text-[var(--muted)] transition hover:text-[var(--danger)]"
                    onClick={() => requestDeleteSaved(saved)}
                    title="Delete saved split"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-4">
          <button
            className="focus-ring inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] px-5 font-semibold transition hover:border-[var(--accent)]"
            disabled={selectedPlaylists.length === 0 || importing}
            onClick={() => {
              setImportSource("playlists");
              setImportOpen(true);
            }}
            title="Skip the AI: paste a plan as text and go straight to review"
            type="button"
          >
            <Upload aria-hidden="true" size={16} />
            Import text
          </button>
          <button
            className="focus-ring inline-flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 font-bold text-[#04140a] transition hover:bg-[var(--accent-strong)]"
            disabled={selectedPlaylists.length === 0}
            onClick={() => goToStep(1)}
            type="button"
          >
            Continue
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>
      </section>
      ) : null}

      {/* Step 2: configuration */}
      {step === 1 ? (
      <section
        className={`panel p-5 ${direction === "forward" ? "slide-forward" : "slide-back"}`}
        key="step-1"
      >
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-black text-[var(--accent-strong)]">
            2
          </span>
          Describe the split
          {selectedPlaylists.length > 0 ? (
            <span className="truncate rounded-full bg-[var(--panel-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--muted)]">
              {selectedPlaylists.map((playlist) => playlist.name).join(" + ")}
            </span>
          ) : null}
        </h2>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold">Mode</p>
              <div className="mt-2 inline-flex rounded-full border border-[var(--line)] bg-[#0e1412] p-1">
                {(
                  [
                    ["both", "Prompt + categories"],
                    ["prompt", "Prompt only"],
                    ["manual", "Categories only"]
                  ] as const
                ).map(([value, label]) => (
                  <button
                    className={`focus-ring rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      mode === value
                        ? "bg-[var(--accent)] text-[#04140a]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                    key={value}
                    onClick={() => setMode(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {mode !== "manual" ? (
              <div>
                <label className="block text-sm font-semibold" htmlFor="prompt">
                  Prompt
                </label>
                <textarea
                  className="field focus-ring mt-2 min-h-24 w-full resize-y px-3 py-2 text-sm leading-6"
                  id="prompt"
                  onChange={(event) => setPrompt(event.target.value)}
                  value={prompt}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {PROMPT_PRESETS.map((preset) => (
                    <button
                      className={`focus-ring rounded-full border px-3 py-1 text-xs transition ${
                        prompt === preset
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                          : "border-[var(--line)] text-[var(--muted)] hover:border-[#3a4740] hover:text-[var(--foreground)]"
                      }`}
                      key={preset}
                      onClick={() => setPrompt(preset)}
                      type="button"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mode !== "prompt" ? (
              <label className="block text-sm font-semibold">
                Categories (one per line)
                <textarea
                  className="field focus-ring mt-2 min-h-24 w-full resize-y px-3 py-2 text-sm leading-6"
                  onChange={(event) => setManualCategories(event.target.value)}
                  value={manualCategories}
                />
              </label>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold">Duplicates</p>
              <div className="mt-2 grid gap-2">
                {(
                  [
                    ["single", "Each song in one playlist"],
                    ["overlap", "Songs can repeat across playlists"]
                  ] as const
                ).map(([value, label]) => (
                  <button
                    className={`focus-ring rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                      duplicatePolicy === value
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--line)] text-[var(--muted)] hover:border-[#3a4740]"
                    }`}
                    key={value}
                    onClick={() => setDuplicatePolicy(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--line)]">
              <button
                aria-expanded={advancedOpen}
                className="focus-ring flex w-full items-center justify-between gap-2 bg-[var(--panel-soft)] px-3 py-2.5 text-sm font-semibold transition hover:text-[var(--accent-strong)]"
                onClick={() => setAdvancedOpen((current) => !current)}
                type="button"
              >
                Advanced settings
                <ChevronDown
                  aria-hidden="true"
                  className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  size={16}
                />
              </button>

              {advancedOpen ? (
                <div className="space-y-4 border-t border-[var(--line)] p-3">
            {duplicatePolicy === "overlap" ? (
              <div>
                <p className="text-sm font-semibold">Max playlists per song</p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="field focus-ring h-11 w-20 px-3 text-sm"
                    disabled={unlimitedRepeats}
                    inputMode="numeric"
                    min={1}
                    onChange={(event) => setMaxRepeats(event.target.value)}
                    type="number"
                    value={maxRepeats}
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
                    <input
                      checked={unlimitedRepeats}
                      className="focus-ring h-4 w-4 accent-[var(--accent)]"
                      onChange={(event) =>
                        setUnlimitedRepeats(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Unlimited
                  </label>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  How many playlists a single song may appear in.
                </p>
              </div>
            ) : null}

            <label className="block text-sm font-semibold">
              Max playlists
              <input
                className="field focus-ring mt-2 h-11 w-full px-3 text-sm"
                inputMode="numeric"
                min={1}
                onChange={(event) => setMaxPlaylists(event.target.value)}
                placeholder="No limit"
                type="number"
                value={maxPlaylists}
              />
              <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                Smaller categories get merged into a &ldquo;Mixed&rdquo; playlist.
              </span>
            </label>

            <label className="block text-sm font-semibold">
              Max songs per playlist
              <input
                className="field focus-ring mt-2 h-11 w-full px-3 text-sm"
                inputMode="numeric"
                min={1}
                onChange={(event) => setMaxPerPlaylist(event.target.value)}
                placeholder="No limit"
                type="number"
                value={maxPerPlaylist}
              />
              <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                Overflow becomes numbered parts, e.g. &ldquo;Energy (2)&rdquo;.
              </span>
            </label>

            <label className="block text-sm font-semibold">
              Min songs per playlist
              <input
                className="field focus-ring mt-2 h-11 w-full px-3 text-sm"
                inputMode="numeric"
                min={1}
                onChange={(event) => setMinPerPlaylist(event.target.value)}
                placeholder="No minimum"
                type="number"
                value={minPerPlaylist}
              />
              <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                Soft target — the agent may break it when nothing fits.
              </span>
            </label>
                </div>
              ) : null}
            </div>

            <label className="block text-sm font-semibold">
              Playlist name prefix
              <input
                className="field focus-ring mt-2 h-11 w-full px-3 text-sm"
                onChange={(event) => setPlaylistPrefix(event.target.value)}
                value={playlistPrefix}
              />
              <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                e.g. “{playlistPrefix.trim()} Late Night”
              </span>
            </label>

            <button
              className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 font-bold text-[#04140a] shadow-[0_0_24px_rgba(29,185,84,0.3)] transition hover:bg-[var(--accent-strong)]"
              disabled={selectedPlaylists.length === 0 || working}
              onClick={generateSplit}
              type="button"
            >
              {working ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={18} />
              ) : (
                <Sparkles aria-hidden="true" size={18} />
              )}
              {working ? "Thinking…" : "Generate preview"}
            </button>

            {working && progress ? (
              <div className="rise rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2
                    aria-hidden="true"
                    className="shrink-0 animate-spin text-[var(--accent-strong)]"
                    size={15}
                  />
                  <span className="min-w-0 flex-1 leading-5">
                    {progress.message}
                  </span>
                </div>
                {typeof progress.current === "number" &&
                typeof progress.total === "number" &&
                progress.total > 0 ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0e1412]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{
                        width: `${Math.round((progress.current / progress.total) * 100)}%`
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4">
          <button
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted)] transition hover:border-[#3a4740] hover:text-[var(--foreground)]"
            disabled={working}
            onClick={() => goToStep(0)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            Back
          </button>
          {split ? (
            <button
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold transition hover:border-[var(--accent)]"
              disabled={working}
              onClick={() => goToStep(2)}
              type="button"
            >
              Review current preview
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          ) : null}
        </div>
      </section>
      ) : null}

      {/* Step 3: preview */}
      {step === 2 ? (
      <section
        className={`panel p-5 ${direction === "forward" ? "slide-forward" : "slide-back"}`}
        key="step-2"
      >
        <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] pb-4 md:flex-row md:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--accent-soft)] text-sm font-black text-[var(--accent-strong)]">
                3
              </span>
              Review and ship
              {dirty ? (
                <span className="rounded-full bg-[#3a2e12] px-2 py-0.5 text-xs font-semibold text-[#e8a13c]">
                  Unsaved changes
                </span>
              ) : null}
              {split?.status === "completed" ? (
                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-strong)]">
                  Created in Spotify
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {split
                ? `${split.categories.length} playlists · ${totalAssigned} tracks — drag songs between playlists or use the move menu.`
                : "Generate a split to review the tracks."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {split ? (
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                  size={14}
                />
                <input
                  className="field focus-ring h-10 w-44 pl-8 pr-3 text-sm"
                  onChange={(event) => setTrackFilter(event.target.value)}
                  placeholder="Filter tracks…"
                  value={trackFilter}
                />
              </div>
            ) : null}
            <button
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold transition hover:border-[var(--accent)]"
              disabled={!split}
              onClick={openPlanText}
              title="View the whole plan as plain text"
              type="button"
            >
              <FileText aria-hidden="true" size={16} />
              As text
            </button>
            <button
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold transition hover:border-[var(--accent)]"
              disabled={!split}
              onClick={openSummary}
              title="How genres were resolved for this split"
              type="button"
            >
              <Info aria-hidden="true" size={16} />
              Summary
            </button>
            <button
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold transition hover:border-[var(--accent)]"
              disabled={!split || isLocked || saving || executing}
              onClick={() => {
                setImportSource("local");
                setImportOpen(true);
              }}
              title="Rebuild the plan from pasted text (same format as “As text”)"
              type="button"
            >
              <Upload aria-hidden="true" size={16} />
              Import text
            </button>
            <button
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold transition hover:border-[var(--accent)]"
              disabled={
                !split ||
                saving ||
                executing ||
                isLocked ||
                merging ||
                (split?.categories.length ?? 0) < 2
              }
              onClick={mergeSimilar}
              title="Use the AI agent to merge near-duplicate playlists"
              type="button"
            >
              {merging ? (
                <Loader2 aria-hidden="true" className="animate-spin" size={16} />
              ) : (
                <Layers aria-hidden="true" size={16} />
              )}
              AI merge
            </button>
            <button
              className={`focus-ring inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                mergeMode
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border-[var(--line)] hover:border-[var(--accent)]"
              }`}
              disabled={
                !split ||
                saving ||
                executing ||
                isLocked ||
                merging ||
                (split?.categories.length ?? 0) < 2
              }
              onClick={() => {
                setMergeMode((current) => !current);
                setMergeSelect([]);
              }}
              title="Pick the playlists to merge yourself"
              type="button"
            >
              <Check aria-hidden="true" size={16} />
              Select &amp; merge
            </button>
            <button
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold transition hover:border-[var(--accent)]"
              disabled={!split || saving || executing || isLocked}
              onClick={addCategory}
              type="button"
            >
              <FolderPlus aria-hidden="true" size={16} />
              Add playlist
            </button>
            <button
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold transition hover:border-[var(--accent)]"
              disabled={!split || saving || executing || isLocked || !dirty}
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
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-[#04140a] transition hover:bg-[var(--accent-strong)]"
              disabled={!split || executing || saving || isLocked}
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
              {split?.status === "completed" ? "Created" : "Create in Spotify"}
            </button>
          </div>
        </div>

        {!split ? (
          <div className="mt-4 grid min-h-72 place-items-center rounded-xl border border-dashed border-[var(--line)] p-6 text-center">
            <div>
              <Music2
                aria-hidden="true"
                className="mx-auto text-[var(--muted)]"
                size={32}
              />
              <p className="mt-3 text-sm text-[var(--muted)]">
                The editable preview will appear here.
              </p>
            </div>
          </div>
        ) : (
          <>
          {mergeMode ? (
            <div className="rise fixed bottom-4 left-1/2 z-40 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 space-y-3 rounded-2xl border border-[var(--accent)] bg-[var(--panel-soft)] px-4 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold">
                  {mergeSelect.length < 2
                    ? "Tick at least two playlists, then merge them into one or regroup them into sharper concepts."
                    : `${mergeSelect.length} playlists selected.`}
                </p>
                <button
                  className="focus-ring inline-flex h-9 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-[#04140a] transition hover:bg-[var(--accent-strong)]"
                  disabled={mergeSelect.length < 2 || regrouping}
                  onClick={mergeSelectedCategories}
                  title="Combine into one playlist (keeps the first one's name)"
                  type="button"
                >
                  <Layers aria-hidden="true" size={14} />
                  Merge into one
                </button>
                <button
                  className="focus-ring inline-flex h-9 items-center gap-2 rounded-full border border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-strong)] transition hover:bg-[var(--accent)] hover:text-[#04140a]"
                  disabled={mergeSelect.length < 2 || regrouping}
                  onClick={() => regroupSelected()}
                  title="Re-split these songs into the same number of playlists with more specific concepts"
                  type="button"
                >
                  {regrouping ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={14}
                    />
                  ) : (
                    <Sparkles aria-hidden="true" size={14} />
                  )}
                  Regroup with AI
                </button>
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label="Number of resulting playlists"
                    className="field focus-ring h-9 w-16 px-2 text-center text-sm"
                    inputMode="numeric"
                    min={1}
                    onChange={(event) => setRegroupCount(event.target.value)}
                    placeholder="N"
                    type="number"
                    value={regroupCount}
                  />
                  <button
                    className="focus-ring inline-flex h-9 items-center gap-2 rounded-full border border-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-strong)] transition hover:bg-[var(--accent)] hover:text-[#04140a]"
                    disabled={
                      mergeSelect.length < 2 ||
                      regrouping ||
                      !(Number.parseInt(regroupCount, 10) > 0)
                    }
                    onClick={() =>
                      regroupSelected(Number.parseInt(regroupCount, 10))
                    }
                    title="Re-split these songs into exactly N playlists, whatever number you choose"
                    type="button"
                  >
                    {regrouping ? (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                        size={14}
                      />
                    ) : (
                      <Layers aria-hidden="true" size={14} />
                    )}
                    Merge &amp; Regroup
                  </button>
                </div>
                <button
                  className="focus-ring inline-flex h-9 items-center rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
                  disabled={regrouping}
                  onClick={() => {
                    setMergeMode(false);
                    setMergeSelect([]);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <textarea
                className="field focus-ring min-h-10 w-full resize-y px-3 py-2 text-sm leading-6"
                maxLength={2000}
                onChange={(event) => setRegroupHint(event.target.value)}
                placeholder="Optional suggestion for the regroup, e.g. “split by sub-genre: drumless, psycho rap, boom bap”"
                rows={2}
                value={regroupHint}
              />
            </div>
          ) : null}
          <div className="mt-4 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {split.categories.map((category, categoryIndex) => {
              const color = categoryColor(categoryIndex);
              const totalMs = category.assignments.reduce(
                (total, assignment) => total + (assignment.durationMs ?? 0),
                0
              );
              const visibleAssignments = filter
                ? category.assignments.filter(
                    (assignment) =>
                      assignment.trackName.toLowerCase().includes(filter) ||
                      assignment.artists.toLowerCase().includes(filter)
                  )
                : category.assignments;
              const shownCount = visibleCounts[category.id] ?? 30;
              const shownAssignments = visibleAssignments.slice(0, shownCount);
              const hiddenCount = visibleAssignments.length - shownAssignments.length;

              return (
                <article
                  className={`overflow-hidden rounded-xl border bg-[var(--panel)] transition ${
                    mergeMode && mergeSelect.includes(category.id)
                      ? "border-[var(--accent)] shadow-[0_0_18px_rgba(29,185,84,0.2)]"
                      : "border-[var(--line)]"
                  } ${dropCategoryId === category.id ? "drop-target" : ""}`}
                  key={category.id}
                  onDragLeave={(event) => {
                    if (
                      event.currentTarget.contains(event.relatedTarget as Node)
                    ) {
                      return;
                    }
                    setDropCategoryId((current) =>
                      current === category.id ? null : current
                    );
                  }}
                  onDragOver={(event) => {
                    if (dragging && !isLocked) {
                      event.preventDefault();
                      setDropCategoryId(category.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropCategoryId(null);
                    if (dragging) {
                      moveAssignment(
                        dragging.sourceCategoryId,
                        dragging.assignmentId,
                        category.id
                      );
                      setDragging(null);
                    }
                  }}
                >
                  <div
                    className="h-1.5"
                    style={{
                      background: `linear-gradient(90deg, ${color}, transparent)`
                    }}
                  />
                  <div className="border-b border-[var(--line)] p-3">
                    <div className="flex items-center gap-2">
                      {mergeMode ? (
                        <button
                          aria-pressed={mergeSelect.includes(category.id)}
                          className={`focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition ${
                            mergeSelect.includes(category.id)
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[#04140a]"
                              : "border-[var(--line)] text-transparent hover:border-[var(--accent)]"
                          }`}
                          onClick={() => toggleMergeSelection(category.id)}
                          title="Select for merge"
                          type="button"
                        >
                          <Check aria-hidden="true" size={16} />
                        </button>
                      ) : null}
                      <input
                        className="field focus-ring h-10 min-w-0 flex-1 px-3 font-semibold"
                        disabled={isLocked}
                        onChange={(event) =>
                          updateCategoryName(category.id, event.target.value)
                        }
                        value={category.name}
                      />
                      {category.spotifyUrl ? (
                        <a
                          className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--accent-strong)] transition hover:border-[var(--accent)]"
                          href={category.spotifyUrl}
                          rel="noreferrer"
                          target="_blank"
                          title="Open in Spotify"
                        >
                          <ExternalLink aria-hidden="true" size={16} />
                        </a>
                      ) : null}
                      {!isLocked ? (
                        <button
                          className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--danger)] transition hover:border-[var(--danger)]"
                          onClick={() => removeCategory(category.id)}
                          title="Delete playlist from plan"
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={15} />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {category.assignments.length} tracks
                      {totalMs > 0 ? ` · ${formatDuration(totalMs)}` : ""}
                      {category.description ? ` — ${category.description}` : ""}
                    </p>
                  </div>

                  <div
                    className="max-h-[440px] overflow-y-auto p-2"
                    onScroll={() => setMoveMenu(null)}
                  >
                    {visibleAssignments.length === 0 ? (
                      <p className="p-3 text-center text-sm text-[var(--muted)]">
                        {filter
                          ? "No matches here."
                          : "Empty — drag tracks in."}
                      </p>
                    ) : (
                      shownAssignments.map((assignment) => {
                        const menuOpen =
                          moveMenu?.categoryId === category.id &&
                          moveMenu?.assignmentId === assignment.id;

                        return (
                          <div
                            className={`relative mb-1.5 flex items-center gap-2 rounded-lg border border-transparent bg-[var(--panel-soft)] p-2 transition hover:border-[var(--line)] ${
                              dragging?.assignmentId === assignment.id
                                ? "dragging"
                                : ""
                            }`}
                            draggable={!isLocked}
                            key={assignment.id}
                            onDragEnd={() => {
                              setDragging(null);
                              setDropCategoryId(null);
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              setDragging({
                                assignmentId: assignment.id,
                                sourceCategoryId: category.id
                              });
                            }}
                          >
                            {!isLocked ? (
                              <GripVertical
                                aria-hidden="true"
                                className="shrink-0 cursor-grab text-[var(--muted)]"
                                size={14}
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {assignment.trackName}
                              </p>
                              <p className="truncate text-xs text-[var(--muted)]">
                                {assignment.artists}
                                {assignment.album ? ` · ${assignment.album}` : ""}
                              </p>
                            </div>
                            {!isLocked ? (
                              <>
                                <button
                                  aria-expanded={menuOpen}
                                  className={`focus-ring shrink-0 rounded-md p-1.5 transition ${
                                    menuOpen
                                      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                                  }`}
                                  onClick={(event) => {
                                    if (menuOpen) {
                                      setMoveMenu(null);
                                      return;
                                    }
                                    const rect =
                                      event.currentTarget.getBoundingClientRect();
                                    const spaceBelow =
                                      window.innerHeight - rect.bottom;
                                    setMoveMenu({
                                      categoryId: category.id,
                                      assignmentId: assignment.id,
                                      right: window.innerWidth - rect.right,
                                      ...(spaceBelow > 300
                                        ? { top: rect.bottom + 4 }
                                        : {
                                            bottom:
                                              window.innerHeight - rect.top + 4
                                          })
                                    });
                                  }}
                                  title="Move to another playlist"
                                  type="button"
                                >
                                  <ArrowRightLeft aria-hidden="true" size={14} />
                                </button>
                                <button
                                  className="focus-ring shrink-0 rounded-md p-1.5 text-[var(--muted)] transition hover:text-[var(--danger)]"
                                  onClick={() =>
                                    removeAssignment(category.id, assignment.id)
                                  }
                                  title="Remove from plan"
                                  type="button"
                                >
                                  <X aria-hidden="true" size={14} />
                                </button>
                                {menuOpen ? (
                                  <div
                                    className="rise fixed z-30 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] shadow-2xl"
                                    style={{
                                      right: moveMenu?.right,
                                      top: moveMenu?.top,
                                      bottom: moveMenu?.bottom
                                    }}
                                  >
                                    <p className="border-b border-[var(--line)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                                      Move to…
                                    </p>
                                    <div className="max-h-52 overflow-y-auto p-1">
                                      {split.categories
                                        .filter(
                                          (target) => target.id !== category.id
                                        )
                                        .map((target) => (
                                          <button
                                            className="focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition hover:bg-[var(--accent-soft)]"
                                            key={target.id}
                                            onClick={() => {
                                              moveAssignment(
                                                category.id,
                                                assignment.id,
                                                target.id
                                              );
                                              setMoveMenu(null);
                                            }}
                                            type="button"
                                          >
                                            <span
                                              aria-hidden="true"
                                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                                              style={{
                                                background: categoryColor(
                                                  split.categories.findIndex(
                                                    (item) =>
                                                      item.id === target.id
                                                  )
                                                )
                                              }}
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                              {target.name}
                                            </span>
                                            <span className="shrink-0 text-xs font-normal text-[var(--muted)]">
                                              {target.assignments.length}
                                            </span>
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                    {hiddenCount > 0 ? (
                      <button
                        className="focus-ring mt-1 w-full rounded-lg border border-dashed border-[var(--line)] py-2 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                        onClick={() =>
                          setVisibleCounts((current) => ({
                            ...current,
                            [category.id]: shownCount + 100
                          }))
                        }
                        type="button"
                      >
                        Show more ({hiddenCount} hidden)
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          {mergeMode ? <div aria-hidden="true" className="h-48" /> : null}
          </>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
          <button
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted)] transition hover:border-[#3a4740] hover:text-[var(--foreground)]"
            disabled={executing || saving}
            onClick={() => goToStep(1)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            Back
          </button>
          <button
            className={`focus-ring inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${
              split?.status === "completed"
                ? "bg-[var(--accent)] text-[#04140a] hover:bg-[var(--accent-strong)]"
                : "border border-[var(--line)] font-semibold hover:border-[var(--accent)]"
            }`}
            disabled={executing || saving}
            onClick={() => {
              if (split && split.status !== "completed") {
                setConfirmRequest({
                  title: "Start a new split",
                  message:
                    "Discard this preview and start over? Nothing has been created in Spotify yet.",
                  confirmLabel: "Start over",
                  tone: "accent",
                  onConfirm: restart
                });
                return;
              }
              restart();
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={15} />
            Start a new split
          </button>
        </div>
      </section>
      ) : null}
    </main>
  );
}
