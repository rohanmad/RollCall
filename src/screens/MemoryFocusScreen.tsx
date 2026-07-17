import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FadeIn } from '../components/FadeIn';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'MemoryFocus'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PAD = 20;
const MEDIA_WIDTH = SCREEN_WIDTH;
const MEDIA_HEIGHT = Math.round(SCREEN_WIDTH * 1.1);

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MemoryFocusScreen({ route, navigation }: Props) {
  const { postId } = route.params;
  const {
    feed,
    discoverFeed,
    moments,
    photosById,
    me,
    toggleLike,
    addComment,
  } = useAppState();

  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState('');
  const [photoIndex, setPhotoIndex] = useState(0);

  const post = useMemo(
    () => [...feed, ...discoverFeed].find((p) => p.id === postId),
    [feed, discoverFeed, postId],
  );
  const moment = useMemo(
    () => (post ? moments.find((m) => m.id === post.momentId) : undefined),
    [moments, post],
  );
  const photos = useMemo(() => {
    if (!moment) return [];
    return moment.photoIds.map((id) => photosById[id]).filter(Boolean);
  }, [moment, photosById]);

  useEffect(() => {
    // Wait for the modal transition, then open the keyboard.
    const t = setTimeout(() => inputRef.current?.focus(), 420);
    return () => clearTimeout(t);
  }, []);

  if (!post || !moment) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Memory unavailable</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const liked = post.likedByUserIds.includes(me.id);
  const likeCount = post.likedByUserIds.length;
  const commentCount = post.comments.length;

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    addComment(post.id, body);
    setDraft('');
    // Keep focus for a continuous commenting feel
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / MEDIA_WIDTH);
    setPhotoIndex(next);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.topBar}>
          <View style={styles.grabber} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <FadeIn delay={40} duration={420}>
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
                ListEmptyComponent={
                  <View style={[styles.cover, styles.coverFallback]} />
                }
              />
              {photos.length > 1 ? (
                <View style={styles.photoCount}>
                  <Text style={styles.photoCountText}>
                    {photoIndex + 1}/{photos.length}
                  </Text>
                </View>
              ) : null}
            </View>
          </FadeIn>

          <FadeIn delay={120} duration={480} style={styles.body}>
            <Text style={styles.title}>{moment.title}</Text>
            <View style={styles.metaRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {post.authorName.slice(0, 1)}
                </Text>
              </View>
              <Text style={styles.username}>{post.authorName}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{formatDate(post.sharedAt)}</Text>
              {moment.locationLabel ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text
                    style={[styles.metaText, styles.location]}
                    numberOfLines={1}
                  >
                    {moment.locationLabel}
                  </Text>
                </>
              ) : null}
            </View>

            <View style={styles.statsRow}>
              <Pressable
                onPress={() => toggleLike(post.id)}
                style={({ pressed }) => [
                  styles.reactionBtn,
                  pressed && styles.pressed,
                ]}
                hitSlop={8}
              >
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={22}
                  color={liked ? colors.like : colors.ink}
                />
                <Text style={styles.statText}>
                  {likeCount} {likeCount === 1 ? 'like' : 'likes'}
                </Text>
              </Pressable>
              <View style={styles.reactionBtn}>
                <Ionicons
                  name="chatbubble-outline"
                  size={20}
                  color={colors.ink}
                />
                <Text style={styles.statText}>
                  {commentCount}{' '}
                  {commentCount === 1 ? 'comment' : 'comments'}
                </Text>
              </View>
            </View>
          </FadeIn>

          <FadeIn delay={220} duration={520} style={styles.commentsBlock}>
            <Text style={styles.commentsHeading}>Comments</Text>
            {post.comments.length === 0 ? (
              <Text style={styles.emptyComments}>
                Be the first to leave a thought on this memory.
              </Text>
            ) : (
              post.comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>
                      {c.authorName.slice(0, 1)}
                    </Text>
                  </View>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>{c.authorName}</Text>
                    <Text style={styles.commentText}>{c.body}</Text>
                  </View>
                </View>
              ))
            )}
          </FadeIn>
        </ScrollView>

        <FadeIn delay={280} duration={480} style={styles.composerWrap}>
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment"
              placeholderTextColor={colors.muted}
              style={styles.input}
              returnKeyType="send"
              onSubmitEditing={submit}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={submit}
              disabled={!draft.trim()}
              hitSlop={8}
              style={!draft.trim() && styles.sendDisabled}
            >
              <Ionicons
                name="arrow-up-circle"
                size={30}
                color={draft.trim() ? colors.ink : colors.line}
              />
            </Pressable>
          </View>
        </FadeIn>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 10,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  scrollContent: { paddingBottom: 16 },
  cover: {
    width: MEDIA_WIDTH,
    height: MEDIA_HEIGHT,
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
  photoCountText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  body: {
    paddingHorizontal: H_PAD,
    paddingTop: 18,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.5,
    lineHeight: 32,
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingTop: 4,
  },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  commentsBlock: {
    paddingHorizontal: H_PAD,
    paddingTop: 20,
    gap: 14,
  },
  commentsHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  emptyComments: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  commentBody: { flex: 1, gap: 2 },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: colors.ink },
  commentText: { fontSize: 14, lineHeight: 20, color: colors.ink },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: H_PAD,
    paddingTop: 10,
    paddingBottom: 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 8,
  },
  sendDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.65 },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  missingTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  closeLabel: { fontSize: 16, fontWeight: '600', color: colors.ink },
});
