import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuth } from '../../state/AuthState';
import { colors } from '../../theme/colors';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.kicker}>Account</Text>

        <View style={styles.group}>
          <Pressable
            onPress={() => navigation.navigate('ChangeUsername')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>Username</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>@{user?.username}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => navigation.navigate('ChangeBio')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>Bio</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue} numberOfLines={1}>
                {user?.bio?.trim() ? user.bio : 'Add a bio'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => navigation.navigate('ChangePassword')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>Password</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.logout}>
          <PrimaryButton
            label="Log Out"
            variant="secondary"
            loading={signingOut}
            disabled={signingOut}
            onPress={async () => {
              setSigningOut(true);
              try {
                await signOut();
              } catch {
                setSigningOut(false);
              }
            }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 10,
    marginLeft: 4,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
  },
  rowLabel: { fontSize: 16, fontWeight: '500', color: colors.ink },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 15, color: colors.muted, maxWidth: 160 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: 16,
  },
  logout: { marginTop: 'auto', paddingBottom: 12 },
  pressed: { opacity: 0.7 },
});
