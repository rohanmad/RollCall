import { isSupabaseConfigured, supabase } from '../supabase';
import { createNotification } from '../notifications';
import { emitFriendEvent } from './events';
import {
  mapFriendRequest,
  mapFriendship,
  orderedPair,
  otherUserId,
  type FriendProfile,
  type FriendRequest,
  type FriendRequestRow,
  type Friendship,
  type FriendshipRow,
} from './types';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function isFriendsBackendReady(): boolean {
  return isSupabaseConfigured && Boolean(supabase);
}

async function fetchProfilesByIds(ids: string[]): Promise<FriendProfile[]> {
  if (!ids.length) return [];
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .select('id, username, bio, avatar_url')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    username: row.username as string,
    bio: (row.bio as string | null) ?? undefined,
    avatarUri: (row.avatar_url as string | null) ?? undefined,
  }));
}

export async function searchProfilesByUsername(
  query: string,
  excludeUserId?: string,
): Promise<FriendProfile[]> {
  if (!isFriendsBackendReady()) return [];
  const client = requireClient();
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (!q) return [];

  let request = client
    .from('profiles')
    .select('id, username, bio, avatar_url')
    .ilike('username', `%${q}%`)
    .limit(20);

  if (excludeUserId) {
    request = request.neq('id', excludeUserId);
  }

  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    username: row.username as string,
    bio: (row.bio as string | null) ?? undefined,
    avatarUri: (row.avatar_url as string | null) ?? undefined,
  }));
}

export async function listFriendRequestsForUser(
  userId: string,
): Promise<FriendRequest[]> {
  if (!isFriendsBackendReady()) return [];
  const client = requireClient();
  const { data, error } = await client
    .from('friend_requests')
    .select('*')
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as FriendRequestRow[]).map(mapFriendRequest);
}

export async function listFriendshipsForUser(
  userId: string,
): Promise<Friendship[]> {
  if (!isFriendsBackendReady()) return [];
  const client = requireClient();
  const { data, error } = await client
    .from('friendships')
    .select('*')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as FriendshipRow[]).map(mapFriendship);
}

export async function loadFriendsGraph(userId: string): Promise<{
  requests: FriendRequest[];
  friendships: Friendship[];
  profiles: FriendProfile[];
}> {
  const [requests, friendships] = await Promise.all([
    listFriendRequestsForUser(userId),
    listFriendshipsForUser(userId),
  ]);

  const profileIds = new Set<string>();
  for (const r of requests) {
    profileIds.add(r.fromUserId);
    profileIds.add(r.toUserId);
  }
  for (const f of friendships) {
    profileIds.add(otherUserId(f, userId));
  }
  profileIds.delete(userId);

  const profiles = await fetchProfilesByIds([...profileIds]);
  return { requests, friendships, profiles };
}

export async function sendFriendRequest(input: {
  fromUserId: string;
  toUserId: string;
}): Promise<FriendRequest> {
  const client = requireClient();
  if (input.fromUserId === input.toUserId) {
    throw new Error('You can’t add yourself.');
  }

  const [userA, userB] = orderedPair(input.fromUserId, input.toUserId);
  const { data: existingFriendship, error: friendshipLookupError } =
    await client
      .from('friendships')
      .select('id')
      .eq('user_a', userA)
      .eq('user_b', userB)
      .maybeSingle();

  if (friendshipLookupError) throw new Error(friendshipLookupError.message);
  if (existingFriendship) {
    throw new Error('You’re already friends.');
  }

  const { data, error } = await client
    .from('friend_requests')
    .insert({
      from_user_id: input.fromUserId,
      to_user_id: input.toUserId,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A friend request is already pending.');
    }
    throw new Error(error.message || 'Could not send request.');
  }

  const request = mapFriendRequest(data as FriendRequestRow);
  emitFriendEvent({ type: 'request_sent', request });
  void createNotification({
    recipientId: input.toUserId,
    actorId: input.fromUserId,
    type: 'friend_request',
    entityId: request.id,
    body: 'sent you a friend request',
  });
  return request;
}

export async function acceptFriendRequest(input: {
  requestId: string;
  meId: string;
}): Promise<{ request: FriendRequest; friendship: Friendship }> {
  const client = requireClient();

  const { data: existing, error: loadError } = await client
    .from('friend_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error('Request not found.');

  const row = existing as FriendRequestRow;
  if (row.to_user_id !== input.meId) {
    throw new Error('Only the recipient can accept this request.');
  }
  if (row.status !== 'pending') {
    throw new Error('This request is no longer pending.');
  }

  const { data: updated, error: updateError } = await client
    .from('friend_requests')
    .update({ status: 'accepted' })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (updateError) throw new Error(updateError.message);

  const [userA, userB] = orderedPair(row.from_user_id, row.to_user_id);
  const { data: friendshipRow, error: friendshipError } = await client
    .from('friendships')
    .upsert(
      { user_a: userA, user_b: userB },
      { onConflict: 'user_a,user_b' },
    )
    .select('*')
    .single();

  if (friendshipError) throw new Error(friendshipError.message);

  const request = mapFriendRequest(updated as FriendRequestRow);
  const friendship = mapFriendship(friendshipRow as FriendshipRow);
  emitFriendEvent({ type: 'request_accepted', request, friendship });
  void createNotification({
    recipientId: row.from_user_id,
    actorId: input.meId,
    type: 'friend_accepted',
    entityId: friendship.id,
    body: 'accepted your friend request',
  });
  return { request, friendship };
}

export async function declineFriendRequest(input: {
  requestId: string;
  meId: string;
}): Promise<FriendRequest> {
  const client = requireClient();

  const { data: existing, error: loadError } = await client
    .from('friend_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error('Request not found.');

  const row = existing as FriendRequestRow;
  if (row.to_user_id !== input.meId) {
    throw new Error('Only the recipient can decline this request.');
  }
  if (row.status !== 'pending') {
    throw new Error('This request is no longer pending.');
  }

  const { data, error } = await client
    .from('friend_requests')
    .update({ status: 'declined' })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const request = mapFriendRequest(data as FriendRequestRow);
  emitFriendEvent({ type: 'request_declined', request });
  return request;
}

export async function cancelFriendRequest(input: {
  requestId: string;
  meId: string;
}): Promise<FriendRequest> {
  const client = requireClient();

  const { data: existing, error: loadError } = await client
    .from('friend_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!existing) throw new Error('Request not found.');

  const row = existing as FriendRequestRow;
  if (row.from_user_id !== input.meId) {
    throw new Error('Only the sender can cancel this request.');
  }
  if (row.status !== 'pending') {
    throw new Error('This request is no longer pending.');
  }

  const { data, error } = await client
    .from('friend_requests')
    .update({ status: 'canceled' })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const request = mapFriendRequest(data as FriendRequestRow);
  emitFriendEvent({ type: 'request_canceled', request });
  return request;
}

export async function removeFriendship(input: {
  meId: string;
  otherUserId: string;
}): Promise<void> {
  const client = requireClient();
  const [userA, userB] = orderedPair(input.meId, input.otherUserId);

  const { data, error } = await client
    .from('friendships')
    .delete()
    .eq('user_a', userA)
    .eq('user_b', userB)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  emitFriendEvent({
    type: 'friend_removed',
    userId: input.otherUserId,
    friendshipId: data?.id as string | undefined,
  });
}
