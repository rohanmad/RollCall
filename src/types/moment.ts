export type AssetLocation = {
  latitude: number;
  longitude: number;
};

export type PhotoAsset = {
  id: string;
  uri: string;
  createdAt: number;
  location?: AssetLocation;
  width?: number;
  height?: number;
};

export type MomentStatus = 'draft' | 'shared' | 'dismissed';

export type MemoryChip = {
  id: string;
  label: string;
};

export type Moment = {
  id: string;
  /** AI-generated memory title */
  title: string;
  /** Short AI-generated caption */
  caption?: string;
  locationLabel?: string;
  chips?: MemoryChip[];
  startAt: number;
  endAt: number;
  photoIds: string[];
  coverPhotoId: string;
  centroid?: AssetLocation;
  status: MomentStatus;
  sharedAt?: number;
};

export type UserProfile = {
  id: string;
  name: string;
  handle: string;
  bio?: string;
  avatarUri?: string;
  /** Public friend count (mock until backend) */
  friendCount?: number;
};

export type SearchUserResult = {
  id: string;
  username: string;
  name?: string;
  avatarUri?: string;
};

export type InviteStatus = 'pending' | 'accepted' | 'declined';

export type Invite = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: InviteStatus;
  createdAt: number;
};

export type Connection = {
  userId: string;
  since: number;
};

export type SharedMomentPost = {
  id: string;
  momentId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  sharedAt: number;
  audienceCount: number;
  likedByUserIds: string[];
  comments: PostComment[];
};

export type PostComment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  body: string;
  createdAt: number;
};
