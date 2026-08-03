import { clusterMoments } from '../lib/clusterMoments';
import { createMemoryDraftSync } from '../lib/memoryPipeline/createMemoryDraft';
import type {
  Connection,
  Invite,
  Moment,
  PhotoAsset,
  SharedMomentPost,
  UserProfile,
} from '../types/moment';

function hoursFrom(base: number, hours: number) {
  return base + hours * 60 * 60 * 1000;
}

const SF = { latitude: 37.7749, longitude: -122.4194 };
const OAKLAND = { latitude: 37.8044, longitude: -122.2712 };
const LA = { latitude: 34.0522, longitude: -118.2437 };

const baseWeekend = Date.UTC(2026, 6, 11, 16, 0, 0);
const baseTrip = Date.UTC(2026, 6, 4, 14, 0, 0);

export const CURRENT_USER_ID = 'me';

export const mockUsers: Record<string, UserProfile> = {
  me: {
    id: 'me',
    name: 'Rohan',
    handle: '@rohan',
    bio: 'Life, beautifully organized.',
    avatarUri: 'https://picsum.photos/seed/rollcall-me/200/200',
    friendCount: 3,
  },
  alex: {
    id: 'alex',
    name: 'Alex',
    handle: '@alex',
    bio: 'Chasing good light.',
    avatarUri: 'https://picsum.photos/seed/rollcall-alex/200/200',
    friendCount: 28,
  },
  sam: {
    id: 'sam',
    name: 'Sam',
    handle: '@sam',
    avatarUri: 'https://picsum.photos/seed/rollcall-sam/200/200',
    friendCount: 14,
  },
  jordan: {
    id: 'jordan',
    name: 'Jordan',
    handle: '@jordan',
    avatarUri: 'https://picsum.photos/seed/rollcall-jordan/200/200',
    friendCount: 19,
  },
  casey: {
    id: 'casey',
    name: 'Casey',
    handle: '@casey',
    bio: 'Usually on a trail.',
    avatarUri: 'https://picsum.photos/seed/rollcall-casey/200/200',
    friendCount: 11,
  },
  riley: {
    id: 'riley',
    name: 'Riley',
    handle: '@riley',
    bio: 'Coffee first.',
    avatarUri: 'https://picsum.photos/seed/rollcall-riley/200/200',
    friendCount: 7,
  },
};

export const mockPhotos: PhotoAsset[] = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `sf-${i}`,
    uri: `https://picsum.photos/seed/sf${i}/900/1100`,
    createdAt: hoursFrom(baseWeekend, i * 1.5),
    location: {
      latitude: SF.latitude + i * 0.002,
      longitude: SF.longitude + i * 0.001,
    },
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `oak-${i}`,
    uri: `https://picsum.photos/seed/oak${i}/900/1100`,
    createdAt: hoursFrom(baseWeekend, 14 + i),
    location: {
      latitude: OAKLAND.latitude + i * 0.001,
      longitude: OAKLAND.longitude,
    },
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `la-${i}`,
    uri: `https://picsum.photos/seed/la${i}/900/1100`,
    createdAt: hoursFrom(baseTrip, i * 3),
    location: {
      latitude: LA.latitude + i * 0.003,
      longitude: LA.longitude - i * 0.002,
    },
  })),
  {
    id: 'lonely-1',
    uri: 'https://picsum.photos/seed/lonely1/900/1100',
    createdAt: hoursFrom(baseTrip, -48),
    location: SF,
  },
];

export const friendPhotos: PhotoAsset[] = Array.from({ length: 5 }, (_, i) => ({
  id: `alex-beach-${i}`,
  uri: `https://picsum.photos/seed/alexbeach${i}/900/1100`,
  createdAt: hoursFrom(baseWeekend, -20 + i),
  location: { latitude: 32.6859, longitude: -117.1831 },
}));

const rawClusters = clusterMoments(mockPhotos);

/** Enrich clusters with place-aware titles (mock copy until live geocode). */
export const mockDraftMoments: Moment[] = rawClusters.map((cluster, i) => {
  if (i === 0) {
    return {
      ...createMemoryDraftSync(cluster, {
        placeName: 'Los Angeles',
        locationLabel: 'Los Angeles, CA',
      }),
      title: 'Golden Hour in Los Angeles',
      locationLabel: 'Los Angeles, CA',
      chips: [
        { id: 'c1', label: 'Sunset' },
        { id: 'c2', label: 'City' },
        { id: 'c3', label: 'Solo' },
      ],
    };
  }
  return {
    ...createMemoryDraftSync(cluster, {
      placeName: 'San Francisco',
      locationLabel: 'San Francisco Bay Area',
    }),
    title: 'Bay Weekend Wander',
    locationLabel: 'San Francisco Bay Area',
    chips: [
      { id: 'c1', label: 'Friends' },
      { id: 'c2', label: 'Weekend' },
      { id: 'c3', label: 'Coffee' },
    ],
  };
});

export const alexSharedMoment: Moment = {
  ...createMemoryDraftSync(clusterMoments(friendPhotos)[0], {
    id: 'alex-moment-1',
    placeName: 'Coronado',
    locationLabel: 'Coronado, CA',
  }),
  title: 'Golden Hour at Coronado',
  locationLabel: 'Coronado, CA',
  chips: [
    { id: 'a1', label: 'Nature' },
    { id: 'a2', label: 'Sunset' },
    { id: 'a3', label: 'Beach' },
  ],
  status: 'shared',
  sharedAt: hoursFrom(baseWeekend, -12),
};

