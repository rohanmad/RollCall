import { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import type { Moment, PhotoAsset, SharedMomentPost } from '../types/moment';
import { colors } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const COVER_HEIGHT = Math.round(CARD_WIDTH * 1.15);

type Props = {
  post: SharedMomentPost;
  moment: Moment;
  photos: PhotoAsset[];
  interactive?: boolean;
  onAuthorPress?: (userId: string) => void;
  onCommentPress?: (postId: string) => void;
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MemoryCard({
  post,
  moment,
  photos,
  interactive = true,
  onAuthorPress,
  onCommentPress,
}: Props) {
  const { me, toggleLike, retryMemorySync } = useAppState();
  const [photoIndex, setPhotoIndex] = useState(0);

  const liked = post.likedByUserIds.includes(me.id);
  const likeCount = post.likedByUserIds.length;
  const syncFailed = post.syncStatus === 'failed';
  const memoryId = post.remoteId ?? post.id;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    setPhotoIndex(next);
  };

  return (
    <View style={styles.card}>
      <View>
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            <Image source={{ uri: item.uri }} style={styles.cover} />
          )}
          ListEmptyComponent={<View style={[styles.cover, styles.coverFallback]} />}
        />
        {photos.length > 1 ? (
          <View style={styles.photoCount}>
            <Text style={styles.photoCountText}>
              {photoIndex + 1}/{photos.length}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{moment.title}</Text>

        <Pressable
          onPress={() => onAuthorPress?.(post.authorId)}
          disabled={!onAuthorPress}
          style={({ pressed }) => [
            styles.metaRow,
            onAuthorPress && pressed && styles.pressed,
          ]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{post.authorName.slice(0, 1)}</Text>
          </View>
          <Text style={styles.username}>{post.authorName}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{formatDate(post.sharedAt)}</Text>
          {moment.locationLabel ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={[styles.metaText, styles.location]} numberOfLines={1}>
                {moment.locationLabel}
              </Text>
            </>
          ) : null}
        </Pressable>

        {syncFailed ? (
          <Pressable
            onPress={() => void retryMemorySync(memoryId)}
            style={({ pressed }) => [styles.syncRetry, pressed && styles.pressed]}
            hitSlop={6}
          >
            <Text style={styles.syncRetryText}>Sync failed · Retry</Text>
          </Pressable>
        ) : null}

        {interactive ? (
          <View style={styles.reactions}>
            <Pressable
              onPress={() => toggleLike(post.id)}
              style={({ pressed }) => [styles.reactionBtn, pressed && styles.pressed]}
              hitSlop={8}
            >
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={22}
                color={liked ? colors.like : colors.ink}
              />
              {likeCount > 0 ? (
                <Text style={styles.reactionCount}>{likeCount}</Text>
              ) : null}
            </Pressable>

            <Pressable
              onPress={() => onCommentPress?.(post.id)}
              style={({ pressed }) => [styles.reactionBtn, pressed && styles.pressed]}
              hitSlop={8}
            >
              <Ionicons name="chatbubble-outline" size={20} color={colors.ink} />
              {post.comments.length > 0 ? (
                <Text style={styles.reactionCount}>{post.comments.length}</Text>
              ) : null}
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 28,
    shadowColor: '#1C1C1A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  cover: {
    width: CARD_WIDTH,
    height: COVER_HEIGHT,
    backgroundColor: colors.chipBg,
  },
  coverFallback: { backgroundColor: colors.accentSoft },
  photoCount: {
    position: 'absolute',
    right: 14,
    top: 14,
    backgroundColor: 'rgba(28,28,26,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  photoCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  username: { fontSize: 13, fontWeight: '600', color: colors.ink },
  metaDot: { color: colors.muted, fontSize: 13 },
  metaText: { fontSize: 13, color: colors.muted },
  location: { flexShrink: 1 },
  syncRetry: {
    alignSelf: 'flex-start',
  },
  syncRetryText: {
    fontSize: 12,
    color: colors.like,
    fontWeight: '600',
  },
  reactions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 6,
    paddingTop: 4,
  },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reactionCount: { fontSize: 13, fontWeight: '600', color: colors.ink },
  pressed: { opacity: 0.65 },
});
