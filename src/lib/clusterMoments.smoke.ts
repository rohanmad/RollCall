/**
 * Tiny smoke check for clustering + enrichment — run with:
 *   npx tsx src/lib/clusterMoments.smoke.ts
 */
import { clusterMoments } from './clusterMoments';
import { createMemoryDraftSync } from './memoryPipeline/createMemoryDraft';
import { generateMemoryTitle } from './memoryPipeline/generateTitle';
import { selectCoverPhotoSync } from './memoryPipeline/selectCoverPhoto';
import { mockPhotos } from '../data/mockData';

const clusters = clusterMoments(mockPhotos);
console.log(
  clusters.map((c) => ({
    photos: c.photos.length,
    start: new Date(c.startAt).toISOString(),
  })),
);

if (clusters.length < 2) {
  throw new Error(`Expected at least 2 clusters, got ${clusters.length}`);
}

const drafts = clusters.map((c) =>
  createMemoryDraftSync(c, { placeName: 'San Francisco' }),
);
for (const draft of drafts) {
  if (!draft.coverPhotoId) throw new Error('Missing coverPhotoId');
  if (!draft.title || draft.title.split(/\s+/).length > 5) {
    throw new Error(`Bad title: ${draft.title}`);
  }
  if (!draft.photoIds.includes(draft.coverPhotoId)) {
    throw new Error('Cover not in photoIds');
  }
}

const cover = selectCoverPhotoSync(clusters[0].photos);
const title = generateMemoryTitle({
  startAt: clusters[0].startAt,
  endAt: clusters[0].endAt,
  placeName: 'Coronado',
});
console.log({ cover: cover.id, title, draftTitles: drafts.map((d) => d.title) });

console.log('memory pipeline smoke OK');
