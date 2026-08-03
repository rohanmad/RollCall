import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState as RNAppState } from 'react-native';
import { authService } from '../auth';
import {
  CURRENT_USER_ID,
  mockPhotos,
  photoMap,
} from '../data/mockData';
import {
  createMemoryId,
  enqueueMemorySync,
  flushMemorySyncQueue,
  getMemoryById,
  isFriendsFeedReady,
  listSyncJobs,
  loadFriendsFeed,
  mapMemoryToFeedItem,
  mergeFriendsFeed,
  removeSyncJob,
  subscribeMemorySync,
  deleteMemory as deleteRemoteMemory,
  type MemorySyncJob,
} from '../lib/memories';
import {
  countUnreadNotifications,
  isNotificationsBackendReady,
  listNotifications,
  markAllNotificationsRead as markAllNotificationsReadRemote,
  markNotificationsRead,
  subscribeNotificationEvents,
  type AppNotification,
} from '../lib/notifications';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  isFriendsBackendReady,
  loadFriendsGraph,
  otherUserId,
  removeFriendship,
  searchProfilesByUsername,
  sendFriendRequest,
  type FriendRequest,
  type Friendship,
} from '../lib/friends';
import {
  addCommentRemote,
  isEngagementBackendReady,
  loadEngagement,
  setLike,
} from '../lib/engagement';
import {
  appendPostedMemory,
  applyEngagement,
  loadPostedMemories,
  loadScanStore,
  markCandidateDismissed,
  markCandidateShared,
  markCandidatesShared,
  removePostedMemory,
  runMemoryScan,
  savePostEngagement,
  updatePostedMemorySync,
  type MemoryScanResult,
} from '../lib/memoryPipeline';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthState';
import { useToast } from '../components/Toast';
import type {
  Connection,
  Invite,
  MemorySyncStatus,
  Moment,
  PhotoAsset,
  PostComment,
  SearchUserResult,
  SharedMomentPost,
  UserProfile,
} from '../types/moment';

function requestToInvite(request: FriendRequest): Invite {
  return {
    id: request.id,
    fromUserId: request.fromUserId,
    toUserId: request.toUserId,
    status: request.status,
    createdAt: Date.parse(request.createdAt) || Date.now(),
  };
}

function friendshipToConnection(
  friendship: Friendship,
  meId: string,
): Connection {
  return {
    userId: otherUserId(friendship, meId),
    since: Date.parse(friendship.createdAt) || Date.now(),
  };
}

