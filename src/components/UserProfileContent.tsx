import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { MemoryCard } from './MemoryCard';
import { CURRENT_USER_ID } from '../data/mockData';
import { useAppState } from '../state/AppState';
import { useAuth } from '../state/AuthState';
import { colors } from '../theme/colors';
import type {
  Moment,
  PhotoAsset,
  SearchUserResult,
  SharedMomentPost,
} from '../types/moment';
import type { RootStackParamList } from '../navigation/types';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GAP = 10;
const PAD = 24;
const COLS = 2;
const TILE = Math.floor((Dimensions.get('window').width - PAD * 2 - GAP) / COLS);

type MemoryItem = {
  post: SharedMomentPost;
  moment: Moment;
  photos: PhotoAsset[];
  cover?: PhotoAsset;
};

type Props = {
  userId: string;
  isOwnProfile?: boolean;
};

function PersonAvatar({ name, uri }: { name: string; uri?: string }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.personAvatarImage} />;
  }
  return (
    <View style={styles.personAvatar}>
      <Text style={styles.personAvatarText}>{name.slice(0, 1)}</Text>
    </View>
  );
}

export function UserProfileContent({ userId, isOwnProfile = false }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    connections,
    invites,
    usersById,
    moments,
    photosById,
    getPostsByUser,
    acceptInvite,
    declineInvite,
    deleteMemory,
    searchUsers,
    sendInvite,
  } = useAppState();
  const { user: authUser, updateAvatar } = useAuth();

  const [friendsOpen, setFriendsOpen] = useState(false);
  const [selected, setSelected] = useState<MemoryItem | null>(null);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [removingIds, setRemovingIds] = useState<Record<string, Animated.Value>>(
    {},
  );
  const removingRef = useRef(removingIds);
  removingRef.current = removingIds;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const baseUser = usersById[userId];
  const user = isOwnProfile && authUser
    ? {
        ...baseUser,
        id: authUser.id,
        name: authUser.username,
        handle: `@${authUser.username}`,
        bio: authUser.bio ?? baseUser?.bio ?? '',
        avatarUri: authUser.avatarUri ?? baseUser?.avatarUri,
      }
    : baseUser;

  const isFriend = connections.some((c) => c.userId === userId);
  const outgoingToUser = invites.find(
    (i) =>
      i.status === 'pending' &&
      i.fromUserId === CURRENT_USER_ID &&
      i.toUserId === userId,
  );
  const incomingFromUser = invites.find(
    (i) =>
      i.status === 'pending' &&
      i.fromUserId === userId &&
      i.toUserId === CURRENT_USER_ID,
  );
  const displayedFriendCount = isOwnProfile
    ? connections.length
    : (user?.friendCount ?? 0);

  const friends = connections.map((c) => usersById[c.userId]).filter(Boolean);
  const incoming = invites.filter(
    (i) => i.toUserId === CURRENT_USER_ID && i.status === 'pending',
  );
  const outgoing = invites.filter(
    (i) => i.fromUserId === CURRENT_USER_ID && i.status === 'pending',
  );
  const pendingCount = incoming.length + outgoing.length;

  const userPosts = useMemo(() => {
    return getPostsByUser(userId)
      .map((post) => {
        const moment = moments.find((m) => m.id === post.momentId);
        if (!moment) return null;
        const photos = moment.photoIds
          .map((id) => photosById[id])
          .filter(Boolean) as PhotoAsset[];
        return {
          post,
          moment,
          photos,
          cover: photosById[moment.coverPhotoId] ?? photos[0],
        };
      })
      .filter(Boolean) as MemoryItem[];
  }, [getPostsByUser, userId, moments, photosById]);

  useEffect(() => {
    if (!friendsOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearching(false);
      setHasSearched(false);
    }
  }, [friendsOpen]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      setHasSearched(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchUsers(q, authUser?.id);
      if (cancelled) return;
      setSearchResults(results);
      setSearching(false);
      setHasSearched(true);
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, searchUsers, authUser?.id]);

  const openSettings = () => {
    const parent = navigation.getParent();
    if (parent) parent.navigate('Settings');
    else navigation.navigate('Settings');
  };

  const pickAvatar = async () => {
    if (!isOwnProfile || updatingAvatar) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photos access needed',
        'Allow photo access to choose a profile picture.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUpdatingAvatar(true);
    const saved = await updateAvatar(result.assets[0].uri);
    setUpdatingAvatar(false);
    if (!saved.ok) {
      Alert.alert('Couldn’t update photo', saved.error);
    }
  };

  const onAvatarPress = () => {
    if (!isOwnProfile) return;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      { text: 'Choose photo', onPress: () => void pickAvatar() },
    ];
    if (user?.avatarUri) {
      buttons.push({
        text: 'Remove photo',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setUpdatingAvatar(true);
            const saved = await updateAvatar(null);
            setUpdatingAvatar(false);
            if (!saved.ok) {
              Alert.alert('Couldn’t remove photo', saved.error);
            }
          })();
        },
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile photo', undefined, buttons);
  };

  const openMemoryFocus = (postId: string) => {
    setSelected(null);
    const parent = navigation.getParent();
    if (parent) parent.navigate('MemoryFocus', { postId });
    else navigation.navigate('MemoryFocus', { postId });
  };

  const openUserProfile = (targetUserId: string) => {
    setFriendsOpen(false);
    setSearchQuery('');
    if (targetUserId === CURRENT_USER_ID || targetUserId === authUser?.id) {
      return;
    }
    const parent = navigation.getParent();
    if (parent) parent.navigate('UserProfile', { userId: targetUserId });
    else navigation.navigate('UserProfile', { userId: targetUserId });
  };

  const confirmDelete = (postId: string) => {
    setMenuPostId(null);
    Alert.alert(
      'Delete this memory?',
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const opacity =
              removingRef.current[postId] ?? new Animated.Value(1);
            setRemovingIds((prev) => ({ ...prev, [postId]: opacity }));
            Animated.timing(opacity, {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }).start(() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              deleteMemory(postId);
              setRemovingIds((prev) => {
                const next = { ...prev };
                delete next[postId];
                return next;
              });
              setSelected((cur) => (cur?.post.id === postId ? null : cur));
            });
          },
        },
      ],
    );
  };

  if (!user) {
    return (
      <View style={styles.screen}>
        <Text style={styles.emptyTitle}>User not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={userPosts}
        keyExtractor={(item) => item.post.id}
        numColumns={COLS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.topRow}>
              <Pressable
                onPress={isOwnProfile ? onAvatarPress : undefined}
                disabled={!isOwnProfile || updatingAvatar}
                style={({ pressed }) => [
                  styles.avatarWrap,
                  isOwnProfile && pressed && styles.pressed,
                ]}
                accessibilityLabel={
                  isOwnProfile ? 'Edit profile photo' : undefined
                }
                accessibilityRole={isOwnProfile ? 'button' : undefined}
              >
                <View style={styles.avatar}>
                  {user.avatarUri ? (
                    <Image
                      source={{ uri: user.avatarUri }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Text style={styles.avatarText}>
                      {user.name.slice(0, 1)}
                    </Text>
                  )}
                </View>
                {isOwnProfile ? (
                  <View style={styles.avatarEditBadge}>
                    {updatingAvatar ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={12} color="#fff" />
                    )}
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.headerMain}>
                <View style={styles.identityRow}>
                  <View style={styles.identity}>
                    <View style={styles.nameWithBadge}>
                      <Text style={styles.name}>{user.name}</Text>
                      {!isOwnProfile && isFriend ? (
                        <View style={styles.friendBadge}>
                          <Ionicons name="people" size={12} color={colors.ink} />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.handle}>{user.handle}</Text>
                  </View>
                  {isOwnProfile ? (
                    <Pressable
                      onPress={openSettings}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.iconBtn,
                        pressed && styles.pressed,
                      ]}
                      accessibilityLabel="Settings"
                    >
                      <Ionicons
                        name="settings-outline"
                        size={22}
                        color={colors.ink}
                      />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.stats}>
                  {isOwnProfile ? (
                    <Pressable
                      onPress={() => setFriendsOpen(true)}
                      style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
                    >
                      <Text style={styles.statNum}>{displayedFriendCount}</Text>
                      <Text style={styles.statLabel}>Friends</Text>
                      {pendingCount > 0 ? (
                        <Text style={styles.statHint}>
                          {pendingCount} pending
                        </Text>
                      ) : null}
                    </Pressable>
                  ) : (
                    <View style={styles.stat}>
                      <Text style={styles.statNum}>{displayedFriendCount}</Text>
                      <Text style={styles.statLabel}>Friends</Text>
                    </View>
                  )}
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{userPosts.length}</Text>
                    <Text style={styles.statLabel}>Memories</Text>
                  </View>
                </View>
              </View>
            </View>
            {user.bio ? (
              <Text style={styles.bio}>{user.bio}</Text>
            ) : isOwnProfile ? (
              <Pressable onPress={openSettings} hitSlop={6}>
                <Text style={styles.bioPlaceholder}>Add a bio in Settings</Text>
              </Pressable>
            ) : null}
            {!isOwnProfile ? (
              <View style={styles.friendAction}>
                {isFriend ? (
                  <View style={styles.friendPill}>
                    <Ionicons name="people" size={14} color={colors.ink} />
                    <Text style={styles.friendPillLabel}>Friends</Text>
                  </View>
                ) : incomingFromUser ? (
                  <Pressable
                    onPress={() => acceptInvite(incomingFromUser.id)}
                    style={({ pressed }) => [
                      styles.friendBtn,
                      styles.friendBtnPrimary,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.friendBtnPrimaryLabel}>Accept request</Text>
                  </Pressable>
                ) : outgoingToUser ? (
                  <View style={[styles.friendBtn, styles.friendBtnMuted]}>
                    <Text style={styles.friendBtnMutedLabel}>Requested</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => sendInvite(userId)}
                    style={({ pressed }) => [
                      styles.friendBtn,
                      styles.friendBtnPrimary,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.friendBtnPrimaryLabel}>Add friend</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
            <Text style={styles.gridLabel}>
              {isOwnProfile ? 'Your memories' : `${user.name.split(' ')[0]}'s memories`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No memories yet</Text>
            <Text style={styles.emptyBody}>
              {isOwnProfile
                ? 'Post a suggested memory and it will live here.'
                : 'When they post a memory, it shows up here.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const opacity = removingIds[item.post.id] ?? 1;
          return (
            <Animated.View
              style={[
                styles.tile,
                typeof opacity === 'number' ? null : { opacity },
              ]}
            >
              <Pressable
                onPress={() => setSelected(item)}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                {item.cover ? (
                  <Image source={{ uri: item.cover.uri }} style={styles.tileImage} />
                ) : (
                  <View style={[styles.tileImage, styles.tileFallback]} />
                )}
                <Text style={styles.tileTitle} numberOfLines={2}>
                  {item.moment.title}
                </Text>
              </Pressable>
              {isOwnProfile ? (
                <Pressable
                  onPress={() => setMenuPostId(item.post.id)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.tileMenuBtn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityLabel="Memory options"
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={16}
                    color={colors.ink}
                  />
                </Pressable>
              ) : null}
            </Animated.View>
          );
        }}
      />

      {isOwnProfile ? (
        <>
          <Modal
            visible={!!menuPostId}
            transparent
            animationType="fade"
            onRequestClose={() => setMenuPostId(null)}
          >
            <Pressable
              style={styles.menuBackdrop}
              onPress={() => setMenuPostId(null)}
            >
              <View style={styles.menuSheet}>
                <Pressable
                  onPress={() => menuPostId && confirmDelete(menuPostId)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.menuItemDanger}>Delete Memory</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMenuPostId(null)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.menuItemLabel}>Cancel</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={friendsOpen}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setFriendsOpen(false)}
          >
            <View style={styles.sheet}>
              <View style={[styles.sheetHeader, styles.sheetPad]}>
                <Text style={styles.sheetTitle}>Friends</Text>
                <Pressable onPress={() => setFriendsOpen(false)}>
                  <Text style={styles.sheetClose}>Done</Text>
                </Pressable>
              </View>

              <View style={styles.searchRow}>
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={16} color={colors.muted} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search username"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    style={styles.searchInput}
                  />
                  {searching ? (
                    <ActivityIndicator size="small" color={colors.muted} />
                  ) : null}
                </View>
              </View>

              <ScrollView
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
              >
                {searchQuery.trim() ? (
                  <View style={styles.sheetSection}>
                    <Text style={styles.sectionLabel}>People</Text>
                    {searching && !hasSearched ? (
                      <Text style={styles.emptyFriends}>Searching…</Text>
                    ) : searchResults.length === 0 ? (
                      <View style={styles.searchEmpty}>
                        <Text style={styles.searchEmptyTitle}>No people found</Text>
                        <Text style={styles.searchEmptyBody}>
                          Try another username — exact matches work best.
                        </Text>
                      </View>
                    ) : (
                      searchResults.map((result) => (
                        <Pressable
                          key={result.id}
                          onPress={() => openUserProfile(result.id)}
                          style={({ pressed }) => [
                            styles.personRow,
                            pressed && styles.pressed,
                          ]}
                        >
                          <PersonAvatar
                            name={result.name ?? result.username}
                            uri={result.avatarUri}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.personName}>
                              {result.name ?? result.username}
                            </Text>
                            <Text style={styles.personMeta}>
                              @{result.username}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.muted}
                          />
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : (
                  <>
                    <Text style={[styles.sheetSub, styles.sheetPadHorizontal]}>
                      Mutual connections. Posted memories are shared with everyone
                      here. Search to find people by username.
                    </Text>

                    {incoming.length > 0 ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sectionLabel}>Requests</Text>
                        {incoming.map((invite) => {
                          const from = usersById[invite.fromUserId];
                          return (
                            <View key={invite.id} style={styles.personRow}>
                              <PersonAvatar
                                name={from?.name ?? '?'}
                                uri={from?.avatarUri}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.personName}>{from?.name}</Text>
                                <Text style={styles.personMeta}>
                                  {from?.handle ?? 'wants to connect'}
                                </Text>
                              </View>
                              <Pressable
                                onPress={() => declineInvite(invite.id)}
                                style={styles.ghostBtn}
                              >
                                <Text style={styles.ghostBtnLabel}>Decline</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => acceptInvite(invite.id)}
                                style={styles.fillBtn}
                              >
                                <Text style={styles.fillBtnLabel}>Accept</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}

                    {outgoing.length > 0 ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sectionLabel}>Sent</Text>
                        {outgoing.map((invite) => {
                          const to = usersById[invite.toUserId];
                          return (
                            <Pressable
                              key={invite.id}
                              onPress={() => openUserProfile(invite.toUserId)}
                              style={({ pressed }) => [
                                styles.personRow,
                                pressed && styles.pressed,
                              ]}
                            >
                              <PersonAvatar
                                name={to?.name ?? '?'}
                                uri={to?.avatarUri}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.personName}>{to?.name}</Text>
                                <Text style={styles.personMeta}>
                                  Waiting for a reply
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    <View style={styles.sheetSection}>
                      <Text style={styles.sectionLabel}>
                        {friends.length ? 'Your friends' : 'Friends'}
                      </Text>
                      {friends.length === 0 ? (
                        <Text style={styles.emptyFriends}>
                          Search for people above, or wait for an invite to land.
                        </Text>
                      ) : (
                        friends.map((friend) => (
                          <Pressable
                            key={friend.id}
                            onPress={() => openUserProfile(friend.id)}
                            style={({ pressed }) => [
                              styles.personRow,
                              pressed && styles.pressed,
                            ]}
                          >
                            <PersonAvatar
                              name={friend.name}
                              uri={friend.avatarUri}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.personName}>{friend.name}</Text>
                              <Text style={styles.personMeta}>{friend.handle}</Text>
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color={colors.muted}
                            />
                          </Pressable>
                        ))
                      )}
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </Modal>
        </>
      ) : null}

      <Modal
        visible={!!selected}
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.viewer}>
          <View style={styles.viewerBar}>
            <Text style={styles.viewerTitle}>Memory</Text>
            <Pressable onPress={() => setSelected(null)}>
              <Text style={styles.sheetClose}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {selected ? (
              <MemoryCard
                post={selected.post}
                moment={selected.moment}
                photos={selected.photos}
                onCommentPress={openMemoryFocus}
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: 40 },
  headerBlock: { paddingHorizontal: PAD, paddingTop: 8, paddingBottom: 16 },
  topRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  avatarWrap: {
    width: 80,
    height: 80,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarText: { fontSize: 28, fontWeight: '600', color: colors.ink },
  headerMain: { flex: 1, gap: 12, justifyContent: 'center' },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  identity: { flex: 1, gap: 2 },
  nameWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  name: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  friendBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    fontSize: 14,
    lineHeight: 18,
    color: colors.muted,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginRight: -6,
  },
  stats: { flexDirection: 'row', gap: 24 },
  stat: { alignItems: 'flex-start' },
  statNum: { fontSize: 18, fontWeight: '600', color: colors.ink },
  statLabel: { fontSize: 13, color: colors.muted, marginTop: 1 },
  statHint: { fontSize: 12, color: colors.ink, marginTop: 4, fontWeight: '500' },
  bio: { marginTop: 16, fontSize: 14, color: colors.ink, lineHeight: 20 },
  bioPlaceholder: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  friendAction: { marginTop: 16 },
  friendBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  friendBtnPrimary: { backgroundColor: colors.ink },
  friendBtnPrimaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.surface,
  },
  friendBtnMuted: { backgroundColor: colors.chipBg },
  friendBtnMutedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  friendPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.chipBg,
  },
  friendPillLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  gridLabel: {
    marginTop: 24,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  row: { paddingHorizontal: PAD, gap: GAP, marginBottom: GAP },
  tile: {
    width: TILE,
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#1C1C1A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  tileImage: { width: '100%', height: TILE * 1.15, backgroundColor: colors.chipBg },
  tileFallback: { backgroundColor: colors.accentSoft },
  tileTitle: {
    padding: 12,
    paddingRight: 36,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 18,
  },
  tileMenuBtn: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28,28,26,0.28)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 24,
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  menuItemDanger: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.like,
  },
  menuItemLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  empty: { paddingHorizontal: PAD, paddingTop: 8, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  pressed: { opacity: 0.75 },
  sheet: { flex: 1, backgroundColor: colors.bg },
  sheetPad: { paddingHorizontal: 24, paddingTop: 16 },
  sheetPadHorizontal: { paddingHorizontal: 24 },
  sheetContent: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 22, fontWeight: '600', color: colors.ink },
  sheetClose: { fontSize: 16, fontWeight: '600', color: colors.ink },
  sheetSub: { fontSize: 14, color: colors.muted, marginBottom: 16, lineHeight: 20 },
  searchRow: {
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.chipBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  searchEmpty: { paddingVertical: 28, gap: 6 },
  searchEmptyTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  searchEmptyBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  sheetSection: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  emptyFriends: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    paddingVertical: 12,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.chipBg,
  },
  personAvatarText: { fontWeight: '600', color: colors.ink, fontSize: 16 },
  personName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  personMeta: { fontSize: 13, color: colors.muted, marginTop: 1 },
  ghostBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.chipBg,
  },
  ghostBtnLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  fillBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  fillBtnLabel: { fontSize: 13, fontWeight: '600', color: colors.surface },
  viewer: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
  viewerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  viewerTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
});
