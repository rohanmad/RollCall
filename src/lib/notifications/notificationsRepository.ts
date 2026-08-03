import { isSupabaseConfigured, supabase } from '../supabase';
import { emitNotificationEvent } from './events';
import {
  mapNotificationRow,
  type AppNotification,
  type NotificationRow,
  type NotificationType,
} from './types';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export function isNotificationsBackendReady(): boolean {
  return isSupabaseConfigured && Boolean(supabase);
}

async function fetchActorMeta(
  ids: string[],
): Promise<Map<string, { username: string; avatarUri?: string }>> {
  const map = new Map<string, { username: string; avatarUri?: string }>();
  if (!ids.length) return map;
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', ids);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    map.set(row.id as string, {
      username: row.username as string,
      avatarUri: (row.avatar_url as string | null) ?? undefined,
    });
  }
  return map;
}

export async function createNotification(input: {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  body: string;
  entityId?: string;
}): Promise<AppNotification | null> {
  if (!isNotificationsBackendReady()) return null;
  if (input.recipientId === input.actorId) return null;

  try {
    const client = requireClient();
    const { data, error } = await client
      .from('notifications')
      .insert({
        recipient_id: input.recipientId,
        actor_id: input.actorId,
        type: input.type,
        body: input.body,
        entity_id: input.entityId ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    const notification = mapNotificationRow(data as NotificationRow);
    emitNotificationEvent({ type: 'created', notification });
    return notification;
  } catch (error) {
    console.warn('[notifications] create failed', error);
    return null;
  }
}

export async function createNotificationsForRecipients(input: {
  recipientIds: string[];
  actorId: string;
  type: NotificationType;
  body: string;
  entityId?: string;
}): Promise<void> {
  const recipients = [
    ...new Set(input.recipientIds.filter((id) => id && id !== input.actorId)),
  ];
  if (!recipients.length || !isNotificationsBackendReady()) return;

  try {
    const client = requireClient();
    const rows = recipients.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: input.actorId,
      type: input.type,
      body: input.body,
      entity_id: input.entityId ?? null,
    }));
    const { data, error } = await client
      .from('notifications')
      .insert(rows)
      .select('*');
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      emitNotificationEvent({
        type: 'created',
        notification: mapNotificationRow(row as NotificationRow),
      });
    }
  } catch (error) {
    console.warn('[notifications] bulk create failed', error);
  }
}

export async function listNotifications(
  recipientId: string,
  options?: { limit?: number },
): Promise<AppNotification[]> {
  if (!isNotificationsBackendReady()) return [];
  const client = requireClient();
  const limit = options?.limit ?? 50;

  const { data, error } = await client
    .from('notifications')
    .select('*')
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NotificationRow[];
  const actors = await fetchActorMeta([...new Set(rows.map((r) => r.actor_id))]);
  return rows.map((row) => mapNotificationRow(row, actors.get(row.actor_id)));
}

export async function countUnreadNotifications(
  recipientId: string,
): Promise<number> {
  if (!isNotificationsBackendReady()) return 0;
  const client = requireClient();
  const { count, error } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .is('read_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationsRead(
  recipientId: string,
  ids: string[],
): Promise<void> {
  if (!ids.length || !isNotificationsBackendReady()) return;
  const client = requireClient();
  const { error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', recipientId)
    .in('id', ids)
    .is('read_at', null);
  if (error) throw new Error(error.message);
  emitNotificationEvent({ type: 'read', ids });
}

export async function markAllNotificationsRead(
  recipientId: string,
): Promise<void> {
  if (!isNotificationsBackendReady()) return;
  const client = requireClient();
  const { data, error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', recipientId)
    .is('read_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.id as string);
  if (ids.length) emitNotificationEvent({ type: 'read', ids });
}

/** Resolve friend user ids for fan-out (e.g. new memory). */
export async function listFriendRecipientIds(meId: string): Promise<string[]> {
  if (!isNotificationsBackendReady()) return [];
  const client = requireClient();
  const { data, error } = await client
    .from('friendships')
    .select('user_a, user_b')
    .or(`user_a.eq.${meId},user_b.eq.${meId}`);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    (row.user_a as string) === meId
      ? (row.user_b as string)
      : (row.user_a as string),
  );
}
