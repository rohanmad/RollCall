/**
 * Tiny smoke check for clustering — run with:
 *   npx tsx src/lib/clusterMoments.smoke.ts
 */
import { clusterMoments } from './clusterMoments';
import { mockPhotos } from '../data/mockData';

const moments = clusterMoments(mockPhotos);
console.log(
  moments.map((m) => ({
    title: m.title,
    photos: m.photoIds.length,
    status: m.status,
  })),
);

if (moments.length < 2) {
  throw new Error(`Expected at least 2 moments, got ${moments.length}`);
}

console.log('clusterMoments smoke OK');
