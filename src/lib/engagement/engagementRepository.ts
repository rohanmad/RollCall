import { isSupabaseConfigured, supabase } from '../supabase';
import { createNotification } from '../notifications';
import {
  mapCommentRow,
  type CommentRow,
  type LikeRow,
  type MemoryEngagement,
} from './types';
import type { PostComment } from '../../types/moment';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function isEngagementBackendReady(): boolean {
  return isSupabaseConfigured && Boolean(supabase);
}

export async function setLike(input: {
  memoryId: string;
  userId: string;
  liked: boolean;
}): Promise<void> {
  const client = requireClient();

  if (input.liked) {
    const { error } = await client.from('likes').insert({
      memory_id: input.memoryId,
      user_id: input.userId,
    });
    if (error) {
      // Duplicate like is fine (race / double tap)
      if (error.code === '23505') return;
      throw new Error(error.message || 'Could not like memory.');
    }

    const { data: memory } = await client
      .from('memories')
      .select('owner_id')
      .eq('id', input.memoryId)
      .maybeSingle();
    const ownerId = memory?.owner_id as string | undefined;
    if (ownerId && ownerId !== input.userId) {
      void createNotification({
        recipientId: ownerId,
        actorId: input.userId,
        type: 'memory_liked',
        entityId: input.memoryId,
        body: 'liked your memory',
      });
    }
    return;
  }

  const { error } = await client
    .from('likes')
    .delete()
    .eq('memory_id', input.memoryId)
    .eq('user_id', input.userId);

  if (error) throw new Error(error.message || 'Could not unlike memory.');
}

export async function addCommentRemote(input: {
  memoryId: string;
  authorId: string;
  body: string;
  postId: string;
  authorUsername: string;
}): Promise<PostComment> {
  const client = requireClient();
  const trimmed = input.body.trim();
  if (!trimmed) throw new Error('Comment can’t be empty.');

  const { data, error } = await client
    .from('comments')
    .insert({
      memory_id: input.memoryId,
      author_id: input.authorId,
      body: trimmed,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'Could not add comment.');

  const comment = mapCommentRow(data as CommentRow, input.postId, {
    username: input.authorUsername,
  });

  const { data: memory } = await client
    .from('memories')
    .select('owner_id')
    .eq('id', input.memoryId)
    .maybeSingle();
  const ownerId = memory?.owner_id as string | undefined;
  if (ownerId && ownerId !== input.authorId) {
    void createNotification({
      recipientId: ownerId,
      actorId: input.authorId,
      type: 'memory_commented',
      entityId: input.memoryId,
      body: 'commented on your memory',
    });
  }

  return comment;
}

export async function loadEngagement(
  memoryId: string,
  postId: string,
): Promise<MemoryEngagement> {
  const client = requireClient();

  const [likesRes, commentsRes, memoryRes] = await Promise.all([
    client.from('likes').select('user_id').eq('memory_id', memoryId),
    client
      .from('comments')
      .select('*')
      .eq('memory_id', memoryId)
      .order('created_at', { ascending: true }),
    client
      .from('memories')
      .select('likes_count, comments_count')
      .eq('id', memoryId)
      .maybeSingle(),
  ]);

  if (likesRes.error) throw new Error(likesRes.error.message);
  if (commentsRes.error) throw new Error(commentsRes.error.message);
  if (memoryRes.error) throw new Error(memoryRes.error.message);

  const likeRows = (likesRes.data ?? []) as Pick<LikeRow, 'user_id'>[];
  const commentRows = (commentsRes.data ?? []) as CommentRow[];

  const authorIds = [...new Set(commentRows.map((c) => c.author_id))];
  const usernameById = new Map<string, string>();

  if (authorIds.length) {
    const { data: profiles, error: profileError } = await client
      .from('profiles')
      .select('id, username')
      .in('id', authorIds);
    if (profileError) throw new Error(profileError.message);
    for (const p of profiles ?? []) {
      usernameById.set(p.id as string, p.username as string);
    }
  }

  const comments = commentRows.map((row) =>
    mapCommentRow(row, postId, {
      username: usernameById.get(row.author_id) ?? 'user',
    }),
  );

  const likedByUserIds = likeRows.map((r) => r.user_id);
  const likesCount =
    (memoryRes.data?.likes_count as number | undefined) ??
    likedByUserIds.length;
  const commentsCount =
    (memoryRes.data?.comments_count as number | undefined) ?? comments.length;

  return {
    likedByUserIds,
    comments,
    likesCount,
    commentsCount,
  };
}
