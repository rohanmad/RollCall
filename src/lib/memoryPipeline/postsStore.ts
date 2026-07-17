import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Moment,
  PhotoAsset,
  PostComment,
  SharedMomentPost,
} from '../../types/moment';

const STORE_KEY = 'rollcall.postedMemories.v1';

export type PostEngagement = {
  likedByUserIds: string[];
  comments: PostComment[];
};

export type PostedMemoriesStore = {
  /** Moments the user has posted (status shared). */
  sharedMoments: Moment[];
  /** Feed posts authored by the current user. */
  posts: SharedMomentPost[];
  /** Snapshot of photo assets referenced by shared moments. */
  photos: PhotoAsset[];
  /** Likes/comments on any post (own or friends), keyed by post id. */
  engagementByPostId: Record<string, PostEngagement>;
};

const EMPTY: PostedMemoriesStore = {
  sharedMoments: [],
  posts: [],
  photos: [],
  engagementByPostId: {},
};

export async function loadPostedMemories(): Promise<PostedMemoriesStore> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PostedMemoriesStore>;
    return {
      sharedMoments: parsed.sharedMoments ?? [],
      posts: parsed.posts ?? [],
      photos: parsed.photos ?? [],
      engagementByPostId: parsed.engagementByPostId ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function savePostedMemories(
  store: PostedMemoriesStore,
): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
}

/** Merge a newly posted memory into durable storage. */
export async function appendPostedMemory(input: {
  moment: Moment;
  post: SharedMomentPost;
  photos: PhotoAsset[];
}): Promise<void> {
  const store = await loadPostedMemories();
  const photoById = new Map(store.photos.map((p) => [p.id, p] as const));
  for (const photo of input.photos) {
    photoById.set(photo.id, photo);
  }

  const next: PostedMemoriesStore = {
    ...store,
    sharedMoments: [
      input.moment,
      ...store.sharedMoments.filter((m) => m.id !== input.moment.id),
    ],
    posts: [
      input.post,
      ...store.posts.filter((p) => p.id !== input.post.id),
    ],
    photos: [...photoById.values()],
  };
  await savePostedMemories(next);
}

/** Remove a posted memory (and prune unreferenced photo snapshots). */
export async function removePostedMemory(postId: string): Promise<void> {
  const store = await loadPostedMemories();
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return;

  const sharedMoments = store.sharedMoments.filter(
    (m) => m.id !== post.momentId,
  );
  const posts = store.posts.filter((p) => p.id !== postId);
  const referenced = new Set(sharedMoments.flatMap((m) => m.photoIds));
  const photos = store.photos.filter((p) => referenced.has(p.id));
  const { [postId]: _removed, ...engagementByPostId } =
    store.engagementByPostId;

  await savePostedMemories({
    sharedMoments,
    posts,
    photos,
    engagementByPostId,
  });
}

/** Persist likes/comments for any post the user interacts with. */
export async function savePostEngagement(
  post: SharedMomentPost,
): Promise<void> {
  const store = await loadPostedMemories();
  const engagement: PostEngagement = {
    likedByUserIds: post.likedByUserIds,
    comments: post.comments,
  };

  const nextPosts = store.posts.some((p) => p.id === post.id)
    ? store.posts.map((p) =>
        p.id === post.id
          ? {
              ...p,
              likedByUserIds: post.likedByUserIds,
              comments: post.comments,
            }
          : p,
      )
    : store.posts;

  await savePostedMemories({
    ...store,
    posts: nextPosts,
    engagementByPostId: {
      ...store.engagementByPostId,
      [post.id]: engagement,
    },
  });
}

/** Apply stored engagement onto a seeded/hydrated post list. */
export function applyEngagement(
  posts: SharedMomentPost[],
  engagementByPostId: Record<string, PostEngagement>,
): SharedMomentPost[] {
  if (!Object.keys(engagementByPostId).length) return posts;
  return posts.map((post) => {
    const engagement = engagementByPostId[post.id];
    if (!engagement) return post;
    return {
      ...post,
      likedByUserIds: engagement.likedByUserIds,
      comments: engagement.comments,
    };
  });
}
