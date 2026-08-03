/** Canonical memory record shared by repository, sync queue, and future feeds. */

export type MemoryRecord = {
  id: string;
  ownerId: string;
  title: string;
  coverPhoto: string;
  photos: string[];
  location: string | null;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
};

export type CreateMemoryInput = {
  id: string;
  ownerId: string;
  title: string;
  coverPhoto: string;
  photos: string[];
  location?: string | null;
  createdAt?: string;
};

export type MemorySyncStatus =
  | 'pending'
  | 'uploading'
  | 'synced'
  | 'failed'
  | 'local_only';

/** Row shape returned by Supabase (`memories` table). */
export type MemoryRow = {
  id: string;
  owner_id: string;
  title: string;
  cover_photo: string;
  photos: string[];
  location: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
};

export function mapMemoryRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    coverPhoto: row.cover_photo,
    photos: row.photos ?? [],
    location: row.location,
    createdAt: row.created_at,
    likesCount: row.likes_count ?? 0,
    commentsCount: row.comments_count ?? 0,
  };
}
