export type FriendRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'canceled';

export type FriendRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type Friendship = {
  id: string;
  userA: string;
  userB: string;
  createdAt: string;
};

export type FriendProfile = {
  id: string;
  username: string;
  bio?: string;
  avatarUri?: string;
};

export type FriendRequestRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: FriendRequestStatus;
  created_at: string;
  updated_at: string;
};

export type FriendshipRow = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
};

export function mapFriendRequest(row: FriendRequestRow): FriendRequest {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFriendship(row: FriendshipRow): Friendship {
  return {
    id: row.id,
    userA: row.user_a,
    userB: row.user_b,
    createdAt: row.created_at,
  };
}

/** Canonical undirected pair ordering for friendships.user_a < user_b */
export function orderedPair(userIdA: string, userIdB: string): [string, string] {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

export function otherUserId(
  friendship: Friendship,
  meId: string,
): string {
  return friendship.userA === meId ? friendship.userB : friendship.userA;
}
