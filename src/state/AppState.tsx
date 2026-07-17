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
  alexSharedMoment,
  discoverFeed as seedDiscoverFeed,
  discoverMoments,
  discoverPhotos,
  friendPhotos,
  initialConnections,
  initialFeed,
  initialInvites,
  mockDraftMoments,
  mockPhotos,
  mockUsers,
  photoMap,
} from '../data/mockData';
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
  type MemoryScanResult,
} from '../lib/memoryPipeline';
import type {
  Connection,
  Invite,
  Moment,
  PhotoAsset,
  SearchUserResult,
  SharedMomentPost,
  UserProfile,
} from '../types/moment';

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
  toggleLike: (postId: string) => void;
  addComment: (postId: string, body: string) => void;
  deleteMemory: (postId: string) => void;
  searchUsers: (
    query: string,
    excludeUserId?: string,
  ) => Promise<SearchUserResult[]>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

const SOCIAL_MOMENTS = [alexSharedMoment, ...discoverMoments];
const SOCIAL_PHOTOS = [...friendPhotos, ...discoverPhotos];

function buildPhotos(
  cameraPhotos: PhotoAsset[],
  postedPhotos: PhotoAsset[],
  includeMockLibrary: boolean,
): PhotoAsset[] {
  const byId = new Map<string, PhotoAsset>();
  for (const photo of postedPhotos) byId.set(photo.id, photo);
  // Camera-roll URIs win when the same asset is still available.
  for (const photo of cameraPhotos) byId.set(photo.id, photo);
  return [
    ...(includeMockLibrary ? mockPhotos : []),
    ...byId.values(),
    ...SOCIAL_PHOTOS,
  ];
}