export const initialConnections: Connection[] = [
  { userId: 'alex', since: hoursFrom(baseTrip, -200) },
  { userId: 'sam', since: hoursFrom(baseTrip, -150) },
  { userId: 'jordan', since: hoursFrom(baseTrip, -80) },
];

export const initialInvites: Invite[] = [
  {
    id: 'inv-in-1',
    fromUserId: 'casey',
    toUserId: CURRENT_USER_ID,
    status: 'pending',
    createdAt: hoursFrom(baseWeekend, -5),
  },
  {
    id: 'inv-out-1',
    fromUserId: CURRENT_USER_ID,
    toUserId: 'riley',
    status: 'pending',
    createdAt: hoursFrom(baseWeekend, -30),
  },
];

export const initialFeed: SharedMomentPost[] = [
  {
    id: 'post-alex-1',
    momentId: alexSharedMoment.id,
    authorId: 'alex',
    authorName: mockUsers.alex.name,
    authorHandle: mockUsers.alex.handle,
    sharedAt: alexSharedMoment.sharedAt!,
    audienceCount: 4,
    likedByUserIds: ['sam', 'jordan'],
    comments: [
      {
        id: 'c-alex-1',
        postId: 'post-alex-1',
        authorId: 'sam',
        authorName: mockUsers.sam.name,
        authorHandle: mockUsers.sam.handle,
        body: 'This feels like summer already',
        createdAt: hoursFrom(baseWeekend, -10),
      },
      {
        id: 'c-alex-2',
        postId: 'post-alex-1',
        authorId: 'jordan',
        authorName: mockUsers.jordan.name,
        authorHandle: mockUsers.jordan.handle,
        body: 'Need this exact light in my life',
        createdAt: hoursFrom(baseWeekend, -8),
      },
    ],
  },
];

/** Nearby people for Discover (mock) — reserved; Discover shows area posts */
export const nearbyPeople = [
  { id: 'casey', distanceLabel: '0.4 mi away', mutualFriends: 2 },
  { id: 'riley', distanceLabel: '1.1 mi away', mutualFriends: 1 },
];

/** Non-friend memories posted nearby (Discover) */
export const discoverPhotos: PhotoAsset[] = [
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `casey-hike-${i}`,
    uri: `https://picsum.photos/seed/caseyhike${i}/900/1100`,
    createdAt: hoursFrom(baseWeekend, -6 + i),
    location: { latitude: 37.86, longitude: -122.43 },
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `riley-cafe-${i}`,
    uri: `https://picsum.photos/seed/rileycafé${i}/900/1100`.replace('café', 'cafe'),
    createdAt: hoursFrom(baseWeekend, -2 + i * 0.5),
    location: { latitude: 37.77, longitude: -122.42 },
  })),
];

export const discoverMoments: Moment[] = [
  {
    id: 'discover-casey-1',
    title: 'Morning Ridge Hike',
    locationLabel: 'Near you · Twin Peaks',
    chips: [
      { id: 'd1', label: 'Nature' },
      { id: 'd2', label: 'Morning' },
    ],
    startAt: hoursFrom(baseWeekend, -6),
    endAt: hoursFrom(baseWeekend, -3),
    photoIds: ['casey-hike-0', 'casey-hike-1', 'casey-hike-2', 'casey-hike-3'],
    coverPhotoId: 'casey-hike-1',
    status: 'shared',
    sharedAt: hoursFrom(baseWeekend, -2),
  },
  {
    id: 'discover-riley-1',
    title: 'Saturday Coffee Run',
    locationLabel: 'Near you · Mission District',
    chips: [
      { id: 'd3', label: 'Coffee' },
      { id: 'd4', label: 'Weekend' },
    ],
    startAt: hoursFrom(baseWeekend, -2),
    endAt: hoursFrom(baseWeekend, -0.5),
    photoIds: ['riley-cafe-0', 'riley-cafe-1', 'riley-cafe-2'],
    coverPhotoId: 'riley-cafe-0',
    status: 'shared',
    sharedAt: hoursFrom(baseWeekend, -1),
  },
];

export const discoverFeed: SharedMomentPost[] = [
  {
    id: 'discover-post-casey',
    momentId: 'discover-casey-1',
    authorId: 'casey',
    authorName: mockUsers.casey.name,
    authorHandle: mockUsers.casey.handle,
    sharedAt: hoursFrom(baseWeekend, -2),
    audienceCount: 0,
    likedByUserIds: [],
    comments: [],
  },
  {
    id: 'discover-post-riley',
    momentId: 'discover-riley-1',
    authorId: 'riley',
    authorName: mockUsers.riley.name,
    authorHandle: mockUsers.riley.handle,
    sharedAt: hoursFrom(baseWeekend, -1),
    audienceCount: 0,
    likedByUserIds: ['casey'],
    comments: [],
  },
];

export function photoMap(
  photos: PhotoAsset[] = [...mockPhotos, ...friendPhotos, ...discoverPhotos],
) {
  return Object.fromEntries(photos.map((p) => [p.id, p]));
}

export function allMoments(): Moment[] {
  return [...mockDraftMoments, alexSharedMoment, ...discoverMoments];
}
