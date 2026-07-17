import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MemoryCard } from '../components/MemoryCard';
import { useAppState } from '../state/AppState';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DiscoverScreen() {
  const navigation = useNavigation<Nav>();
  const { discoverFeed, moments, photosById, connections } = useAppState();
  const friendIds = new Set(connections.map((c) => c.userId));

  const posts = discoverFeed
    .filter((p) => !friendIds.has(p.authorId))
    .map((post) => {
      const moment = moments.find((m) => m.id === post.momentId);
      if (!moment) return null;
      const photos = moment.photoIds
        .map((id) => photosById[id])
        .filter(Boolean);
      return { post, moment, photos };
    })
    .filter(Boolean) as {
    post: (typeof discoverFeed)[0];
    moment: (typeof moments)[0];
    photos: NonNullable<(typeof photosById)[string]>[];
  }[];

  const openProfile = (userId: string) => {
    navigation.navigate('UserProfile', { userId });
  };

  const openComments = (postId: string) => {
    navigation.navigate('MemoryFocus', { postId });
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.post.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.heading}>Nearby</Text>
            <Text style={styles.sub}>
              Memories from people around you who aren’t on your friends list yet.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing nearby</Text>
            <Text style={styles.emptyBody}>
              When someone in your area keeps a memory — and you’re not connected —
              it can show up here.
            </Text>
          </View>
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
  list: { paddingTop: 12, paddingBottom: 40 },
  header: { paddingHorizontal: 24, paddingBottom: 20, gap: 6 },
  heading: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.8,
  },
  sub: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  empty: { paddingHorizontal: 24, paddingTop: 12, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 15, color: colors.muted, lineHeight: 22 },
});
