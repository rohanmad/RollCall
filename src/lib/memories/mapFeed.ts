import type {
  Moment,
  PhotoAsset,
  PostComment,
  SharedMomentPost,
  UserProfile,
} from '../../types/moment';
import type { MemoryRecord } from './types';

export type MappedFeedItem = {
  post: SharedMomentPost;
  moment: Moment;
  photos: PhotoAsset[];
};

/** Placeholder ids so MemoryCard can show like/comment counts without a full load. */
function placeholderLikeIds(
  memoryId: string,
  likesCount: number,
  likedByMe: boolean,
  meId: string,
): string[] {
  const others = Math.max(0, likesCount - (likedByMe ? 1 : 0));
  return [
    ...(likedByMe ? [meId] : []),
    ...Array.from({ length: others }, (_, i) => `__like_${memoryId}_${i}`),
  ];
}

function placeholderComments(
  memoryId: string,
  commentsCount: number,
): PostComment[] {
  return Array.from({ length: Math.max(0, commentsCount) }, (_, i) => ({
    id: `__comment_${memoryId}_${i}`,
    postId: memoryId,
    authorId: '',
    authorName: '',
    authorHandle: '',
    body: '',
    createdAt: 0,
  }));
}

export function mapMemoryToFeedItem(input: {
  memory: MemoryRecord;
  author: UserProfile;
  meId: string;
  likedByMe: boolean;
}): MappedFeedItem {
  const { memory, author, meId, likedByMe } = input;
  const createdAt = Date.parse(memory.createdAt) || Date.now();

  const photos: PhotoAsset[] = memory.photos.map((uri, index) => ({
    id: `${memory.id}-p-${index}`,
    uri,
    createdAt,
  }));

  const coverIndex = memory.photos.findIndex((uri) => uri === memory.coverPhoto);
  const coverPhotoId =
    photos[coverIndex >= 0 ? coverIndex : 0]?.id ?? `${memory.id}-p-0`;

  const moment: Moment = {
    id: memory.id,
    title: memory.title,
    locationLabel: memory.location ?? undefined,
    startAt: createdAt,
    endAt: createdAt,
    photoIds: photos.map((p) => p.id),
    coverPhotoId,
    status: 'shared',
    sharedAt: createdAt,
    remoteId: memory.id,
    syncStatus: 'synced',
  };

  const post: SharedMomentPost = {
    id: memory.id,
    momentId: memory.id,
    authorId: author.id,
    authorName: author.name,
    authorHandle: author.handle,
    sharedAt: createdAt,
    audienceCount: 0,
    likedByUserIds: placeholderLikeIds(
      memory.id,
      memory.likesCount,
      likedByMe,
      meId,
    ),
    comments: placeholderComments(memory.id, memory.commentsCount),
    remoteId: memory.id,
    syncStatus: 'synced',
  };

  return { post, moment, photos };
}

/** Friends feed is remote-only; own posts live on Profile via myPosts. */
export function mergeFriendsFeed(input: {
  remotePosts: SharedMomentPost[];
  currentPosts: SharedMomentPost[];
  meId: string;
}): SharedMomentPost[] {
  const remoteIds = new Set(
    input.remotePosts.map((p) => p.remoteId ?? p.id),
  );

  // Keep in-memory friend posts that aren't in the latest remote page yet
  // (e.g. engagement updates), but never keep the current user's posts.
  const retained = input.currentPosts.filter((post) => {
    if (post.authorId === input.meId) return false;
    const id = post.remoteId ?? post.id;
    return !remoteIds.has(id);
  });

  return [...input.remotePosts, ...retained].sort(
    (a, b) => b.sharedAt - a.sharedAt,
  );
}

/** Prefer local shared moment (camera-roll URIs) for the current user's posts. */
export function relinkOwnPostsToLocalMoments(
  posts: SharedMomentPost[],
  sharedMine: Moment[],
  meId: string,
): SharedMomentPost[] {
  return posts.map((post) => {
    if (post.authorId !== meId) return post;
    const memoryId = post.remoteId ?? post.id;
    const local = sharedMine.find(
      (m) => m.remoteId === memoryId || m.id === memoryId,
    );
    if (!local) return post;
    return { ...post, momentId: local.id };
  });
}
