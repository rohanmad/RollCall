import { useState } from 'react';
import {
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { AuthScreen } from '../../components/AuthScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors } from '../../theme/colors';

type Props = {
  onContinue: () => void;
};

type FoundUser = {
  id: string;
  name: string;
  handle: string;
};

const INVITE_URL =
  process.env.EXPO_PUBLIC_INVITE_URL?.trim() || 'https://rollcall.app/invite';

export function InviteFriendsScreen({ onContinue }: Props) {
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);
  const [foundUsers, setFoundUsers] = useState<FoundUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [selectHint, setSelectHint] = useState<string | null>(null);

  const importContacts = async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setImported(true);
        setFoundUsers([]);
        return;
      }

      // Contact matching against real users lands with the friends backend.
      // For now, importing succeeds with an empty match list + share link.
      await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Name,
        ],
        pageSize: 200,
      });

      setFoundUsers([]);
      setImported(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelectHint(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendInvites = async () => {
    if (selected.size === 0) {
      setSelectHint('Select at least one person, or share your link below.');
      return;
    }
    setSending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    setSelected(new Set());
    setSelectHint(null);
    onContinue();
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(INVITE_URL);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const shareLink = async () => {
    await Share.share({
      message: `Join me on RollCall — ${INVITE_URL}`,
      url: INVITE_URL,
    });
  };

  const selectedCount = selected.size;
  const emptyAfterImport = imported && foundUsers.length === 0;

  return (
    <AuthScreen
      title="Invite friends"
      subtitle="Memories are better together. Find people you know, or share your link."
      footer={
        <>
          {imported && foundUsers.length > 0 ? (
            <PrimaryButton
              label={
                selectedCount
                  ? `Send ${selectedCount} invite${selectedCount === 1 ? '' : 's'}`
                  : 'Send invites'
              }
              onPress={sendInvites}
              loading={sending}
            />
          ) : null}
          <PrimaryButton
            label="Continue"
            onPress={onContinue}
            variant={imported ? 'primary' : 'ghost'}
          />
        </>
      }
    >
      <View style={styles.body}>
        {!imported ? (
          <PrimaryButton
            label="Find friends from contacts"
            onPress={importContacts}
            loading={loading}
          />
        ) : emptyAfterImport ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptyBody}>
              None of your contacts are on RollCall yet. Share your invite link
              so they can join.
            </Text>
          </View>
        ) : (
          <FlatList
            data={foundUsers}
            keyExtractor={(u) => u.id}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => {
              const on = selected.has(item.id);
              return (
                <Pressable
                  onPress={() => toggle(item.id)}
                  style={[styles.row, on && styles.rowOn]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.handle}>{item.handle}</Text>
                  </View>
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? colors.ink : colors.muted}
                  />
                </Pressable>
              );
            }}
          />
        )}

        {selectHint ? <Text style={styles.hint}>{selectHint}</Text> : null}

        <View style={styles.linkCard}>
          <Text style={styles.linkLabel}>Your invite link</Text>
          <Text style={styles.linkUrl} numberOfLines={1}>
            {INVITE_URL}
          </Text>
          <View style={styles.linkActions}>
            <Pressable onPress={copyLink} style={styles.linkBtn}>
              <Ionicons name="copy-outline" size={18} color={colors.ink} />
              <Text style={styles.linkBtnText}>
                {linkCopied ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
            <Pressable onPress={shareLink} style={styles.linkBtn}>
              <Ionicons name="share-outline" size={18} color={colors.ink} />
              <Text style={styles.linkBtnText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  rowOn: { opacity: 1 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  meta: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink },
  handle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  hint: { fontSize: 13, color: colors.like, fontWeight: '500' },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  emptyBody: { fontSize: 14, lineHeight: 20, color: colors.muted },
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  linkLabel: { fontSize: 13, fontWeight: '600', color: colors.muted },
  linkUrl: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  linkActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkBtnText: { fontSize: 14, fontWeight: '600', color: colors.ink },
});
