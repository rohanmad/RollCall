export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'friend_memory'
  | 'memory_liked'
  | 'memory_commented';

export type AppNotification = {
  id: string;
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityId?: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
  /** Joined from profiles when available */
  actorUsername?: string;
  actorAvatarUri?: string;
};

export type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: NotificationType;
  entity_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

export function mapNotificationRow(
  row: NotificationRow,
  actor?: { username: string; avatarUri?: string },
): AppNotification {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    actorId: row.actor_id,
    type: row.type,
    entityId: row.entity_id ?? undefined,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
    actorUsername: actor?.username,
    actorAvatarUri: actor?.avatarUri,
  };
}

export function isNotificationUnread(n: AppNotification): boolean {
  return !n.readAt;
}
