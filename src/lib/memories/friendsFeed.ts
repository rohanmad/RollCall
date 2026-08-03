import { isSupabaseConfigured, supabase } from '../supabase';
import { type FriendshipRow } from '../friends/types';
import {
  mapMemoryToFeedItem,
  type MappedFeedItem,
} from './mapFeed';
import { mapMemoryRow, type MemoryRow } from './types';
import type { UserProfile } from '../../types/moment';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function isFriendsFeedReady(): boolean {
  return isSupabaseConfigured && Boolean(supabase);
}

async function listFriendIds(meId: string): Promise<string[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('friendships')
    .select('user_a, user_b')
    .or(`user_a.eq.${meId},user_b.eq.${meId}`);

  if (error) throw new Error(error.message);
  return ((data ?? []) as Pick<FriendshipRow, 'user_a' | 'user_b'>[]).map(
    (row) => (row.user_a === meId ? row.user_b : row.user_a),
  );
}

async function fetchProfiles(
  ids: string[],
): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();
  if (!ids.length) return map;
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .select('id, username, bio, avatar_url')
    .in('id', ids);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const id = row.id as string;
    const username = row.username as string;
    map.set(id, {
      id,
      name: username,
      handle: `@${username}`,
      bio: (row.bio as string | null) ?? undefined,
      avatarUri: (row.avatar_url as string | null) ?? undefined,
    });
  }
  return map;
}

async function listLikedMemoryIds(
  userId: string,
  memoryIds: string[],
): Promise<Set<string>> {
  if (!memoryIds.length) return new Set();
  const client = requireClient();
  const { data, error } = await client
    .from('likes')
    .select('memory_id')
    .eq('user_id', userId)
    .in('memory_id', memoryIds);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.memory_id as string));
}

export type FriendsFeedResult = {
  items: MappedFeedItem[];
  profiles: UserProfile[];
};

/**
 * Memories owned by accepted friends only (not the current user), newest first.
 */
export async function loadFriendsFeed(input: {
  meId: string;
  /** Optional; fetched from friendships when omitted. */
  friendIds?: string[];
  limit?: number;
}): Promise<FriendsFeedResult> {
  if (!isFriendsFeedReady()) {
    return { items: [], profiles: [] };
  }

  const client = requireClient();
  const friendIds = (input.friendIds ?? (await listFriendIds(input.meId))).filter(
    (id) => id !== input.meId,
  );
  if (!friendIds.length) {
    return { items: [], profiles: [] };
  }

  const limit = input.limit ?? 50;

  const { data, error } = await client
    .from('memories')
    .select('*')
    .in('owner_id', friendIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || 'Failed to load feed.');

  const memories = ((data ?? []) as MemoryRow[]).map(mapMemoryRow);
  const ownerIdSet = [...new Set(memories.map((m) => m.ownerId))];
  const [profilesById, likedIds] = await Promise.all([
    fetchProfiles(ownerIdSet),
    listLikedMemoryIds(
      input.meId,
      memories.map((m) => m.id),
    ),
  ]);

  const items = memories.map((memory) => {
    const author = profilesById.get(memory.ownerId) ?? {
      id: memory.ownerId,
      name: 'user',
      handle: '@user',
    };
    return mapMemoryToFeedItem({
      memory,
      author,
      meId: input.meId,
      likedByMe: likedIds.has(memory.id),
    });
  });

  return {
    items,
    profiles: [...profilesById.values()],
  };
}
