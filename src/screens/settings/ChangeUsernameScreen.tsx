import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  normalizeUsername,
  validateUsernameFormat,
} from '../../lib/validation';
import { useAuth } from '../../state/AuthState';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangeUsername'>;

export function ChangeUsernameScreen({ navigation }: Props) {
  const { user, checkUsernameAvailable, updateUsername } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [username, setUsername] = useState(user?.username ?? '');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const normalized = normalizeUsername(username);
    const formatErr = validateUsernameFormat(normalized);
    setError(formatErr);
    setAvailable(false);
    setHint(null);

    if (formatErr || !normalized) return;
    if (normalized === user?.username) {
      setAvailable(true);
      setHint(null);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      const ok = await checkUsernameAvailable(normalized);
      if (cancelled) return;
      setChecking(false);
      if (ok) {
        setHint('✓ Username available');
        setAvailable(true);
        setError(null);
      } else {
        setHint('Username already taken');
        setAvailable(false);
        setError('Username already taken');
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, user?.username, checkUsernameAvailable]);

  const unchanged = normalizeUsername(username) === user?.username;
  const canSave =
    !validateUsernameFormat(username) &&
    available &&
    !checking &&
    !loading &&
    !unchanged;

  const onSave = async () => {
    if (!canSave) return;
    setLoading(true);
    const result = await updateUsername(username);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setAvailable(false);
      return;
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormField
            ref={inputRef}
            label="Username"
            value={username}
            onChangeText={(v) => setUsername(normalizeUsername(v))}
            error={error}
            hint={
              checking ? 'Checking availability…' : unchanged ? null : hint
            }
            hintTone={
              checking ? 'muted' : available ? 'ok' : hint ? 'bad' : 'muted'
            }
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
            autoComplete="username"
            returnKeyType="done"
            onSubmitEditing={onSave}
          />
          <View style={styles.footer}>
            <PrimaryButton
              label="Save"
              onPress={onSave}
              disabled={!canSave}
              loading={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  footer: { marginTop: 'auto', paddingTop: 28 },
});
