import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Moment, PhotoAsset } from '../../types/moment';

const STORE_KEY = 'rollcall.memoryScan.v1';

export type MemoryScanStore = {
  /** Cursor — only scan media newer than this (ms). */
  lastScannedAt: number | null;
  hasCompletedInitialScan: boolean;
  photos: PhotoAsset[];
  /** Pending memory candidates (drafts) from the camera roll. */
  candidates: Moment[];
  /** Candidate ids the user dismissed — never resurface. */
  dismissedIds: string[];
  /** How many brand-new candidates the last scan produced. */
  lastNewCount: number;
};

const EMPTY: MemoryScanStore = {
  lastScannedAt: null,
  hasCompletedInitialScan: false,
  photos: [],
  candidates: [],
  dismissedIds: [],
  lastNewCount: 0,
};

export async function loadScanStore(): Promise<MemoryScanStore> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<MemoryScanStore>;
    return {
      ...EMPTY,
      ...parsed,
      photos: parsed.photos ?? [],
      candidates: parsed.candidates ?? [],
      dismissedIds: parsed.dismissedIds ?? [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveScanStore(store: MemoryScanStore): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
}

export async function markCandidateDismissed(candidateId: string): Promise<void> {
  const store = await loadScanStore();
  if (store.dismissedIds.includes(candidateId)) return;
  const next: MemoryScanStore = {
    ...store,
    dismissedIds: [...store.dismissedIds, candidateId],
    candidates: store.candidates.filter((c) => c.id !== candidateId),
  };
  await saveScanStore(next);
}

export async function markCandidateShared(candidateId: string): Promise<void> {
  await markCandidatesShared([candidateId]);
}

export async function markCandidatesShared(
  candidateIds: string[],
): Promise<void> {
  if (candidateIds.length === 0) return;
  const store = await loadScanStore();
  const dismissed = new Set(store.dismissedIds);
  let changed = false;
  for (const id of candidateIds) {
    if (!dismissed.has(id)) {
      dismissed.add(id);
      changed = true;
    }
  }
  const idSet = new Set(candidateIds);
  const candidates = store.candidates.filter((c) => !idSet.has(c.id));
  if (!changed && candidates.length === store.candidates.length) return;

  await saveScanStore({
    ...store,
    dismissedIds: [...dismissed],
    candidates,
  });
}
