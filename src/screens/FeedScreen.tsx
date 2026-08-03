import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MemoryCard } from '../components/MemoryCard';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const {
    feed,
    moments,
    photosById,
    feedLoading,
    feedRefreshing,
    refreshFeed,
  } = useAppState();

  const posts = feed
    .map((post) => {
      const moment = moments.find((m) => m.id === post.momentId);
      if (!moment) return null;
      const photos = moment.photoIds
        .map((id) => photosById[id])
        .filter(Boolean);
      return { post, moment, photos };
    })
    .filter(Boolean) as {
    post: (typeof feed)[0];
    moment: (typeof moments)[0];
    photos: NonNullable<(typeof photosById)[string]>[];
  }[];

  const openProfile = (userId: string) => {
    navigation.navigate('UserProfile', { userId });
  };

  const openComments = (postId: string) => {
    navigation.navigate('MemoryFocus', { postId });
  };

  const showInitialLoading = feedLoading && posts.length === 0;

  return (
    <View style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.post.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={feedRefreshing}
            onRefresh={() => void refreshFeed({ silent: true })}
            tintColor={colors.muted}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.heading}>Memories</Text>
            <Text style={styles.sub}>
              A calm timeline of your friends’ lives.
            </Text>
          </View>
        }
        ListEmptyComponent={
          showInitialLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.muted} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>
                When a friend posts a memory, it appears here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <MemoryCard
            post={item.post}
            moment={item.moment}
            photos={item.photos}
            onAuthorPress={openProfile}
            onCommentPress={openComments}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingTop: 12, paddingBottom: 40, flexGrow: 1 },
  header: { paddingHorizontal: 24, paddingBottom: 20, gap: 6 },
  heading: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.8,
  },
  sub: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  empty: { paddingHorizontal: 24, paddingTop: 48, gap: 8, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 14, color: colors.muted, lineHeight: 20, textAlign: 'center' },
});
