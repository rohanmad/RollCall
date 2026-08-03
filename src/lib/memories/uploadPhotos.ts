import { decode } from 'base64-arraybuffer';
import { File } from 'expo-file-system';
import { supabase } from '../supabase';

export const MEMORY_PHOTOS_BUCKET = 'memory-photos';

function guessContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.heic') || lower.includes('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/heic') return 'heic';
  return 'jpg';
}

function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

async function readLocalAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  const base64 = await file.base64();
  return decode(base64);
}

/**
 * Upload one photo into the memory-photos bucket.
 * Remote http(s) URIs are returned as-is (mock / already-hosted assets).
 */
export async function uploadMemoryPhoto(input: {
  ownerId: string;
  memoryId: string;
  photoId: string;
  uri: string;
  index: number;
}): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  if (isRemoteUrl(input.uri)) {
    return input.uri;
  }

  const contentType = guessContentType(input.uri);
  const ext = extensionFor(contentType);
  const safePhotoId = input.photoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'photo';
  const path = `${input.ownerId}/${input.memoryId}/${input.index}-${safePhotoId}.${ext}`;

  const body = await readLocalAsArrayBuffer(input.uri);
  const { error } = await supabase.storage
    .from(MEMORY_PHOTOS_BUCKET)
    .upload(path, body, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || 'Photo upload failed.');
  }

  const { data } = supabase.storage
    .from(MEMORY_PHOTOS_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

export async function uploadMemoryPhotos(input: {
  ownerId: string;
  memoryId: string;
  photos: Array<{ id: string; uri: string }>;
}): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < input.photos.length; i++) {
    const photo = input.photos[i]!;
    urls.push(
      await uploadMemoryPhoto({
        ownerId: input.ownerId,
        memoryId: input.memoryId,
        photoId: photo.id,
        uri: photo.uri,
        index: i,
      }),
    );
  }
  return urls;
}