type AppStateValue = {
  me: UserProfile;
  photos: PhotoAsset[];
  photosById: Record<string, PhotoAsset>;
  moments: Moment[];
  connections: Connection[];
  invites: Invite[];
  feed: SharedMomentPost[];
  discoverFeed: SharedMomentPost[];
  usersById: Record<string, UserProfile>;
  memoryScanReady: boolean;
  memoryScanning: boolean;
  newMemoryCount: number;
  feedLoading: boolean;
  feedRefreshing: boolean;
  refreshFeed: (options?: { silent?: boolean }) => Promise<void>;
  myPosts: SharedMomentPost[];
  notifications: AppNotification[];
  notificationsLoading: boolean;
  unreadNotificationCount: number;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  ensurePostAvailable: (postId: string) => Promise<boolean>;
  keepMoment: (
    momentId: string,
    edits: Pick<Moment, 'title' | 'locationLabel' | 'photoIds'>,
  ) => void;
  dismissMoment: (momentId: string) => void;
  clearNewMemoryBadge: () => void;
  scanMemories: (options?: {
    requestPermission?: boolean;
    forceFullScan?: boolean;
  }) => Promise<MemoryScanResult | null>;
  getPostsByUser: (userId: string) => SharedMomentPost[];
  acceptInvite: (inviteId: string) => void;
  declineInvite: (inviteId: string) => void;
  sendInvite: (toUserId: string) => void;
  removeFriend: (userId: string) => void;
  cancelInvite: (inviteId: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, body: string) => void;
  loadMemoryEngagement: (postId: string) => Promise<void>;
  deleteMemory: (postId: string) => void;
  retryMemorySync: (memoryId: string) => Promise<void>;
  searchUsers: (
    query: string,
    excludeUserId?: string,
  ) => Promise<SearchUserResult[]>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

function buildMoments(
  drafts: Moment[],
  sharedMine: Moment[],
  feedRemoteMoments: Moment[],
): Moment[] {
  const localKeys = new Set(
    sharedMine.flatMap((m) => [m.id, m.remoteId].filter(Boolean) as string[]),
  );
  const remoteOnly = feedRemoteMoments.filter((m) => {
    const key = m.remoteId ?? m.id;
    return !localKeys.has(m.id) && !localKeys.has(key);
  });
  return [...drafts, ...sharedMine, ...remoteOnly];
}

function buildPhotos(
  cameraPhotos: PhotoAsset[],
  postedPhotos: PhotoAsset[],
  feedRemotePhotos: PhotoAsset[],
  includeMockLibrary: boolean,
): PhotoAsset[] {
  const byId = new Map<string, PhotoAsset>();
  for (const photo of feedRemotePhotos) byId.set(photo.id, photo);
  for (const photo of postedPhotos) byId.set(photo.id, photo);
  // Camera-roll URIs win when the same asset is still available.
  for (const photo of cameraPhotos) byId.set(photo.id, photo);
  return [
    ...(includeMockLibrary ? mockPhotos : []),
    ...byId.values(),
  ];
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState<Moment[]>([]);
  const [sharedMine, setSharedMine] = useState<Moment[]>([]);
  const [cameraPhotos, setCameraPhotos] = useState<PhotoAsset[]>([]);
  const [postedPhotos, setPostedPhotos] = useState<PhotoAsset[]>([]);
  const [useMockLibrary, setUseMockLibrary] = useState(false);
  const [feed, setFeed] = useState<SharedMomentPost[]>([]);
  const [myPosts, setMyPosts] = useState<SharedMomentPost[]>([]);
  const [discoverFeed, setDiscoverFeed] = useState<SharedMomentPost[]>([]);
  const [feedRemoteMoments, setFeedRemoteMoments] = useState<Moment[]>([]);
  const [feedRemotePhotos, setFeedRemotePhotos] = useState<PhotoAsset[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [usersById, setUsersById] = useState<Record<string, UserProfile>>({});
  const [memoryScanReady, setMemoryScanReady] = useState(false);
  const [memoryScanning, setMemoryScanning] = useState(false);
  const [newMemoryCount, setNewMemoryCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const scanningRef = useRef(false);
  const photosByIdRef = useRef<Record<string, PhotoAsset>>({});
  const feedRef = useRef(feed);
  const myPostsRef = useRef(myPosts);
  const discoverFeedRef = useRef(discoverFeed);
  const sharedMineRef = useRef(sharedMine);
  const feedRefreshGen = useRef(0);
  const me = useMemo<UserProfile>(() => {
    if (!authUser) {
      return {
        id: CURRENT_USER_ID,
        name: 'You',
        handle: '@you',
        friendCount: 0,
      };
    }
    return {
      id: authUser.id,
      name: authUser.username,
      handle: `@${authUser.username}`,
      bio: authUser.bio,
      avatarUri: authUser.avatarUri,
      friendCount: connections.length,
    };
  }, [authUser, connections.length]);

  // Keep the signed-in user in the directory for profile lookups.
  useEffect(() => {
    if (!authUser) return;
    setUsersById((prev) => ({
      ...prev,
      [authUser.id]: {
        id: authUser.id,
        name: authUser.username,
        handle: `@${authUser.username}`,
        bio: authUser.bio,
        avatarUri: authUser.avatarUri,
        friendCount: connections.length,
      },
    }));
  }, [authUser, connections.length]);

  // Hydrate friendships + requests from Supabase
  useEffect(() => {
    if (!authUser || !isFriendsBackendReady()) return;
    let cancelled = false;
    (async () => {
      try {
        const graph = await loadFriendsGraph(authUser.id);
        if (cancelled) return;
        setConnections(
          graph.friendships.map((f) =>
            friendshipToConnection(f, authUser.id),
          ),
        );
        setInvites(graph.requests.map(requestToInvite));
        setUsersById((prev) => {
          const next = { ...prev };
          for (const profile of graph.profiles) {
            next[profile.id] = {
              id: profile.id,
              name: profile.username,
              handle: `@${profile.username}`,
              bio: profile.bio,
              avatarUri: profile.avatarUri,
            };
          }
          return next;
        });
      } catch (error) {
        console.warn('[friends] hydrate failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  feedRef.current = feed;
  myPostsRef.current = myPosts;
  discoverFeedRef.current = discoverFeed;
  sharedMineRef.current = sharedMine;

  const moments = useMemo(
    () => buildMoments(drafts, sharedMine, feedRemoteMoments),
    [drafts, sharedMine, feedRemoteMoments],
  );
  const photos = useMemo(
    () =>
      buildPhotos(
        cameraPhotos,
        postedPhotos,
        feedRemotePhotos,
        useMockLibrary,
      ),
    [cameraPhotos, postedPhotos, feedRemotePhotos, useMockLibrary],
  );
  const photosById = useMemo(() => photoMap(photos), [photos]);
  photosByIdRef.current = photosById;

  const refreshFeed = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!authUser || !isFriendsFeedReady()) return;

      const gen = ++feedRefreshGen.current;
      if (options?.silent) {
        setFeedRefreshing(true);
      } else if (feedRef.current.length === 0) {
        setFeedLoading(true);
      } else {
        setFeedRefreshing(true);
      }

      try {
        const friendIds = connections.map((c) => c.userId);
        const result = await loadFriendsFeed({
          meId: authUser.id,
          friendIds,
        });
        if (gen !== feedRefreshGen.current) return;

        const remotePosts = result.items.map((item) => item.post);
        const remoteMoments = result.items.map((item) => item.moment);
        const remotePhotos = result.items.flatMap((item) => item.photos);

        setFeedRemoteMoments(remoteMoments);
        setFeedRemotePhotos(remotePhotos);
        setUsersById((prev) => {
          const next = { ...prev };
          for (const profile of result.profiles) {
            next[profile.id] = {
              ...next[profile.id],
              ...profile,
              friendCount: next[profile.id]?.friendCount,
            };
          }
          return next;
        });

        const merged = mergeFriendsFeed({
          remotePosts,
          currentPosts: feedRef.current,
          meId: authUser.id,
        });
        setFeed(merged);
      } catch (error) {
        console.warn('[feed] refresh failed', error);
        if (!options?.silent) {
          showToast(
            error instanceof Error ? error.message : 'Could not load feed.',
            'error',
          );
        }
      } finally {
        if (gen === feedRefreshGen.current) {
          setFeedLoading(false);
          setFeedRefreshing(false);
        }
      }
    },
    [authUser, connections, showToast],
  );

  // Load friends feed after auth (and again when the friend graph changes).
  useEffect(() => {
    if (!authUser || !isFriendsFeedReady()) return;
    void refreshFeed();
  }, [authUser?.id, connections, refreshFeed]);

  const refreshNotifications = useCallback(async () => {
    if (!authUser || !isNotificationsBackendReady()) {
      setNotifications([]);
      setUnreadNotificationCount(0);
      return;
    }
    setNotificationsLoading(true);
    try {
      const [items, unread] = await Promise.all([
        listNotifications(authUser.id),
        countUnreadNotifications(authUser.id),
      ]);
      setNotifications(items);
      setUnreadNotificationCount(unread);
      setUsersById((prev) => {
        const next = { ...prev };
        for (const n of items) {
          if (!n.actorUsername) continue;
          if (!next[n.actorId]) {
            next[n.actorId] = {
              id: n.actorId,
              name: n.actorUsername,
              handle: `@${n.actorUsername}`,
              avatarUri: n.actorAvatarUri,
            };
          }
        }
        return next;
      });
    } catch (error) {
      console.warn('[notifications] refresh failed', error);
    } finally {
      setNotificationsLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !isNotificationsBackendReady()) return;
    void refreshNotifications();
    const unsubscribe = subscribeNotificationEvents((event) => {
      if (event.type === 'created' && event.notification.recipientId === authUser.id) {
        setNotifications((prev) => [event.notification, ...prev]);
        setUnreadNotificationCount((c) => c + 1);
      } else if (event.type === 'read') {
        void refreshNotifications();
      }
    });
    return unsubscribe;
  }, [authUser?.id, refreshNotifications]);

  const markNotificationRead = useCallback(
    async (id: string) => {
      if (!authUser) return;
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
        ),
      );
      setUnreadNotificationCount((c) => Math.max(0, c - 1));
      try {
        await markNotificationsRead(authUser.id, [id]);
      } catch (error) {
        console.warn('[notifications] mark read failed', error);
        void refreshNotifications();
      }
    },
    [authUser, refreshNotifications],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!authUser) return;
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        readAt: n.readAt ?? new Date().toISOString(),
      })),
    );
    setUnreadNotificationCount(0);
    try {
      await markAllNotificationsReadRemote(authUser.id);
    } catch (error) {
      console.warn('[notifications] mark all read failed', error);
      void refreshNotifications();
    }
  }, [authUser, refreshNotifications]);

  const ensurePostAvailable = useCallback(
    async (postId: string): Promise<boolean> => {
      const existing =
        myPostsRef.current.find((p) => p.id === postId) ??
        feedRef.current.find((p) => p.id === postId) ??
        discoverFeedRef.current.find((p) => p.id === postId);
      if (existing) return true;
      if (!isFriendsFeedReady()) return false;
      try {
        const memory = await getMemoryById(postId);
        if (!memory) return false;
        const author =
          usersById[memory.ownerId] ??
          ({
            id: memory.ownerId,
            name: 'user',
            handle: '@user',
          } satisfies UserProfile);
        const item = mapMemoryToFeedItem({
          memory,
          author,
          meId: me.id,
          likedByMe: false,
        });
        setFeedRemoteMoments((prev) => {
          if (prev.some((m) => m.id === item.moment.id)) return prev;
          return [item.moment, ...prev];
        });
        setFeedRemotePhotos((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const extra = item.photos.filter((p) => !ids.has(p.id));
          return extra.length ? [...extra, ...prev] : prev;
        });
        if (memory.ownerId === me.id) {
          setMyPosts((prev) => {
            if (prev.some((p) => p.id === item.post.id)) return prev;
            return [item.post, ...prev];
          });
        } else {
          setFeed((prev) => {
            if (prev.some((p) => p.id === item.post.id)) return prev;
            return [item.post, ...prev];
          });
        }
        return true;
      } catch (error) {
        console.warn('[notifications] ensure post failed', error);
        return false;
      }
    },
    [me.id, usersById],
  );

  const applyScanResult = useCallback((result: MemoryScanResult) => {
    if (result.permission === 'granted' || result.store.hasCompletedInitialScan) {
      setUseMockLibrary(false);
      setCameraPhotos(result.photos);
      setDrafts(result.allCandidates);
      setNewMemoryCount(result.newCandidates.length || result.store.lastNewCount);
    }
  }, []);

  const scanMemories = useCallback(
    async (options?: {
      requestPermission?: boolean;
      forceFullScan?: boolean;
    }) => {
      if (scanningRef.current) return null;
      scanningRef.current = true;
      setMemoryScanning(true);
      try {
        const result = await runMemoryScan({
          requestPermission: options?.requestPermission ?? false,
          forceFullScan: options?.forceFullScan ?? false,
        });
        applyScanResult(result);
        return result;
      } finally {
        scanningRef.current = false;
        setMemoryScanning(false);
        setMemoryScanReady(true);
      }
    },
    [applyScanResult],
  );

  const lastSyncStatusRef = useRef<Record<string, MemorySyncStatus>>({});

  const applySyncJobToState = useCallback((job: MemorySyncJob) => {
    const status = job.status as MemorySyncStatus;
    const prev = lastSyncStatusRef.current[job.memoryId];
    lastSyncStatusRef.current[job.memoryId] = status;

    setSharedMine((prevMoments) =>
      prevMoments.map((m) =>
        m.remoteId === job.memoryId || m.id === job.momentId
          ? {
              ...m,
              remoteId: job.memoryId,
              syncStatus: status,
              syncError: job.error,
            }
          : m,
      ),
    );
    setFeed((prevFeed) =>
      prevFeed.map((p) =>
        p.remoteId === job.memoryId || p.id === job.postId
          ? {
              ...p,
              remoteId: job.memoryId,
              syncStatus: status,
              syncError: job.error,
            }
          : p,
      ),
    );
    setMyPosts((prev) =>
      prev.map((p) =>
        p.remoteId === job.memoryId || p.id === job.postId
          ? {
              ...p,
              remoteId: job.memoryId,
              syncStatus: status,
              syncError: job.error,
            }
          : p,
      ),
    );

    if (
      status === 'synced' ||
      status === 'failed' ||
      status === 'local_only'
    ) {
      void updatePostedMemorySync({
        postId: job.postId,
        memoryId: job.memoryId,
        syncStatus: status,
        syncError: job.error,
      });
    }

    if (status === 'failed' && prev && prev !== 'failed') {
      showToast("Couldn't sync — tap Retry", 'error');
    }
    // Success sync stays quiet; "Posted" already covered the happy path.
  }, [showToast]);

  // Restore sync statuses + flush pending uploads
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const jobs = await listSyncJobs();
      if (cancelled) return;
      for (const job of jobs) {
        applySyncJobToState(job);
      }
      await flushMemorySyncQueue();
    })();

    const unsubscribe = subscribeMemorySync((job) => {
      applySyncJobToState(job);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applySyncJobToState]);

  // Hydrate posted memories + scan store, then scan for anything new
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [scanStore, posted] = await Promise.all([
        loadScanStore(),
        loadPostedMemories(),
      ]);
      if (cancelled) return;

      const postedIds = new Set(posted.sharedMoments.map((m) => m.id));

      // Overlay durable sync-queue status onto hydrated posts (queue may be
      // ahead of what was last written into postedMemories).
      const syncJobs = await listSyncJobs();
      const jobByPostId = new Map(syncJobs.map((j) => [j.postId, j]));
      const jobByMemoryId = new Map(syncJobs.map((j) => [j.memoryId, j]));
      const hydratePost = (p: SharedMomentPost): SharedMomentPost => {
        const job =
          jobByPostId.get(p.id) ??
          (p.remoteId ? jobByMemoryId.get(p.remoteId) : undefined) ??
          jobByMemoryId.get(p.id);
        if (!job) return p;
        return {
          ...p,
          remoteId: job.memoryId,
          syncStatus: job.status as MemorySyncStatus,
          syncError: job.error,
        };
      };
      const hydratedPosts = posted.posts.map(hydratePost);
      const hydratedMoments = posted.sharedMoments
        .filter((m) => m.status === 'shared')
        .map((m) => {
          const job =
            (m.remoteId ? jobByMemoryId.get(m.remoteId) : undefined) ??
            syncJobs.find((j) => j.momentId === m.id);
          if (!job) return m;
          return {
            ...m,
            remoteId: job.memoryId,
            syncStatus: job.status as MemorySyncStatus,
            syncError: job.error,
          };
        });

      if (hydratedMoments.length || hydratedPosts.length) {
        setSharedMine(hydratedMoments);
        setPostedPhotos(posted.photos);
        await markCandidatesShared([...postedIds]);
      }

      setMyPosts((prev) => {
        const ownIds = new Set(hydratedPosts.map((p) => p.id));
        const withoutDupes = prev.filter((p) => !ownIds.has(p.id));
        const merged = [...hydratedPosts, ...withoutDupes];
        if (isEngagementBackendReady()) return merged;
        return applyEngagement(merged, posted.engagementByPostId);
      });
      // Drop any of the current user's posts that landed in the friends feed.
      setFeed((prev) =>
        prev.filter((p) => !hydratedPosts.some((own) => own.id === p.id)),
      );
      setDiscoverFeed((prev) => {
        if (isEngagementBackendReady()) return prev;
        return applyEngagement(prev, posted.engagementByPostId);
      });

      if (scanStore.hasCompletedInitialScan) {
        setUseMockLibrary(false);
        setCameraPhotos(scanStore.photos);
        setDrafts(
          scanStore.candidates.filter(
            (c) =>
              !postedIds.has(c.id) && !scanStore.dismissedIds.includes(c.id),
          ),
        );
        setNewMemoryCount(scanStore.lastNewCount);
      }
      setMemoryScanReady(true);

      if (!cancelled) {
        await scanMemories({ requestPermission: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scanMemories]);

  // Rescan + retry sync when the app returns to the foreground
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void scanMemories({ requestPermission: false });
        void flushMemorySyncQueue();
      }
    });
    return () => sub.remove();
  }, [scanMemories]);

  const clearNewMemoryBadge = useCallback(() => {
    setNewMemoryCount(0);
  }, []);

  const keepMoment = useCallback(
    (
      momentId: string,
      edits: Pick<Moment, 'title' | 'locationLabel' | 'photoIds'>,
    ) => {
      void (async () => {
        const existing = drafts.find((m) => m.id === momentId);
        if (!existing) return;

        const now = Date.now();
        const audienceCount = connections.length;
        const coverPhotoId = edits.photoIds.includes(existing.coverPhotoId)
          ? existing.coverPhotoId
          : (edits.photoIds[0] ?? existing.coverPhotoId);

        const memoryId = await createMemoryId();
        const initialSync: MemorySyncStatus = isSupabaseConfigured
          ? 'pending'
          : 'local_only';

        const shared: Moment = {
          ...existing,
          title: edits.title,
          locationLabel: edits.locationLabel,
          photoIds: edits.photoIds,
          coverPhotoId,
          status: 'shared',
          sharedAt: now,
          remoteId: memoryId,
          syncStatus: initialSync,
        };
        const post: SharedMomentPost = {
          id: memoryId,
          momentId,
          authorId: me.id,
          authorName: me.name,
          authorHandle: me.handle,
          sharedAt: now,
          audienceCount,
          likedByUserIds: [],
          comments: [],
          remoteId: memoryId,
          syncStatus: initialSync,
        };
        const snapshotPhotos = edits.photoIds
          .map((id) => photosByIdRef.current[id])
          .filter((p): p is PhotoAsset => Boolean(p));

        // Optimistic local update — UI does not wait on the network.
        setDrafts((prev) => prev.filter((m) => m.id !== momentId));
        setSharedMine((prev) => [
          shared,
          ...prev.filter((m) => m.id !== momentId),
        ]);
        setPostedPhotos((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p] as const));
          for (const photo of snapshotPhotos) byId.set(photo.id, photo);
          return [...byId.values()];
        });
        setMyPosts((prev) => [post, ...prev.filter((p) => p.id !== memoryId)]);

        void markCandidateShared(momentId);
        void appendPostedMemory({
          moment: shared,
          post,
          photos: snapshotPhotos,
        });

        showToast('Posted', 'success');

        if (!isSupabaseConfigured) {
          return;
        }

        await enqueueMemorySync({
          memoryId,
          postId: memoryId,
          momentId,
          ownerId: me.id,
          title: edits.title,
          location: edits.locationLabel,
          coverPhotoId,
          photoIds: edits.photoIds,
          photos: snapshotPhotos,
          createdAt: now,
        });
        await flushMemorySyncQueue({ onlyMemoryId: memoryId });
      })();
    },
    [connections.length, drafts, me.handle, me.id, me.name, showToast],
  );

  const retryMemorySync = useCallback(async (memoryId: string) => {
    showToast('Retrying…', 'info');
    await flushMemorySyncQueue({ onlyMemoryId: memoryId });
  }, [showToast]);

  const dismissMoment = useCallback((momentId: string) => {
    setDrafts((prev) => prev.filter((m) => m.id !== momentId));
    void markCandidateDismissed(momentId);
  }, []);

  const getPostsByUser = useCallback(
    (userId: string) => {
      const seen = new Set<string>();
      const source =
        userId === me.id
          ? myPosts
          : [...feed, ...discoverFeed];
      return source.filter((post) => {
        if (post.authorId !== userId || seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      });
    },
    [feed, discoverFeed, me.id, myPosts],
  );

  const acceptInvite = useCallback(
    (inviteId: string) => {
      const invite = invites.find((i) => i.id === inviteId);
      if (!invite || invite.status !== 'pending') return;

      const otherUserId =
        invite.fromUserId === me.id ? invite.toUserId : invite.fromUserId;

      const prevInvites = invites;
      const prevConnections = connections;

      setInvites((prev) =>
        prev.map((i) =>
          i.id === inviteId ? { ...i, status: 'accepted' as const } : i,
        ),
      );
      setConnections((c) => {
        if (c.some((x) => x.userId === otherUserId)) return c;
        return [...c, { userId: otherUserId, since: Date.now() }];
      });

      if (!isFriendsBackendReady()) return;

      void acceptFriendRequest({ requestId: inviteId, meId: me.id })
        .then(({ request, friendship }) => {
          setInvites((prev) =>
            prev.map((i) =>
              i.id === inviteId ? requestToInvite(request) : i,
            ),
          );
          setConnections((c) => {
            const mapped = friendshipToConnection(friendship, me.id);
            if (c.some((x) => x.userId === mapped.userId)) return c;
            return [...c.filter((x) => x.userId !== mapped.userId), mapped];
          });
        })
        .catch((error) => {
          setInvites(prevInvites);
          setConnections(prevConnections);
          showToast(
            error instanceof Error ? error.message : 'Could not accept request.',
            'error',
          );
        });
    },
    [connections, invites, me.id, showToast],
  );

  const declineInvite = useCallback(
    (inviteId: string) => {
      const invite = invites.find((i) => i.id === inviteId);
      if (!invite || invite.status !== 'pending') return;

      const prevInvites = invites;
      setInvites((prev) =>
        prev.map((i) =>
          i.id === inviteId ? { ...i, status: 'declined' as const } : i,
        ),
      );

      if (!isFriendsBackendReady()) return;

      void declineFriendRequest({ requestId: inviteId, meId: me.id })
        .then((request) => {
          setInvites((prev) =>
            prev.map((i) =>
              i.id === inviteId ? requestToInvite(request) : i,
            ),
          );
        })
        .catch((error) => {
          setInvites(prevInvites);
          showToast(
            error instanceof Error
              ? error.message
              : 'Could not decline request.',
            'error',
          );
        });
    },
    [invites, me.id, showToast],
  );

  const cancelInvite = useCallback(
    (inviteId: string) => {
      const invite = invites.find((i) => i.id === inviteId);
      if (!invite || invite.status !== 'pending') return;
      if (invite.fromUserId !== me.id) return;

      const prevInvites = invites;
      setInvites((prev) =>
        prev.map((i) =>
          i.id === inviteId ? { ...i, status: 'canceled' as const } : i,
        ),
      );

      if (!isFriendsBackendReady()) return;

      void cancelFriendRequest({ requestId: inviteId, meId: me.id })
        .then((request) => {
          setInvites((prev) =>
            prev.map((i) =>
              i.id === inviteId ? requestToInvite(request) : i,
            ),
          );
        })
        .catch((error) => {
          setInvites(prevInvites);
          showToast(
            error instanceof Error
              ? error.message
              : 'Could not cancel request.',
            'error',
          );
        });
    },
    [invites, me.id, showToast],
  );

  const sendInvite = useCallback(
    (toUserId: string) => {
      if (!toUserId || toUserId === me.id) return;
      if (connections.some((c) => c.userId === toUserId)) return;

      const alreadyPending = invites.some(
        (i) =>
          i.status === 'pending' &&
          ((i.fromUserId === me.id && i.toUserId === toUserId) ||
            (i.fromUserId === toUserId && i.toUserId === me.id)),
      );
      if (alreadyPending) return;

      const tempId = `local-inv-${Date.now()}`;
      const optimistic: Invite = {
        id: tempId,
        fromUserId: me.id,
        toUserId,
        status: 'pending',
        createdAt: Date.now(),
      };
      setInvites((prev) => [optimistic, ...prev]);

      if (!isFriendsBackendReady()) return;

      void sendFriendRequest({ fromUserId: me.id, toUserId })
        .then((request) => {
          setInvites((prev) =>
            prev.map((i) =>
              i.id === tempId ? requestToInvite(request) : i,
            ),
          );
        })
        .catch((error) => {
          setInvites((prev) => prev.filter((i) => i.id !== tempId));
          showToast(
            error instanceof Error
              ? error.message
              : 'Could not send request.',
            'error',
          );
        });
    },
    [connections, invites, me.id, showToast],
  );

  const removeFriend = useCallback(
    (userId: string) => {
      if (!userId || userId === me.id) return;
      const prevConnections = connections;
      setConnections((c) => c.filter((x) => x.userId !== userId));

      if (!isFriendsBackendReady()) return;

      void removeFriendship({ meId: me.id, otherUserId: userId }).catch(
        (error) => {
          setConnections(prevConnections);
          showToast(
            error instanceof Error
              ? error.message
              : 'Could not remove friend.',
            'error',
          );
        },
      );
    },
    [connections, me.id, showToast],
  );

  const findPost = useCallback((postId: string): SharedMomentPost | undefined => {
    return (
      myPostsRef.current.find((p) => p.id === postId) ??
      feedRef.current.find((p) => p.id === postId) ??
      discoverFeedRef.current.find((p) => p.id === postId)
    );
  }, []);

  const resolveCloudMemoryId = useCallback(
    (post: SharedMomentPost): string | null => {
      if (!isEngagementBackendReady()) return null;
      if (post.syncStatus === 'local_only') return null;
      // Cloud writes only after the memory row exists remotely.
      if (post.syncStatus !== 'synced') return null;
      const id = post.remoteId ?? post.id;
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuid.test(id) ? id : null;
    },
    [],
  );

  const patchPost = useCallback(
    (
      postId: string,
      mapFn: (post: SharedMomentPost) => SharedMomentPost,
      options?: { persistLocal?: boolean },
    ) => {
      const current = findPost(postId);
      if (!current) return;

      const next = mapFn(current);
      setMyPosts((prev) => {
        if (!prev.some((p) => p.id === postId)) return prev;
        return prev.map((p) => (p.id === postId ? next : p));
      });
      setFeed((prev) => {
        if (!prev.some((p) => p.id === postId)) return prev;
        return prev.map((p) => (p.id === postId ? next : p));
      });
      setDiscoverFeed((prev) => {
        if (!prev.some((p) => p.id === postId)) return prev;
        return prev.map((p) => (p.id === postId ? next : p));
      });

      const persistLocal =
        options?.persistLocal ?? !isEngagementBackendReady();
      if (persistLocal) {
        void savePostEngagement(next);
      }
    },
    [findPost],
  );

  const toggleLike = useCallback(
    (postId: string) => {
      const current = findPost(postId);
      if (!current) return;

      const wasLiked = current.likedByUserIds.includes(me.id);
      const nextLiked = !wasLiked;
      const previousIds = current.likedByUserIds;
      const memoryId = resolveCloudMemoryId(current);

      // Always update UI immediately — never block the heart on sync/network.
      patchPost(
        postId,
        (post) => ({
          ...post,
          likedByUserIds: nextLiked
            ? post.likedByUserIds.includes(me.id)
              ? post.likedByUserIds
              : [...post.likedByUserIds, me.id]
            : post.likedByUserIds.filter((id) => id !== me.id),
        }),
        { persistLocal: !memoryId },
      );

      if (!memoryId) return;

      void setLike({
        memoryId,
        userId: me.id,
        liked: nextLiked,
      }).catch((error) => {
        patchPost(
          postId,
          (post) => ({ ...post, likedByUserIds: previousIds }),
          { persistLocal: false },
        );
        showToast(
          error instanceof Error ? error.message : 'Could not update like.',
          'error',
        );
      });
    },
    [findPost, me.id, patchPost, resolveCloudMemoryId, showToast],
  );

  const addComment = useCallback(
    (postId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      const current = findPost(postId);
      if (!current) return;

      const memoryId = resolveCloudMemoryId(current);
      const tempId = `c-${postId}-${Date.now()}`;
      const optimistic: PostComment = {
        id: tempId,
        postId,
        authorId: me.id,
        authorName: me.name,
        authorHandle: me.handle,
        body: trimmed,
        createdAt: Date.now(),
      };
      const previousComments = current.comments;

      // Always show the comment immediately.
      patchPost(
        postId,
        (post) => ({
          ...post,
          comments: [...post.comments, optimistic],
        }),
        { persistLocal: !memoryId },
      );

      if (!memoryId) return;

      void addCommentRemote({
        memoryId,
        authorId: me.id,
        body: trimmed,
        postId,
        authorUsername: me.name,
      })
        .then((comment) => {
          patchPost(
            postId,
            (post) => ({
              ...post,
              comments: post.comments.map((c) =>
                c.id === tempId ? comment : c,
              ),
            }),
            { persistLocal: false },
          );
        })
        .catch((error) => {
          patchPost(
            postId,
            (post) => ({ ...post, comments: previousComments }),
            { persistLocal: false },
          );
          showToast(
            error instanceof Error ? error.message : 'Could not add comment.',
            'error',
          );
        });
    },
    [
      findPost,
      me.handle,
      me.id,
      me.name,
      patchPost,
      resolveCloudMemoryId,
      showToast,
    ],
  );

  const loadMemoryEngagement = useCallback(
    async (postId: string) => {
      if (!isEngagementBackendReady()) return;
      const current = findPost(postId);
      if (!current) return;
      const memoryId = resolveCloudMemoryId(current);
      if (!memoryId) return;

      try {
        const engagement = await loadEngagement(memoryId, postId);
        patchPost(
          postId,
          (post) => ({
            ...post,
            likedByUserIds: engagement.likedByUserIds,
            comments: engagement.comments,
          }),
          { persistLocal: false },
        );
      } catch (error) {
        console.warn('[engagement] load failed', error);
      }
    },
    [findPost, patchPost, resolveCloudMemoryId],
  );

  const deleteMemory = useCallback(
    (postId: string) => {
      const post =
        myPosts.find((p) => p.id === postId) ??
        feed.find((p) => p.id === postId) ??
        discoverFeed.find((p) => p.id === postId);
      if (!post) return;

      const remoteId = post.remoteId ?? post.id;
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      setMyPosts((prev) => prev.filter((p) => p.id !== postId));
      setFeed((prev) => prev.filter((p) => p.id !== postId));
      setDiscoverFeed((prev) => prev.filter((p) => p.id !== postId));
      setSharedMine((prev) =>
        prev.filter((m) => m.id !== post.momentId && m.remoteId !== remoteId),
      );
      setFeedRemoteMoments((prev) =>
        prev.filter((m) => m.id !== remoteId && m.remoteId !== remoteId),
      );
      void removeSyncJob(remoteId);
      void removePostedMemory(postId).then(async () => {
        const next = await loadPostedMemories();
        setPostedPhotos(next.photos);
      });

      if (isSupabaseConfigured && uuid.test(remoteId)) {
        void deleteRemoteMemory(remoteId).catch((error) => {
          console.warn('[memories] remote delete failed', error);
          showToast(
            error instanceof Error
              ? error.message
              : 'Could not delete from cloud.',
            'error',
          );
        });
      }
    },
    [feed, discoverFeed, myPosts, showToast],
  );

  const searchUsers = useCallback(
    async (query: string, excludeUserId?: string): Promise<SearchUserResult[]> => {
      const q = query.trim().toLowerCase().replace(/^@/, '');
      if (!q) return [];

      const exclude = new Set(
        [excludeUserId, me.id].filter(Boolean) as string[],
      );

      let results: SearchUserResult[] = [];

      if (isFriendsBackendReady()) {
        const profiles = await searchProfilesByUsername(q, excludeUserId ?? me.id);
        results = profiles
          .filter((p) => !exclude.has(p.id))
          .map((p) => ({
            id: p.id,
            username: p.username,
            name: p.username,
            avatarUri: p.avatarUri,
          }))
          .sort((a, b) => a.username.localeCompare(b.username));
      } else {
        const authMatches = await authService.searchUsers(q, excludeUserId);
        const byUsername = new Map<string, SearchUserResult>();
        for (const match of authMatches) {
          if (exclude.has(match.id)) continue;
          byUsername.set(match.username, {
            id: match.id,
            username: match.username,
          });
        }
        results = [...byUsername.values()].sort((a, b) =>
          a.username.localeCompare(b.username),
        );
      }

      setUsersById((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const result of results) {
          const existing = next[result.id];
          if (!existing) {
            next[result.id] = {
              id: result.id,
              name: result.name ?? result.username,
              handle: `@${result.username}`,
              avatarUri: result.avatarUri,
            };
            changed = true;
          } else if (result.avatarUri && !existing.avatarUri) {
            next[result.id] = { ...existing, avatarUri: result.avatarUri };
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      return results;
    },
    [me.id],
  );

  const value = useMemo(
    () => ({
      me,
      photos,
      photosById,
      moments,
      connections,
      invites,
      feed,
      discoverFeed,
      usersById,
      memoryScanReady,
      memoryScanning,
      newMemoryCount,
      feedLoading,
      feedRefreshing,
      refreshFeed,
      myPosts,
      notifications,
      notificationsLoading,
      unreadNotificationCount,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      ensurePostAvailable,
      keepMoment,
      dismissMoment,
      clearNewMemoryBadge,
      scanMemories,
      getPostsByUser,
      acceptInvite,
      declineInvite,
      sendInvite,
      removeFriend,
      cancelInvite,
      toggleLike,
      addComment,
      loadMemoryEngagement,
      deleteMemory,
      retryMemorySync,
      searchUsers,
    }),
    [
      me,
      photos,
      photosById,
      moments,
      connections,
      invites,
      feed,
      discoverFeed,
      usersById,
      memoryScanReady,
      memoryScanning,
      newMemoryCount,
      feedLoading,
      feedRefreshing,
      refreshFeed,
      myPosts,
      notifications,
      notificationsLoading,
      unreadNotificationCount,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      ensurePostAvailable,
      keepMoment,
      dismissMoment,
      clearNewMemoryBadge,
      scanMemories,
      getPostsByUser,
      acceptInvite,
      declineInvite,
      sendInvite,
      removeFriend,
      cancelInvite,
      toggleLike,
      addComment,
      loadMemoryEngagement,
      deleteMemory,
      retryMemorySync,
      searchUsers,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
