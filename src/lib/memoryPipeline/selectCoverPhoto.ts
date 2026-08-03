import type { PhotoAsset } from '../../types/moment';

/**
 * Optional quality signals for cover ranking.
 * Pixel/ML providers can supply these later; heuristics fill gaps today.
 */
export type CoverSignals = {
  /** 0–1, higher = sharper */
  sharpness?: number;
  /** 0–1, higher = better-exposed (not too dark/bright) */
  brightness?: number;
  /** Detected faces, when a face provider is available */
  faceCount?: number;
};

export type CoverSignalProvider = (
  photo: PhotoAsset,
  context: { cluster: PhotoAsset[] },
) => CoverSignals | Promise<CoverSignals>;

export type CoverScoreBreakdown = {
  photoId: string;
  total: number;
  resolution: number;
  sharpness: number;
  brightness: number;
  faces: number;
  aspect: number;
  centrality: number;
  duplicatePenalty: number;
};

const BURST_WINDOW_MS = 2_000;
/** Memory cards are slightly portrait — prefer covers near this ratio (h/w). */
const TARGET_ASPECT = 1.15;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Resolution score from pixel count (metadata). */
export function scoreResolution(photo: PhotoAsset): number {
  const w = photo.width ?? 0;
  const h = photo.height ?? 0;
  if (w <= 0 || h <= 0) return 0.35;
  const mp = (w * h) / 1_000_000;
  // Soft-cap around 12MP — phones beyond that aren't meaningfully better as covers.
  return clamp01(Math.log10(1 + mp) / Math.log10(1 + 12));
}

/**
 * Sharpness proxy when pixel analysis isn't available:
 * higher-res frames + mid-burst frames tend to be sharper than raise/lower shots.
 */
export function estimateSharpnessProxy(
  photo: PhotoAsset,
  cluster: PhotoAsset[],
): number {
  const resolution = scoreResolution(photo);
  const sorted = [...cluster].sort((a, b) => a.createdAt - b.createdAt);
  const index = sorted.findIndex((p) => p.id === photo.id);
  if (index < 0) return resolution;

  // Detect local burst neighbors.
  let burstStart = index;
  let burstEnd = index;
  while (
    burstStart > 0 &&
    sorted[burstStart].createdAt - sorted[burstStart - 1].createdAt <= BURST_WINDOW_MS
  ) {
    burstStart -= 1;
  }
  while (
    burstEnd < sorted.length - 1 &&
    sorted[burstEnd + 1].createdAt - sorted[burstEnd].createdAt <= BURST_WINDOW_MS
  ) {
    burstEnd += 1;
  }

  const burstLen = burstEnd - burstStart + 1;
  let burstScore = 0.7;
  if (burstLen >= 3) {
    const mid = (burstStart + burstEnd) / 2;
    const dist = Math.abs(index - mid) / (burstLen / 2);
    // Edges of a burst often blurrier; middle preferred.
    burstScore = clamp01(1 - dist * 0.55);
  } else if (burstLen === 1) {
    burstScore = 0.85;
  }

  return clamp01(resolution * 0.55 + burstScore * 0.45);
}

/**
 * Brightness proxy from capture time — midday / golden hour usually better lit.
 * Replace with pixel luminance when an image analyzer is plugged in.
 */
export function estimateBrightnessProxy(photo: PhotoAsset): number {
  const hour =
    new Date(photo.createdAt).getHours() +
    new Date(photo.createdAt).getMinutes() / 60;

  // Night: weak
  if (hour < 5.5 || hour >= 22) return 0.2;
  // Early morning
  if (hour < 7) return 0.45;
  // Morning
  if (hour < 10) return 0.75;
  // Midday
  if (hour < 16) return 0.9;
  // Golden hour
  if (hour < 19.5) return 0.95;
  // Evening
  if (hour < 21) return 0.55;
  return 0.3;
}

function scoreAspect(photo: PhotoAsset): number {
  const w = photo.width ?? 0;
  const h = photo.height ?? 0;
  if (w <= 0 || h <= 0) return 0.5;
  const aspect = h / w;
  const delta = Math.abs(Math.log(aspect / TARGET_ASPECT));
  return clamp01(1 - delta);
}

function scoreCentrality(photo: PhotoAsset, cluster: PhotoAsset[]): number {
  if (cluster.length <= 1) return 1;
  const times = cluster.map((p) => p.createdAt);
  const min = Math.min(...times);
  const max = Math.max(...times);
  if (max <= min) return 1;
  const t = (photo.createdAt - min) / (max - min);
  // Prefer mid-event covers over first/last frames.
  return clamp01(1 - Math.abs(t - 0.5) * 1.4);
}

