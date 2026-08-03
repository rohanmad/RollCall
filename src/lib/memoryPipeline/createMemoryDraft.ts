import type { Moment, PhotoAsset } from '../../types/moment';
import type { PhotoCluster } from '../clusterMoments';
import { generateMemoryTitle } from './generateTitle';
import {
  selectCoverPhoto,
  selectCoverPhotoSync,
  type CoverSignalProvider,
} from './selectCoverPhoto';
import {
  enrichMemoryWithVision,
  isVisionEnrichmentReady,
} from './visionEnrichment';

export type CreateMemoryDraftOptions = {
  id?: string;
  /** Override reverse-geocode (tests / offline). */
  placeName?: string | null;
  locationLabel?: string | null;
  /** Skip network geocode when place already known or undesired. */
  skipGeocode?: boolean;
  getSignals?: CoverSignalProvider;
  /** Force heuristic title/cover even if OpenAI is configured. */
  skipVision?: boolean;
};

/**
 * Assemble a memory draft from a photo cluster:
 * cluster → cover → title (+ optional place) → Moment
 *
 * When `EXPO_PUBLIC_OPENAI_API_KEY` is set, a vision model refines the
 * cover pick and title; heuristics remain the fallback.
 */
export async function createMemoryDraft(
  cluster: PhotoCluster,
  options: CreateMemoryDraftOptions = {},
): Promise<Moment> {
  const coverHeuristic = await selectCoverPhoto(cluster.photos, {
    getSignals: options.getSignals,
  });

  let placeName = options.placeName ?? undefined;
  let locationLabel = options.locationLabel ?? undefined;

  if (
    !options.skipGeocode &&
    cluster.centroid &&
    placeName == null &&
    locationLabel == null
  ) {
    const { resolvePlace } = await import('./resolvePlace');
    const place = await resolvePlace(cluster.centroid);
    placeName = place.placeName;
    locationLabel = place.locationLabel;
  }

  let title = generateMemoryTitle({
    startAt: cluster.startAt,
    endAt: cluster.endAt,
    placeName,
    photoCount: cluster.photos.length,
    seed: cluster.photos.map((p) => p.id).join(','),
  });
  let cover = coverHeuristic;

  if (!options.skipVision && isVisionEnrichmentReady()) {
    const vision = await enrichMemoryWithVision({
      photos: cluster.photos,
      placeName,
      locationLabel,
      startAt: cluster.startAt,
      endAt: cluster.endAt,
    });
    if (vision?.title) {
      title = vision.title;
    }
    if (vision?.coverPhotoId) {
      const picked = cluster.photos.find((p) => p.id === vision.coverPhotoId);
      if (picked) cover = picked;
    }
  }

  return {
    id: options.id ?? `moment-${cluster.startAt}-${cover.id}`,
    title,
    locationLabel: locationLabel || undefined,
    startAt: cluster.startAt,
    endAt: cluster.endAt,
    photoIds: cluster.photos.map((p) => p.id),
    coverPhotoId: cover.id,
    centroid: cluster.centroid,
    status: 'draft',
  };
}

/** Sync draft builder for mocks/tests — heuristic cover, no geocode / vision. */
export function createMemoryDraftSync(
  cluster: PhotoCluster,
  options: Omit<
    CreateMemoryDraftOptions,
    'getSignals' | 'skipGeocode' | 'skipVision'
  > = {},
): Moment {
  const cover = selectCoverPhotoSync(cluster.photos);
  const title = generateMemoryTitle({
    startAt: cluster.startAt,
    endAt: cluster.endAt,
    placeName: options.placeName ?? undefined,
    photoCount: cluster.photos.length,
    seed: cluster.photos.map((p) => p.id).join(','),
  });

  return {
    id: options.id ?? `moment-${cluster.startAt}-${cover.id}`,
    title,
    locationLabel: options.locationLabel || undefined,
    startAt: cluster.startAt,
    endAt: cluster.endAt,
    photoIds: cluster.photos.map((p) => p.id),
    coverPhotoId: cover.id,
    centroid: cluster.centroid,
    status: 'draft',
  };
}

/** Enrich many clusters sequentially (keeps geocode + vision rate modest). */
export async function createMemoryDrafts(
  clusters: PhotoCluster[],
  options?: CreateMemoryDraftOptions,
): Promise<Moment[]> {
  const drafts: Moment[] = [];
  for (const cluster of clusters) {
    drafts.push(await createMemoryDraft(cluster, options));
  }
  return drafts;
}

export function photosByIdFromClusters(
  clusters: PhotoCluster[],
): Record<string, PhotoAsset> {
  const map: Record<string, PhotoAsset> = {};
  for (const cluster of clusters) {
    for (const photo of cluster.photos) {
      map[photo.id] = photo;
    }
  }
  return map;
}
