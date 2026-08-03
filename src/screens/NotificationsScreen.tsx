import { useCallback, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import {
  isNotificationUnread,
  type AppNotification,
} from '../lib/notifications';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

function formatWhen(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function iconFor(type: AppNotification['type']): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return 'people-outline';
    case 'friend_memory':
      return 'images-outline';
    case 'memory_liked':
      return 'heart-outline';
    case 'memory_commented':
      return 'chatbubble-outline';
    default:
      return 'notifications-outline';
  }
}

export function NotificationsScreen({ navigation }: Props) {
  const {
    notifications,
    notificationsLoading,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    ensurePostAvailable,
  } = useAppState();

  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications]),
  );

  const sorted = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [notifications],
  );

  const onPress = async (item: AppNotification) => {
    if (isNotificationUnread(item)) {
      void markNotificationRead(item.id);
    }

    switch (item.type) {
      case 'friend_request':
      case 'friend_accepted':
        navigation.navigate('UserProfile', { userId: item.actorId });
        break;
      case 'friend_memory':
      case 'memory_liked':
      case 'memory_commented':
        if (item.entityId) {
          await ensurePostAvailable(item.entityId);
          navigation.navigate('MemoryFocus', { postId: item.entityId });
        }
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          sorted.some(isNotificationUnread) ? (
            <Pressable
              onPress={() => void markAllNotificationsRead()}
              style={({ pressed }) => [
                styles.markAll,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.markAllLabel}>Mark all as read</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {notificationsLoading ? 'Loading…' : 'No notifications yet'}
            </Text>
            {!notificationsLoading ? (
              <Text style={styles.emptyBody}>
                Friend requests, new memories, likes, and comments show up here.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const unread = isNotificationUnread(item);
          const name = item.actorUsername ?? 'Someone';
          return (
            <Pressable
              onPress={() => void onPress(item)}
              style={({ pressed }) => [
                styles.row,
                unread && styles.rowUnread,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
                <Ionicons
                  name={iconFor(item.type)}
                  size={18}
                  color={colors.ink}
                />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.body, unread && styles.bodyUnread]}>
                  <Text style={styles.actor}>{name} </Text>
                  {item.body}
                </Text>
                <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
              </View>
              {unread ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: 40, flexGrow: 1 },
  markAll: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  markAllLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowUnread: {
    backgroundColor: colors.accentSoft,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnread: {
    backgroundColor: colors.surface,
  },
  copy: { flex: 1, gap: 4 },
  body: {
    fontSize: 15,
    color: colors.ink,
    lineHeight: 20,
    fontWeight: '400',
  },
  bodyUnread: { fontWeight: '600' },
  actor: { fontWeight: '700' },
  when: { fontSize: 12, color: colors.muted },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.like,
  },
  empty: {
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 8,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  emptyBody: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    textAlign: 'center',
  },
  pressed: { opacity: 0.72 },
});