function isNearDuplicate(a: PhotoAsset, b: PhotoAsset): boolean {
  if (Math.abs(a.createdAt - b.createdAt) > BURST_WINDOW_MS) return false;
  const aw = a.width ?? 0;
  const ah = a.height ?? 0;
  const bw = b.width ?? 0;
  const bh = b.height ?? 0;
  if (aw > 0 && ah > 0 && bw > 0 && bh > 0) {
    const ratio = (aw * ah) / (bw * bh);
    if (ratio < 0.85 || ratio > 1.15) return false;
  }
  return true;
}

export function scoreCoverCandidate(
  photo: PhotoAsset,
  cluster: PhotoAsset[],
  signals: CoverSignals = {},
): CoverScoreBreakdown {
  const resolution = scoreResolution(photo);
  const sharpness = signals.sharpness ?? estimateSharpnessProxy(photo, cluster);
  const brightness = signals.brightness ?? estimateBrightnessProxy(photo);
  const faceCount = signals.faceCount ?? 0;
  const faces = clamp01(faceCount > 0 ? 0.55 + Math.min(faceCount, 3) * 0.15 : 0);
  const aspect = scoreAspect(photo);
  const centrality = scoreCentrality(photo, cluster);

  // Soft duplicate penalty vs higher-resolution near neighbors (applied later in select).
  const duplicatePenalty = 0;

  const total =
    resolution * 0.2 +
    sharpness * 0.28 +
    brightness * 0.18 +
    faces * 0.16 +
    aspect * 0.08 +
    centrality * 0.1 -
    duplicatePenalty;

  return {
    photoId: photo.id,
    total,
    resolution,
    sharpness,
    brightness,
    faces,
    aspect,
    centrality,
    duplicatePenalty,
  };
}

/**
 * Rank covers with metadata heuristics (resolution, brightness/sharpness proxies,
 * optional face signals, de-dup). Highest score first.
 */
export async function rankCoverPhotos(
  photos: PhotoAsset[],
  options?: { getSignals?: CoverSignalProvider; limit?: number },
): Promise<PhotoAsset[]> {
  if (photos.length === 0) {
    throw new Error('rankCoverPhotos requires at least one photo');
  }
  if (photos.length === 1) return [...photos];

  const getSignals = options?.getSignals;
  const scored: { photo: PhotoAsset; breakdown: CoverScoreBreakdown }[] = [];

  for (const photo of photos) {
    const signals = getSignals
      ? await getSignals(photo, { cluster: photos })
      : {};
    scored.push({
      photo,
      breakdown: scoreCoverCandidate(photo, photos, signals),
    });
  }

  scored.sort((a, b) => b.breakdown.total - a.breakdown.total);
  const accepted: typeof scored = [];
  for (const candidate of scored) {
    const dupOfAccepted = accepted.some((a) =>
      isNearDuplicate(a.photo, candidate.photo),
    );
    if (dupOfAccepted) {
      candidate.breakdown.duplicatePenalty = 0.35;
      candidate.breakdown.total -= 0.35;
      continue;
    }
    accepted.push(candidate);
  }

  const pool = accepted.length ? accepted : scored;
  pool.sort((a, b) => b.breakdown.total - a.breakdown.total);
  const ranked = pool.map((p) => p.photo);
  const limit = options?.limit;
  return limit != null ? ranked.slice(0, Math.max(1, limit)) : ranked;
}

/**
 * Pick the best representative cover for a memory cluster.
 */
export async function selectCoverPhoto(
  photos: PhotoAsset[],
  options?: { getSignals?: CoverSignalProvider },
): Promise<PhotoAsset> {
  const ranked = await rankCoverPhotos(photos, options);
  return ranked[0]!;
}

/** Sync helper for tests / mocks (no async signal provider). */
export function selectCoverPhotoSync(photos: PhotoAsset[]): PhotoAsset {
  if (photos.length === 0) {
    throw new Error('selectCoverPhotoSync requires at least one photo');
  }
  if (photos.length === 1) return photos[0]!;

  const scored = photos.map((photo) => ({
    photo,
    breakdown: scoreCoverCandidate(photo, photos),
  }));
  scored.sort((a, b) => b.breakdown.total - a.breakdown.total);

  const accepted: typeof scored = [];
  for (const candidate of scored) {
    if (accepted.some((a) => isNearDuplicate(a.photo, candidate.photo))) {
      continue;
    }
    accepted.push(candidate);
  }
  const pool = accepted.length ? accepted : scored;
  return pool[0]!.photo;
}
