import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PhotoAsset } from '../../types/moment';
import { publishMemory } from './publishMemory';
import type { MemorySyncStatus } from './types';

const QUEUE_KEY = 'rollcall.memorySyncQueue.v1';

export type MemorySyncJob = {
  memoryId: string;
  postId: string;
  momentId: string;
  ownerId: string;
  title: string;
  location?: string | null;
  coverPhotoId: string;
  photoIds: string[];
  /** Snapshot of local assets needed to upload / retry. */
  photos: PhotoAsset[];
  createdAt: number;
  status: MemorySyncStatus;
  error?: string;
  attempts: number;
  updatedAt: number;
};

type QueueStore = {
  jobs: MemorySyncJob[];
};

const EMPTY: QueueStore = { jobs: [] };

async function loadQueue(): Promise<QueueStore> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return { ...EMPTY, jobs: [] };
    const parsed = JSON.parse(raw) as Partial<QueueStore>;
    return { jobs: parsed.jobs ?? [] };
  } catch {
    return { ...EMPTY, jobs: [] };
  }
}

async function saveQueue(store: QueueStore): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(store));
}

export async function listSyncJobs(): Promise<MemorySyncJob[]> {
  const store = await loadQueue();
  return store.jobs;
}

export async function getSyncJob(
  memoryId: string,
): Promise<MemorySyncJob | null> {
  const store = await loadQueue();
  return store.jobs.find((j) => j.memoryId === memoryId) ?? null;
}

export async function enqueueMemorySync(
  job: Omit<MemorySyncJob, 'status' | 'attempts' | 'updatedAt' | 'error'>,
): Promise<MemorySyncJob> {
  const store = await loadQueue();
  const nextJob: MemorySyncJob = {
    ...job,
    status: 'pending',
    attempts: 0,
    updatedAt: Date.now(),
  };
  const jobs = [
    nextJob,
    ...store.jobs.filter((j) => j.memoryId !== job.memoryId),
  ];
  await saveQueue({ jobs });
  return nextJob;
}

export async function patchSyncJob(
  memoryId: string,
  patch: Partial<MemorySyncJob>,
): Promise<MemorySyncJob | null> {
  const store = await loadQueue();
  let updated: MemorySyncJob | null = null;
  const jobs = store.jobs.map((job) => {
    if (job.memoryId !== memoryId) return job;
    updated = { ...job, ...patch, updatedAt: Date.now() };
    return updated;
  });
  if (!updated) return null;
  await saveQueue({ jobs });
  return updated;
}

export async function removeSyncJob(memoryId: string): Promise<void> {
  const store = await loadQueue();
  await saveQueue({
    jobs: store.jobs.filter((j) => j.memoryId !== memoryId),
  });
}

type SyncListener = (job: MemorySyncJob) => void;

const listeners = new Set<SyncListener>();

export function subscribeMemorySync(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(job: MemorySyncJob) {
  for (const listener of listeners) listener(job);
}

let flushing = false;

/**
 * Process pending/failed jobs one at a time.
 * Safe to call often (post, foreground, retry).
 */
export async function flushMemorySyncQueue(options?: {
  onlyMemoryId?: string;
}): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const store = await loadQueue();
    const targets = store.jobs.filter((job) => {
      if (options?.onlyMemoryId && job.memoryId !== options.onlyMemoryId) {
        return false;
      }
      return (
        job.status === 'pending' ||
        job.status === 'failed' ||
        job.status === 'uploading'
      );
    });

    for (const job of targets) {
      const uploading = await patchSyncJob(job.memoryId, {
        status: 'uploading',
        error: undefined,
      });
      if (uploading) emit(uploading);

      const result = await publishMemory({
        memoryId: job.memoryId,
        ownerId: job.ownerId,
        title: job.title,
        location: job.location,
        coverPhotoId: job.coverPhotoId,
        photoIds: job.photoIds,
        photos: job.photos,
        createdAt: job.createdAt,
      });

      if (!result.ok) {
        const failed = await patchSyncJob(job.memoryId, {
          status: 'failed',
          error: result.error,
          attempts: job.attempts + 1,
        });
        if (failed) emit(failed);
        continue;
      }

      if (result.mode === 'local_only') {
        const localOnly = await patchSyncJob(job.memoryId, {
          status: 'local_only',
          error: undefined,
          attempts: job.attempts + 1,
          // Drop binary snapshots once we know we won't upload.
          photos: [],
        });
        if (localOnly) emit(localOnly);
        continue;
      }

      const synced = await patchSyncJob(job.memoryId, {
        status: 'synced',
        error: undefined,
        attempts: job.attempts + 1,
        photos: [],
      });
      if (synced) emit(synced);
    }
  } finally {
    flushing = false;
  }
}
