import { isSupabaseConfigured, supabase } from '../supabase';
import {
  createNotificationsForRecipients,
  listFriendRecipientIds,
} from '../notifications';
import { insertMemory } from './memoriesRepository';
import type { MemoryRecord } from './types';
import { uploadMemoryPhotos } from './uploadPhotos';
import type { PhotoAsset } from '../../types/moment';

export type PublishMemoryInput = {
  memoryId: string;
  ownerId: string;
  title: string;
  location?: string | null;
  coverPhotoId: string;
  photoIds: string[];
  photos: PhotoAsset[];
  createdAt: number;
};

export type PublishMemoryResult =
  | { ok: true; memory: MemoryRecord; mode: 'remote' }
  | { ok: true; memory: null; mode: 'local_only' }
  | { ok: false; error: string };

/**
 * Upload photos + insert the Memories row.
 * When Supabase isn't configured (local auth), returns local_only success.
 */
export async function publishMemory(
  input: PublishMemoryInput,
): Promise<PublishMemoryResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: true, memory: null, mode: 'local_only' };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: 'Sign in with cloud auth to sync memories.',
    };
  }
  if (session.user.id !== input.ownerId) {
    return { ok: false, error: 'Signed-in user does not match memory owner.' };
  }

  try {
    const ordered = input.photoIds
      .map((id) => input.photos.find((p) => p.id === id))
      .filter((p): p is PhotoAsset => Boolean(p));

    if (!ordered.length) {
      return { ok: false, error: 'Memory has no photos to upload.' };
    }

    const uploadedUrls = await uploadMemoryPhotos({
      ownerId: input.ownerId,
      memoryId: input.memoryId,
      photos: ordered.map((p) => ({ id: p.id, uri: p.uri })),
    });

    const coverIndex = Math.max(
      0,
      ordered.findIndex((p) => p.id === input.coverPhotoId),
    );
    const coverPhoto = uploadedUrls[coverIndex] ?? uploadedUrls[0]!;

    const memory = await insertMemory({
      id: input.memoryId,
      ownerId: input.ownerId,
      title: input.title,
      coverPhoto,
      photos: uploadedUrls,
      location: input.location ?? null,
      createdAt: new Date(input.createdAt).toISOString(),
    });

    try {
      const friendIds = await listFriendRecipientIds(input.ownerId);
      await createNotificationsForRecipients({
        recipientIds: friendIds,
        actorId: input.ownerId,
        type: 'friend_memory',
        entityId: memory.id,
        body: 'posted a new memory',
      });
    } catch (notifyError) {
      console.warn('[notifications] friend memory fan-out failed', notifyError);
    }

    return { ok: true, memory, mode: 'remote' };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to publish memory.';
    return { ok: false, error: message };
  }
}
