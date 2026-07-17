import { useMemo, useState } from 'react';
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
import { mockUsers } from '../../data/mockData';
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

  const directory = useMemo(
    () =>
      Object.values(mockUsers)
        .filter((u) => u.id !== 'me')
        .map((u) => ({
          id: u.id,
          name: u.name,
          handle: u.handle,
          tokens: `${u.name} ${u.handle}`.toLowerCase(),
        })),
    [],
  );

  const importContacts = async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setImported(true);
        setFoundUsers([]);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        pageSize: 200,
      });

      const tokens = new Set<string>();
      for (const contact of data) {
        if (contact.name) tokens.add(contact.name.toLowerCase());
        for (const email of contact.emails ?? []) {
          if (email.email) tokens.add(email.email.toLowerCase());
        }
      }

      const matches = directory.filter((person) => {
        const first = person.name.split(' ')[0]?.toLowerCase() ?? '';
        return [...tokens].some(
          (t) =>
            t.includes(first) ||
            person.tokens.includes(t) ||
            t.includes(person.handle.replace('@', '')),
        );
      });

      // Deduplicate and fall back to a couple suggestions so the UI is demonstrable
      const unique = matches.length
        ? matches
        : directory.slice(0, 2).map(({ id, name, handle }) => ({ id, name, handle }));

      setFoundUsers(unique.map(({ id, name, handle }) => ({ id, name, handle })));
      setImported(true);
    } catch {
      setImported(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendInvites = async () => {
    if (selected.size === 0) {
      setSelectHint('Select at least one person');
      return;
    }
    setSelectHint(null);
    setSending(true);
    await new Promise((r) => setTimeout(r, 700));
    setSending(false);
    onContinue();
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(INVITE_URL);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1800);
  };

  const shareInvite = async () => {
    try {
      await Share.share({
        message: `Join me on RollCall — your camera roll, beautifully organized. ${INVITE_URL}`,
      });
    } catch {
      // user dismissed
    }
  };

  return (
    <AuthScreen
      title="Life is better with friends."
      subtitle="Invite people who already share your moments — or skip and do it later."
      footer={
        imported && foundUsers.length > 0 ? (
          <>
            <PrimaryButton
              label={selected.size ? `Send invites (${selected.size})` : 'Send invitations'}
              onPress={sendInvites}
              loading={sending}
              disabled={sending || selected.size === 0}
            />
            <PrimaryButton label="Skip for now" onPress={onContinue} variant="ghost" />
          </>
        ) : imported ? (
          <>
            <PrimaryButton label="Invite via Text" onPress={shareInvite} />
            <PrimaryButton
              label={linkCopied ? 'Link copied' : 'Copy Invite Link'}
              onPress={copyLink}
              variant="secondary"
            />
            <PrimaryButton label="Share" onPress={shareInvite} variant="secondary" />
            <PrimaryButton label="Skip for now" onPress={onContinue} variant="ghost" />
          </>
        ) : (
          <>
            <PrimaryButton
              label="Import Contacts"
              onPress={importContacts}
              loading={loading}
              disabled={loading}
            />
            <PrimaryButton label="Skip for now" onPress={onContinue} variant="ghost" />
          </>
        )
      }
    >
      {imported && foundUsers.length > 0 ? (
        <>
          <FlatList
            data={foundUsers}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const on = selected.has(item.id);
              return (
                <Pressable
                  onPress={() => {
                    setSelectHint(null);
                    toggle(item.id);
                  }}
                  style={[styles.row, on && styles.rowOn]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.name.slice(0, 1)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.handle}>{item.handle}</Text>
                  </View>
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? colors.ink : colors.line}
                  />
                </Pressable>
              );
            }}
          />
          {selectHint ? <Text style={styles.hint}>{selectHint}</Text> : null}
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Find friends already here</Text>
          <Text style={styles.cardBody}>
            We’ll only look for people who already use RollCall. Nothing is shared without
            you sending an invite.
          </Text>
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  cardBody: { fontSize: 15, lineHeight: 22, color: colors.muted },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
  },
  rowOn: { backgroundColor: colors.accentSoft },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontWeight: '700', color: colors.ink },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  handle: { fontSize: 13, color: colors.muted, marginTop: 1 },
  hint: { marginTop: 8, fontSize: 13, color: colors.muted },
});
