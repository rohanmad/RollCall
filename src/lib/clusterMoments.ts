import type { Moment, PhotoAsset } from '../types/moment';

export type ClusterOptions = {
  /** Max gap between consecutive photos before starting a new moment */
  maxGapMs?: number;
  /** Max distance (meters) from cluster centroid to stay in the same moment */
  maxDistanceMeters?: number;
  /** Minimum photos required to form a moment */
  minPhotos?: number;
};

const DEFAULTS: Required<ClusterOptions> = {
  maxGapMs: 6 * 60 * 60 * 1000, // 6 hours
  maxDistanceMeters: 25_000, // 25 km — trips stay together; city hops may split
  minPhotos: 3,
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

function centroidOf(photos: PhotoAsset[]) {
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

function formatTitle(startAt: number, endAt: number, centroid?: Moment['centroid']): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const dayLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  if (centroid) {
    return sameDay ? `Day out · ${dayLabel}` : `Trip · ${dayLabel}`;
  }
  return sameDay ? `Moments · ${dayLabel}` : `Weekend · ${dayLabel}`;
}

/**
 * Clusters camera-roll assets into draft moments using time gaps + optional GPS.
 * Pure function — easy to unit test and swap for a smarter curator later.
 */
export function clusterMoments(
  assets: PhotoAsset[],
  options: ClusterOptions = {},
): Moment[] {
  const { maxGapMs, maxDistanceMeters, minPhotos } = { ...DEFAULTS, ...options };
  if (assets.length === 0) return [];

  const sorted = [...assets].sort((a, b) => a.createdAt - b.createdAt);
  const groups: PhotoAsset[][] = [];
  let current: PhotoAsset[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    const gap = next.createdAt - prev.createdAt;
    const center = centroidOf(current);

    let tooFar = false;
    if (center && next.location) {
      tooFar = distanceMeters(center, next.location) > maxDistanceMeters;
    }

    if (gap > maxGapMs || tooFar) {
      groups.push(current);
      current = [next];
    } else {
      current.push(next);
    }
  }
  groups.push(current);

  return groups
    .filter((g) => g.length >= minPhotos)
    .map((photos, index) => {
      const startAt = photos[0].createdAt;
      const endAt = photos[photos.length - 1].createdAt;
      const centroid = centroidOf(photos);
      const coverPhotoId = photos[Math.floor(photos.length / 2)].id;

      return {
        id: `moment-${startAt}-${index}`,
        title: formatTitle(startAt, endAt, centroid),
        startAt,
        endAt,
        photoIds: photos.map((p) => p.id),
        coverPhotoId,
        centroid,
        status: 'draft' as const,
      };
    });
}
