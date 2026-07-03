export type SplitProgress = {
  message: string;
  current?: number;
  total?: number;
  updatedAt: number;
};

// Survives Next.js dev HMR reloads by hanging off globalThis.
const globalStore = globalThis as unknown as {
  __splitProgress?: Map<string, SplitProgress>;
};

const store = (globalStore.__splitProgress ??= new Map<string, SplitProgress>());

function key(userId: string, token: string) {
  return `${userId}:${token}`;
}

export function setSplitProgress(
  userId: string,
  token: string,
  progress: Omit<SplitProgress, "updatedAt">
) {
  store.set(key(userId, token), { ...progress, updatedAt: Date.now() });
}

export function getSplitProgress(userId: string, token: string) {
  return store.get(key(userId, token)) ?? null;
}

export function clearSplitProgress(userId: string, token: string) {
  store.delete(key(userId, token));

  // Opportunistic cleanup of stale entries.
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [entryKey, progress] of store) {
    if (progress.updatedAt < cutoff) {
      store.delete(entryKey);
    }
  }
}
