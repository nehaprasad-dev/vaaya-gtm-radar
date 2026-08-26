import type { ShareSnapshot } from "@/lib/share";

const SHARE_TTL_MS = 12 * 60 * 60 * 1000;

type ShareEntry = {
  expiresAt: number;
  snapshot: ShareSnapshot;
};

const shareStore = new Map<string, ShareEntry>();

function pruneExpired() {
  const now = Date.now();
  for (const [id, entry] of shareStore) {
    if (now >= entry.expiresAt) {
      shareStore.delete(id);
    }
  }
}

function createShareId() {
  return `s_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function saveShareSnapshot(snapshot: ShareSnapshot) {
  pruneExpired();
  const id = createShareId();
  shareStore.set(id, {
    expiresAt: Date.now() + SHARE_TTL_MS,
    snapshot,
  });
  return id;
}

export function getShareSnapshot(id: string) {
  pruneExpired();
  const entry = shareStore.get(id);

  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    shareStore.delete(id);
    return null;
  }

  return entry.snapshot;
}