function buildMoments(
  drafts: Moment[],
  sharedMine: Moment[],
): Moment[] {
  return [...drafts, ...sharedMine, ...SOCIAL_MOMENTS];
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [drafts, setDrafts] = useState<Moment[]>(mockDraftMoments);
  const [sharedMine, setSharedMine] = useState<Moment[]>([]);
  const [cameraPhotos, setCameraPhotos] = useState<PhotoAsset[]>([]);
  const [postedPhotos, setPostedPhotos] = useState<PhotoAsset[]>([]);
  const [useMockLibrary, setUseMockLibrary] = useState(true);
  const [feed, setFeed] = useState<SharedMomentPost[]>(initialFeed);
  const [discoverFeed, setDiscoverFeed] =
    useState<SharedMomentPost[]>(seedDiscoverFeed);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [usersById, setUsersById] =
    useState<Record<string, UserProfile>>(mockUsers);
  const [memoryScanReady, setMemoryScanReady] = useState(false);
  const [memoryScanning, setMemoryScanning] = useState(false);
  const [newMemoryCount, setNewMemoryCount] = useState(0);

  const scanningRef = useRef(false);
  const photosByIdRef = useRef<Record<string, PhotoAsset>>({});
  const feedRef = useRef(feed);
  const discoverFeedRef = useRef(discoverFeed);
  const me = mockUsers[CURRENT_USER_ID];

  feedRef.current = feed;
  discoverFeedRef.current = discoverFeed;

  const moments = useMemo(
    () => buildMoments(drafts, sharedMine),
    [drafts, sharedMine],
  );
  const photos = useMemo(
    () => buildPhotos(cameraPhotos, postedPhotos, useMockLibrary),
    [cameraPhotos, postedPhotos, useMockLibrary],
  );
  const photosById = useMemo(() => photoMap(photos), [photos]);
  photosByIdRef.current = photosById;

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

      if (posted.sharedMoments.length || posted.posts.length) {
        setSharedMine(
          posted.sharedMoments.filter((m) => m.status === 'shared'),
        );
        setPostedPhotos(posted.photos);
        // Keep posted candidates out of future scans (and out of drafts).
        await markCandidatesShared([...postedIds]);
      }

      setFeed((prev) => {
        const ownIds = new Set(posted.posts.map((p) => p.id));
        const withoutDupes = prev.filter((p) => !ownIds.has(p.id));
        return applyEngagement(
          [...posted.posts, ...withoutDupes],
          posted.engagementByPostId,
        );
      });
      setDiscoverFeed((prev) =>
        applyEngagement(prev, posted.engagementByPostId),
      );

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

  // Rescan when the app returns to the foreground
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void scanMemories({ requestPermission: false });
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
      const now = Date.now();
      const audienceCount = connections.length;
      const coverPhotoId = edits.photoIds[0];

      setDrafts((prevDrafts) => {
        const existing = prevDrafts.find((m) => m.id === momentId);
        if (!existing) return prevDrafts;

        const shared: Moment = {
          ...existing,
          title: edits.title,
          locationLabel: edits.locationLabel,
          photoIds: edits.photoIds,
          coverPhotoId: coverPhotoId ?? existing.coverPhotoId,
          status: 'shared',
          sharedAt: now,
        };
        const post: SharedMomentPost = {
          id: `post-${momentId}-${now}`,
          momentId,
          authorId: me.id,
          authorName: me.name,
          authorHandle: me.handle,
          sharedAt: now,
          audienceCount,
          likedByUserIds: [],
          comments: [],
        };
        const snapshotPhotos = edits.photoIds
          .map((id) => photosByIdRef.current[id])
          .filter((p): p is PhotoAsset => Boolean(p));

        setSharedMine((prev) => [
          shared,
          ...prev.filter((m) => m.id !== momentId),
        ]);
        setPostedPhotos((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p] as const));
          for (const photo of snapshotPhotos) byId.set(photo.id, photo);
          return [...byId.values()];
        });
        setFeed((prev) => [post, ...prev]);

        void markCandidateShared(momentId);
        void appendPostedMemory({
          moment: shared,
          post,
          photos: snapshotPhotos,
        });

        return prevDrafts.filter((m) => m.id !== momentId);
      });
    },
    [connections.length, me.handle, me.id, me.name],
  );

  const dismissMoment = useCallback((momentId: string) => {
    setDrafts((prev) => prev.filter((m) => m.id !== momentId));
    void markCandidateDismissed(momentId);
  }, []);

  const getPostsByUser = useCallback(
    (userId: string) => {
      const seen = new Set<string>();
      return [...feed, ...discoverFeed].filter((post) => {
        if (post.authorId !== userId || seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      });
    },
    [feed, discoverFeed],
  );

  const acceptInvite = useCallback((inviteId: string) => {
    setInvites((prev) => {
      const invite = prev.find((i) => i.id === inviteId);
      if (!invite || invite.status !== 'pending') return prev;

      const otherUserId =
        invite.fromUserId === CURRENT_USER_ID ? invite.toUserId : invite.fromUserId;

      setConnections((c) => {
        if (c.some((x) => x.userId === otherUserId)) return c;
        return [...c, { userId: otherUserId, since: Date.now() }];
      });

      return prev.map((i) =>
        i.id === inviteId ? { ...i, status: 'accepted' as const } : i,
      );
    });
  }, []);

  const declineInvite = useCallback((inviteId: string) => {
    setInvites((prev) =>
      prev.map((i) =>
        i.id === inviteId ? { ...i, status: 'declined' as const } : i,
      ),
    );
  }, []);

  const sendInvite = useCallback(
    (toUserId: string) => {
      if (!toUserId || toUserId === CURRENT_USER_ID) return;
      if (connections.some((c) => c.userId === toUserId)) return;

      setInvites((prev) => {
        const alreadyPending = prev.some(
          (i) =>
            i.status === 'pending' &&
            ((i.fromUserId === CURRENT_USER_ID && i.toUserId === toUserId) ||
              (i.fromUserId === toUserId && i.toUserId === CURRENT_USER_ID)),
        );
        if (alreadyPending) return prev;
        return [
          ...prev,
          {
            id: `inv-out-${Date.now()}`,
            fromUserId: CURRENT_USER_ID,
            toUserId,
            status: 'pending' as const,
            createdAt: Date.now(),
          },
        ];
      });
    },
    [connections],
  );

  const patchPost = useCallback(
    (postId: string, mapFn: (post: SharedMomentPost) => SharedMomentPost) => {
      const current =
        feedRef.current.find((p) => p.id === postId) ??
        discoverFeedRef.current.find((p) => p.id === postId);
      if (!current) return;

      const next = mapFn(current);
      setFeed((prev) => {
        if (!prev.some((p) => p.id === postId)) return prev;
        return prev.map((p) => (p.id === postId ? next : p));
      });
      setDiscoverFeed((prev) => {
        if (!prev.some((p) => p.id === postId)) return prev;
        return prev.map((p) => (p.id === postId ? next : p));
      });
      void savePostEngagement(next);
    },
    [],
  );

  const toggleLike = useCallback(
    (postId: string) => {
      patchPost(postId, (post) => {
        const liked = post.likedByUserIds.includes(me.id);
        return {
          ...post,
          likedByUserIds: liked
            ? post.likedByUserIds.filter((id) => id !== me.id)
            : [...post.likedByUserIds, me.id],
        };
      });
    },
    [me.id, patchPost],
  );

  const addComment = useCallback(
    (postId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      const now = Date.now();
      patchPost(postId, (post) => ({
        ...post,
        comments: [
          ...post.comments,
          {
            id: `c-${postId}-${now}`,
            postId,
            authorId: me.id,
            authorName: me.name,
            authorHandle: me.handle,
            body: trimmed,
            createdAt: now,
          },
        ],
      }));
    },
    [me.handle, me.id, me.name, patchPost],
  );

  const deleteMemory = useCallback(
    (postId: string) => {
      const fromFeed = feed.find((p) => p.id === postId);
      const fromDiscover = discoverFeed.find((p) => p.id === postId);
      const post = fromFeed ?? fromDiscover;
      if (!post) return;

      setFeed((prev) => prev.filter((p) => p.id !== postId));
      setDiscoverFeed((prev) => prev.filter((p) => p.id !== postId));
      setSharedMine((prev) => prev.filter((m) => m.id !== post.momentId));
      void removePostedMemory(postId).then(async () => {
        const next = await loadPostedMemories();
        setPostedPhotos(next.photos);
      });
    },
    [feed, discoverFeed],
  );

  const searchUsers = useCallback(
    async (query: string, excludeUserId?: string): Promise<SearchUserResult[]> => {
      const q = query.trim().toLowerCase().replace(/^@/, '');
      if (!q) return [];

      const exclude = new Set(
        [excludeUserId, CURRENT_USER_ID].filter(Boolean) as string[],
      );

      const mockMatches = Object.values(mockUsers)
        .filter((u) => {
          if (exclude.has(u.id)) return false;
          const username = u.handle.replace(/^@/, '').toLowerCase();
          const name = u.name.toLowerCase();
          return username.includes(q) || name.includes(q);
        })
        .map((u) => ({
          id: u.id,
          username: u.handle.replace(/^@/, ''),
          name: u.name,
          avatarUri: u.avatarUri,
        }));

      const authMatches = await authService.searchUsers(q, excludeUserId);
      const byUsername = new Map<string, SearchUserResult>();

      for (const match of mockMatches) {
        byUsername.set(match.username, match);
      }
      for (const match of authMatches) {
        if (exclude.has(match.id)) continue;
        if (!byUsername.has(match.username)) {
          byUsername.set(match.username, {
            id: match.id,
            username: match.username,
          });
        }
      }

      const results = [...byUsername.values()].sort((a, b) =>
        a.username.localeCompare(b.username),
      );

      setUsersById((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const result of results) {
          if (!next[result.id]) {
            next[result.id] = {
              id: result.id,
              name: result.name ?? result.username,
              handle: `@${result.username}`,
              avatarUri: result.avatarUri,
            };
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      return results;
    },
    [],
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
      keepMoment,
      dismissMoment,
      clearNewMemoryBadge,
      scanMemories,
      getPostsByUser,
      acceptInvite,
      declineInvite,
      sendInvite,
      toggleLike,
      addComment,
      deleteMemory,
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
      keepMoment,
      dismissMoment,
      clearNewMemoryBadge,
      scanMemories,
      getPostsByUser,
      acceptInvite,
      declineInvite,
      sendInvite,
      toggleLike,
      addComment,
      deleteMemory,
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
