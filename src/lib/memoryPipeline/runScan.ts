import { clusterMoments } from '../clusterMoments';
import type { Moment, PhotoAsset } from '../../types/moment';
import { createMemoryDrafts } from './createMemoryDraft';
import { fetchCameraRollAssets, INITIAL_LOOKBACK_MS } from './fetchCameraRoll';
import {
  loadScanStore,
  saveScanStore,
  type MemoryScanStore,
} from './scanStore';

export type MemoryScanResult = {
  ok: boolean;
  permission: 'granted' | 'denied' | 'undetermined' | 'limited';
  scannedCount: number;
  rawCount: number;
  newCandidates: Moment[];
  allCandidates: Moment[];
  photos: PhotoAsset[];
  store: MemoryScanStore;
  /** Short human lines for the magic loading UI / status. */
  messages: string[];
  /** One-line status for the For you screen after a manual scan. */
  statusMessage: string;
};

function fingerprint(moment: Moment): string {
  return `${moment.startAt}-${moment.endAt}-${moment.photoIds.length}`;
}

/**
 * Incremental camera-roll → memory-candidate pipeline.
 *
 * Camera Roll → Cluster → Cover → Title → Memory Draft
 * Each stage is a swappable module under memoryPipeline/.
 */
export async function runMemoryScan(options?: {
  requestPermission?: boolean;
  /** Re-scan the full lookback window instead of only newer-than-cursor. */
  forceFullScan?: boolean;
}): Promise<MemoryScanResult> {
  const store = await loadScanStore();
  const now = Date.now();
  const forceFullScan = options?.forceFullScan ?? false;

  const since = forceFullScan
    ? Math.max(0, now - INITIAL_LOOKBACK_MS)
    : (store.lastScannedAt ?? Math.max(0, now - INITIAL_LOOKBACK_MS));

  const { assets, permission, rawCount } = await fetchCameraRollAssets(since, {
    requestPermission: options?.requestPermission ?? false,
  });

  console.log('[memoryPipeline] scan', {
    since: new Date(since).toISOString(),
    forceFullScan,
    permission,
    rawCount,
    mapped: assets.length,
  });

  const messages: string[] = ['Finding moments...'];

  if (permission === 'denied' || permission === 'undetermined') {
    const next: MemoryScanStore = {
      ...store,
      hasCompletedInitialScan: true,
      lastNewCount: 0,
    };
    await saveScanStore(next);
    return {
      ok: false,
      permission,
      scannedCount: 0,
      rawCount: 0,
      newCandidates: [],
      allCandidates: store.candidates,
      photos: store.photos,
      store: next,
      messages: [...messages, 'Photos access needed to detect memories'],
      statusMessage:
        'Photos permission is required. Allow access in Settings, then scan again.',
    };
  }

  messages.push(
    assets.length
      ? `Looking through ${assets.length} recent photo${assets.length === 1 ? '' : 's'}...`
      : 'Checking for new photos...',
  );

  // Merge newly fetched assets into the rolling camera-roll photo set.
  // Full scan replaces the window so stale incremental state can't hide photos.
  const byId = new Map<string, PhotoAsset>();
  if (!forceFullScan) {
    for (const photo of store.photos) byId.set(photo.id, photo);
  }
  for (const photo of assets) byId.set(photo.id, photo);
  const photos = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);

  // Need ≥3 photos within ~6 hours (and nearby GPS when present)
  const clusters = clusterMoments(photos);
  messages.push(
    clusters.length
      ? `Choosing covers & titles for ${clusters.length} memor${clusters.length === 1 ? 'y' : 'ies'}...`
      : 'Grouping photos...',
  );

  const drafts = await createMemoryDrafts(clusters);

  const dismissed = new Set(store.dismissedIds);
  const existingByFp = new Map(
    store.candidates.map((c) => [fingerprint(c), c] as const),
  );

  const mergedCandidates: Moment[] = [];
  const newCandidates: Moment[] = [];

  for (const draft of drafts) {
    if (dismissed.has(draft.id)) continue;
    const fp = fingerprint(draft);
    const prior = existingByFp.get(fp);

    const stabilized: Moment = prior
      ? {
          ...draft,
          id: prior.id,
          // Preserve user edits / previously shown metadata.
          title: prior.title,
          locationLabel: prior.locationLabel,
          coverPhotoId:
            prior.coverPhotoId && draft.photoIds.includes(prior.coverPhotoId)
              ? prior.coverPhotoId
              : draft.coverPhotoId,
        }
      : {
          ...draft,
          id: `candidate-${fp}`,
        };

    if (dismissed.has(stabilized.id)) continue;
    mergedCandidates.push(stabilized);
    if (!prior && !store.candidates.some((c) => c.id === stabilized.id)) {
      newCandidates.push(stabilized);
    }
  }

  for (const c of newCandidates.slice(0, 3)) {
    const day = new Date(c.startAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    messages.push(`✓ ${c.title} · ${day} · ${c.photoIds.length} photos`);
  }
  if (newCandidates.length > 3) {
    messages.push(`✓ ${newCandidates.length - 3} more memories ready`);
  }
  if (newCandidates.length === 0 && assets.length === 0) {
    messages.push('You’re up to date');
  } else if (newCandidates.length === 0) {
    messages.push('No new groupings yet');
  }
  messages.push('Creating your timeline...');

  // Only advance the cursor when we actually saw assets (or completed a full pass).
  const newestAssetAt = assets.reduce(
    (max, a) => Math.max(max, a.createdAt),
    0,
  );
  let nextLastScannedAt = store.lastScannedAt;
  if (assets.length > 0) {
    nextLastScannedAt = newestAssetAt;
  } else if (forceFullScan || store.lastScannedAt == null) {
    // Empty library in range — still mark the pass so onboarding can finish.
    nextLastScannedAt = now;
  }

  const next: MemoryScanStore = {
    lastScannedAt: nextLastScannedAt,
    hasCompletedInitialScan: true,
    photos,
    candidates: mergedCandidates,
    dismissedIds: store.dismissedIds,
    lastNewCount: newCandidates.length,
  };
  await saveScanStore(next);

  let statusMessage: string;
  if (rawCount === 0) {
    statusMessage =
      permission === 'limited'
        ? 'No photos available yet. On iOS, choose more photos for RollCall in Settings → Photos.'
        : 'No photos found in the last 30 days. Take a few shots close together, then scan again.';
  } else if (mergedCandidates.length === 0) {
    statusMessage = `Found ${photos.length} photo${photos.length === 1 ? '' : 's'}, but need at least 3 taken within a few hours to form a memory.`;
  } else if (newCandidates.length === 0) {
    statusMessage = `Still ${mergedCandidates.length} memor${mergedCandidates.length === 1 ? 'y' : 'ies'} ready — no new groupings this scan.`;
  } else {
    statusMessage = `Found ${newCandidates.length} new memor${newCandidates.length === 1 ? 'y' : 'ies'} from ${photos.length} photos.`;
  }

  return {
    ok: true,
    permission,
    scannedCount: assets.length,
    rawCount,
    newCandidates,
    allCandidates: mergedCandidates,
    photos,
    store: next,
    messages,
    statusMessage,
  };
}
