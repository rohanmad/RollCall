import { supabase } from '../supabase';
import {
  mapMemoryRow,
  type CreateMemoryInput,
  type MemoryRecord,
  type MemoryRow,
} from './types';

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  return supabase;
}

/** Insert a memory row. Photos must already be hosted URLs. */
export async function insertMemory(
  input: CreateMemoryInput,
): Promise<MemoryRecord> {
  const client = requireClient();
  const { data, error } = await client
    .from('memories')
    .insert({
      id: input.id,
      owner_id: input.ownerId,
      title: input.title.trim(),
      cover_photo: input.coverPhoto,
      photos: input.photos,
      location: input.location?.trim() || null,
      created_at: input.createdAt ?? new Date().toISOString(),
      likes_count: 0,
      comments_count: 0,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Failed to create memory.');
  }

  return mapMemoryRow(data as MemoryRow);
}

export async function getMemoryById(id: string): Promise<MemoryRecord | null> {
  const client = requireClient();
  const { data, error } = await client
    .from('memories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load memory.');
  }
  if (!data) return null;
  return mapMemoryRow(data as MemoryRow);
}

/** Future friend feed / profile queries share this repository. */
export async function listMemoriesByOwner(
  ownerId: string,
  options?: { limit?: number },
): Promise<MemoryRecord[]> {
  const client = requireClient();
  const limit = options?.limit ?? 50;
  const { data, error } = await client
    .from('memories')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to list memories.');
  }

  return (data as MemoryRow[]).map(mapMemoryRow);
}

export async function listRecentMemories(options?: {
  limit?: number;
}): Promise<MemoryRecord[]> {
  const client = requireClient();
  const limit = options?.limit ?? 50;
  const { data, error } = await client
    .from('memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to list memories.');
  }

  return (data as MemoryRow[]).map(mapMemoryRow);
}

export async function deleteMemory(id: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('memories').delete().eq('id', id);
  if (error) {
    throw new Error(error.message || 'Failed to delete memory.');
  }
}
