/**
 * Event-clustering smoke — run with:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' ... 
 * or compile via tsc. Prefer:
 *   node --import tsx doesn't work well with RN; use a pure cluster test:
 *   npx tsc --noEmit && node -e ... 
 *
 * This file is meant to be typechecked; run logic via the inline suite below
 * when executed in a RN-free context. For CI-less local check:
 *   npx tsc --noEmit
 */
import {
  clusterMoments,
  isLikelyRealEvent,
  shouldStartNewEvent,
} from './clusterMoments';
import type { PhotoAsset } from '../types/moment';

const MS_HOUR = 60 * 60 * 1000;
const base = Date.UTC(2026, 6, 11, 16, 0, 0);

function photo(
  id: string,
  hoursOffset: number,
  location?: { latitude: number; longitude: number },
): PhotoAsset {
  return {
    id,
    uri: `https://example.com/${id}.jpg`,
    createdAt: base + hoursOffset * MS_HOUR,
    location,
  };
}

const beach = { latitude: 32.6859, longitude: -117.1831 };
const otherCity = { latitude: 34.0522, longitude: -118.2437 };
const yosemite = { latitude: 37.8651, longitude: -119.5383 };

const opts = {
  sessionGapMs: 2.5 * MS_HOUR,
  tripBridgeGapMs: 36 * MS_HOUR,
  splitDistanceMeters: 12_000,
  tripRegionMeters: 80_000,
  minPhotos: 3,
  minDurationMsWithoutGps: 12 * 60 * 1000,
  maxImportBurstMs: 90 * 1000,
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Beach then far city → two events
const beachThenTrip: PhotoAsset[] = [
  ...Array.from({ length: 6 }, (_, i) =>
    photo(`beach-${i}`, i * 0.25, {
      latitude: beach.latitude + i * 0.001,
      longitude: beach.longitude,
    }),
  ),
  ...Array.from({ length: 4 }, (_, i) =>
    photo(`la-${i}`, 3 + i * 0.5, {
      latitude: otherCity.latitude + i * 0.001,
      longitude: otherCity.longitude,
    }),
  ),
];
assert(clusterMoments(beachThenTrip).length >= 2, 'Expected beach/LA split');

// Yosemite weekend → one trip
const yosemiteWeekend: PhotoAsset[] = [
  photo('y0', 0, yosemite),
  photo('y1', 2, yosemite),
  photo('y2', 5, yosemite),
  photo('y3', 26, yosemite),
  photo('y4', 28, yosemite),
  photo('y5', 50, yosemite),
  photo('y6', 52, yosemite),
];
assert(clusterMoments(yosemiteWeekend).length === 1, 'Expected 1 Yosemite trip');

// Mass import dump → none
const dump: PhotoAsset[] = Array.from({ length: 12 }, (_, i) => ({
  id: `dump-${i}`,
  uri: `https://example.com/dump-${i}.jpg`,
  createdAt: base + i * 2000,
}));
assert(clusterMoments(dump).length === 0, 'Import dump should not become a memory');
assert(!isLikelyRealEvent(dump, opts), 'Dump should fail isLikelyRealEvent');

// Screenshots → none
const shots = Array.from({ length: 5 }, (_, i) =>
  photo(`shot-${i}`, i * 0.1, beach),
).map((p) => ({ ...p, isScreenshot: true }));
assert(clusterMoments(shots).length === 0, 'Screenshots should not become a memory');

assert(
  shouldStartNewEvent(
    [photo('a', 0, beach), photo('b', 0.5, beach)],
    photo('c', 1, otherCity),
    opts,
  ),
  'Far location should start a new event',
);

console.log('clusterMoments event smoke OK', {
  beachLa: clusterMoments(beachThenTrip).map((c) => c.photos.length),
  yosemite: clusterMoments(yosemiteWeekend)[0]?.photos.length,
});
