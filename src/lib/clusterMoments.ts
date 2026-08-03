import type { AssetLocation, PhotoAsset } from '../types/moment';

/**
 * Event-oriented clustering — answers "what happened?" not "which photos
 * are near each other in the library list?"
 *
 * Pipeline stages (swappable later without touching Create/publish):
 *  1. Sort chronologically
 *  2. Segment into candidate events (time + GPS)
 *  3. Keep only clusters that look like real outings
 */

export type ClusterOptions = {
  /** Soft session break when consecutive photos are farther apart than this. */
  sessionGapMs?: number;
  /**
   * Overnight / quiet stretch still counts as the same trip when GPS stays
   * in-region (e.g. Yosemite weekend). Without GPS we do not bridge this far.
   */
  tripBridgeGapMs?: number;
  /** Distance from the running event centroid that forces a new event. */
  splitDistanceMeters?: number;
  /** How far “same trip / same region” can stretch for overnight bridging. */
  tripRegionMeters?: number;
  /** Minimum photos for a memory. */
  minPhotos?: number;
  /**
   * No-GPS clusters shorter than this are usually imports/dumps, not outings.
   * GPS-backed clusters can be shorter (quick stop with a few shots).
   */
  minDurationMsWithoutGps?: number;
  /** Absolute reject: entire cluster squeezed into this window → not an event. */
  maxImportBurstMs?: number;
};

const DEFAULTS: Required<ClusterOptions> = {
  sessionGapMs: 2.5 * 60 * 60 * 1000, // 2.5 hours
  tripBridgeGapMs: 36 * 60 * 60 * 1000, // 36 hours
  splitDistanceMeters: 12_000, // ~12 km — city hop / beach→dinner
  tripRegionMeters: 80_000, // ~80 km region for multi-day trips
  minPhotos: 3,
  minDurationMsWithoutGps: 12 * 60 * 1000, // 12 minutes
  maxImportBurstMs: 90 * 1000, // 90s mass-import reject
};

/** Raw time/GPS cluster — no title or cover yet. */
export type PhotoCluster = {
  photos: PhotoAsset[];
  startAt: number;
  endAt: number;
  centroid?: AssetLocation;
};

/** Haversine distance in meters */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function centroidOf(photos: PhotoAsset[]): AssetLocation | undefined {
  const withLoc = photos.filter((p) => p.location);
  if (withLoc.length === 0) return undefined;
  const sum = withLoc.reduce(
    (acc, p) => ({
      latitude: acc.latitude + p.location!.latitude,
      longitude: acc.longitude + p.location!.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / withLoc.length,
    longitude: sum.longitude / withLoc.length,
  };
}

function lastLocated(photos: PhotoAsset[]): AssetLocation | undefined {
  for (let i = photos.length - 1; i >= 0; i--) {
    if (photos[i]?.location) return photos[i]!.location;
  }
  return undefined;
}

/**
 * Decide whether `next` continues the current event or starts a new one.
 * Pure / testable — the heart of “detect events, not photo dumps.”
 */
export function shouldStartNewEvent(
  current: PhotoAsset[],
  next: PhotoAsset,
  options: Required<ClusterOptions>,
): boolean {
  const prev = current[current.length - 1]!;
  const gap = next.createdAt - prev.createdAt;
  const center = centroidOf(current);
  const lastLoc = lastLocated(current);

  const nextLoc = next.location;
  const jumpFromCentroid =
    Boolean(center && nextLoc) &&
    distanceMeters(center!, nextLoc!) > options.splitDistanceMeters;
  const jumpFromLast =
    Boolean(lastLoc && nextLoc) &&
    distanceMeters(lastLoc!, nextLoc!) > options.splitDistanceMeters;

  // Significant place change → new event (even if only 20–40 minutes later).
  if (jumpFromCentroid || jumpFromLast) {
    return true;
  }

  // Still in the soft session window → same outing.
  if (gap <= options.sessionGapMs) {
    return false;
  }

  // Overnight / quiet stretch: only keep going when GPS says same region.
  if (gap <= options.tripBridgeGapMs && center && nextLoc) {
    const inRegion =
      distanceMeters(center, nextLoc) <= options.tripRegionMeters;
    return !inRegion;
  }

  // No reliable place continuity past the soft gap → new event.
  return true;
}

/**
 * Drop clusters that don't feel like a real outing
 * (screenshots, mass imports, tiny no-GPS blobs).
 */
export function isLikelyRealEvent(
  photos: PhotoAsset[],
  options: Required<ClusterOptions>,
): boolean {
  if (photos.length < options.minPhotos) return false;

  // Screenshots shouldn't form memories (when the flag is present).
  const realShots = photos.filter((p) => !p.isScreenshot);
  if (realShots.length < options.minPhotos) return false;

  const startAt = photos[0]!.createdAt;
  const endAt = photos[photos.length - 1]!.createdAt;
  const span = Math.max(0, endAt - startAt);
  const center = centroidOf(realShots.length ? realShots : photos);

  // All dumped in under ~90s → almost never a lived experience.
  if (span <= options.maxImportBurstMs) return false;

  if (!center) {
    // Without GPS we need a meaningful duration so random recent picks
    // don't become one memory.
    if (span < options.minDurationMsWithoutGps) return false;
  } else if (span < 2 * 60 * 1000 && photos.length < 5) {
    // GPS but too brief and thin — skip.
    return false;
  }

  return true;
}

/**
 * Clusters camera-roll assets into event-shaped photo groups.
 * Title/cover enrichment stays in later pipeline stages.
 */
export function clusterMoments(
  assets: PhotoAsset[],
  options: ClusterOptions = {},
): PhotoCluster[] {
  const opts: Required<ClusterOptions> = { ...DEFAULTS, ...options };
  const usable = assets.filter((a) => !a.isScreenshot);
  if (usable.length === 0) return [];

  const sorted = [...usable].sort((a, b) => a.createdAt - b.createdAt);
  const groups: PhotoAsset[][] = [];
  let current: PhotoAsset[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (shouldStartNewEvent(current, next, opts)) {
      groups.push(current);
      current = [next];
    } else {
      current.push(next);
    }
  }
  groups.push(current);

  return groups
    .filter((g) => isLikelyRealEvent(g, opts))
    .map((photos) => {
      const startAt = photos[0]!.createdAt;
      const endAt = photos[photos.length - 1]!.createdAt;
      return {
        photos,
        startAt,
        endAt,
        centroid: centroidOf(photos),
      };
    });
}
