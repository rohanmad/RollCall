import { useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppState } from '../state/AppState';
import { colors } from '../theme/colors';
import type { Moment, PhotoAsset } from '../types/moment';

const CARD_WIDTH = Dimensions.get('window').width - 40;
const COVER_HEIGHT = Math.round(CARD_WIDTH * 1.15);
const THUMB = 72;

export type DraftEdits = {
  title: string;
  locationLabel: string;
  photoIds: string[];
};

function EditableDraftCard({
  moment,
  photos,
  friendCount,
  onPost,
  onDismiss,
}: {
  moment: Moment;
  photos: PhotoAsset[];
  friendCount: number;
  onPost: (edits: DraftEdits) => void;
  onDismiss: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [title, setTitle] = useState(moment.title);
  const [locationLabel, setLocationLabel] = useState(moment.locationLabel ?? '');
  const [selectedIds, setSelectedIds] = useState(moment.photoIds);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setTitle(moment.title);
    setLocationLabel(moment.locationLabel ?? '');
    setSelectedIds(moment.photoIds);
    setPhotoIndex(0);
    setEditing(false);
  }, [moment.id, moment.title, moment.locationLabel, moment.photoIds]);

  const selectedPhotos = photos.filter((p) => selectedIds.includes(p.id));

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH));
  };

  const removePhoto = (photoId: string) => {
    if (selectedIds.length <= 1) return;
    setSelectedIds((prev) => {
      const next = prev.filter((id) => id !== photoId);
      setPhotoIndex((i) => Math.min(i, next.length - 1));
      return next;
    });
  };

  const canPost = title.trim().length > 0 && selectedIds.length > 0;

  return (
    <View style={styles.card}>
      <View>
        <FlatList
          data={selectedPhotos}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => (
            <Image source={{ uri: item.uri }} style={styles.cover} />
          )}
        />
        {selectedPhotos.length > 1 ? (
          <View style={styles.photoCount}>
            <Text style={styles.photoCountText}>
              {photoIndex + 1}/{selectedPhotos.length}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>Suggested memory</Text>
          <Pressable
            onPress={() => setEditing((v) => !v)}
            style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Ionicons
              name={editing ? 'checkmark' : 'create-outline'}
              size={15}
              color={colors.ink}
            />
            <Text style={styles.editLabel}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>

        {editing ? (
          <>
            <Text style={styles.fieldLabel}>Photos</Text>
            <Text style={styles.photoHint}>
              Tap × to remove a photo from this memory
              {selectedIds.length <= 1 ? ' · keep at least one' : ''}
            </Text>
            <FlatList
              data={selectedPhotos}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
              renderItem={({ item }) => (
                <View style={styles.thumbWrap}>
                  <Image source={{ uri: item.uri }} style={styles.thumb} />
                  {selectedIds.length > 1 ? (
                    <Pressable
                      onPress={() => removePhoto(item.id)}
                      style={styles.removeBtn}
                      hitSlop={6}
                      accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="close" size={14} color={colors.surface} />
                    </Pressable>
                  ) : null}
                </View>
              )}
            />

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={styles.titleInput}
              placeholder="Memory title"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              value={locationLabel}
              onChangeText={setLocationLabel}
              style={styles.locationInput}
              placeholder="Where this happened"
              placeholderTextColor={colors.muted}
            />
          </>
        ) : (
          <>
            <Text style={styles.title}>{title || 'Untitled memory'}</Text>
            {locationLabel ? (
              <Text style={styles.locationText}>{locationLabel}</Text>
            ) : null}
          </>
        )}

        <Text style={styles.meta}>
          {selectedIds.length} photo{selectedIds.length === 1 ? '' : 's'} · posts to{' '}
          {friendCount} friend{friendCount === 1 ? '' : 's'}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryLabel}>Not now</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              onPost({
                title: title.trim(),
                locationLabel: locationLabel.trim(),
                photoIds: selectedIds,
              })
            }
            disabled={!canPost}
            style={({ pressed }) => [
              styles.primaryBtn,
              !canPost && styles.primaryDisabled,
              pressed && canPost && styles.pressed,
            ]}
          >
            <Text style={styles.primaryLabel}>Post memory</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function MomentsScreen() {
  const {
    moments,
    photosById,
    connections,
    keepMoment,
    dismissMoment,
    newMemoryCount,
    clearNewMemoryBadge,
    memoryScanning,
    scanMemories,
  } = useAppState();
  const drafts = moments.filter((m) => m.status === 'draft');
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    if (drafts.length === 0 && reviewOpen) {
      setReviewOpen(false);
    }
  }, [drafts.length, reviewOpen]);

  const onScan = async () => {
    setScanStatus(null);
    const result = await scanMemories({
      requestPermission: true,
      forceFullScan: true,
    });
    if (result?.statusMessage) {
      setScanStatus(result.statusMessage);
    }
  };

  const openReview = () => {
    clearNewMemoryBadge();
    setReviewOpen(true);
  };

  const closeReview = () => {
    setReviewOpen(false);
  };

  const readyCount = newMemoryCount > 0 ? newMemoryCount : drafts.length;
  const showReadyBanner = drafts.length > 0;

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Create Memories</Text>
      <Text style={styles.sub}>
        Camera-roll events, grouped automatically. We’ll let you know when a
        memory is ready to review.
      </Text>

      {showReadyBanner ? (
        <Pressable
          onPress={openReview}
          style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
        >
          <Text style={styles.bannerTitle}>
            {readyCount} new memor{readyCount === 1 ? 'y' : 'ies'} ready
          </Text>
          <Text style={styles.bannerBody}>
            Tap to review, edit, and post — nothing shares until you choose.
          </Text>
        </Pressable>
      ) : null}

      {scanStatus ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{scanStatus}</Text>
        </View>
      ) : null}

      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>
          {memoryScanning
            ? 'Looking for moments…'
            : showReadyBanner
              ? 'Memories waiting'
              : 'You’re caught up'}
        </Text>
        <Text style={styles.emptyBody}>
          {memoryScanning
            ? 'Scanning recent photos from your camera roll.'
            : showReadyBanner
              ? 'Open the card above to review your suggested memories.'
              : 'Need at least 3 photos taken within a few hours. Then tap scan.'}
        </Text>
        {!memoryScanning ? (
          <Pressable
            onPress={() => void onScan()}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
          >
            <Text style={styles.refreshLabel}>
              {showReadyBanner ? 'Scan again' : 'Scan camera roll'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={reviewOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeReview}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Review memory</Text>
            <Pressable
              onPress={closeReview}
              hitSlop={10}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
            >
              <Text style={styles.modalCloseLabel}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.modalSub}>
            Edit the title, remove photos you don’t want, then post.
          </Text>
          <FlatList
            data={drafts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const photos = item.photoIds
                .map((id) => photosById[id])
                .filter(Boolean) as PhotoAsset[];
              return (
                <EditableDraftCard
                  moment={item}
                  photos={photos}
                  friendCount={connections.length}
                  onPost={(edits) => keepMoment(item.id, edits)}
                  onDismiss={() => dismissMoment(item.id)}
                />
              );
            }}
            ListEmptyComponent={
              <View style={styles.modalEmpty}>
                <Text style={styles.emptyTitle}>All done</Text>
                <Text style={styles.emptyBody}>
                  You’ve reviewed every suggested memory.
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: 8 },
  heading: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.8,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  sub: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    paddingHorizontal: 24,
    marginTop: 6,
    marginBottom: 16,
  },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 24 },
  card: {
    width: CARD_WIDTH,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 28,
    overflow: 'hidden',
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
  body: { padding: 20, gap: 6 },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.chipBg,
  },
  editLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  locationText: { fontSize: 15, color: colors.muted, marginTop: 2 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginTop: 10,
  },
  photoHint: { fontSize: 13, color: colors.muted, marginBottom: 8 },
  thumbRow: { gap: 10, paddingVertical: 4 },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 12,
    backgroundColor: colors.chipBg,
  },
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.3,
    paddingVertical: 6,
  },
  locationInput: {
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 6,
  },
  meta: { fontSize: 13, color: colors.muted, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.4 },
  primaryLabel: { color: colors.surface, fontWeight: '600', fontSize: 15 },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.chipBg,
  },
  secondaryLabel: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.8 },
  empty: {
    marginHorizontal: 24,
    marginTop: 12,
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.surface,
    gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  banner: {
    marginHorizontal: 24,
    marginBottom: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    gap: 4,
  },
  bannerTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  bannerBody: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  statusBox: {
    marginHorizontal: 24,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  statusText: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  refreshBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.chipBg,
  },
  scanAgain: {
    alignSelf: 'flex-start',
    marginHorizontal: 24,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.chipBg,
  },
  refreshLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  modalSafe: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  modalClose: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.chipBg,
  },
  modalCloseLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  modalSub: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  modalEmpty: {
    marginHorizontal: 24,
    marginTop: 24,
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.surface,
    gap: 8,
  },
});
