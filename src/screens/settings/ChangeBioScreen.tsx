import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  BIO_MAX_LENGTH,
  normalizeBio,
  validateBio,
} from '../../lib/validation';
import { useAuth } from '../../state/AuthState';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangeBio'>;

export function ChangeBioScreen({ navigation }: Props) {
  const { user, updateBio } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [bio, setBio] = useState(user?.bio ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const unchanged = normalizeBio(bio) === (user?.bio ?? '');
  const canSave = !validateBio(bio) && !loading && !unchanged;

  const onSave = async () => {
    const err = validateBio(bio);
    setError(err);
    if (err || !canSave) return;

    setLoading(true);
    const result = await updateBio(bio);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
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
          <Text style={styles.label}>Bio</Text>
          <TextInput
            ref={inputRef}
            value={bio}
            onChangeText={(v) => {
              setBio(v);
              setError(null);
            }}
            placeholder="A short line about you"
            placeholderTextColor={colors.muted}
            style={[styles.input, error ? styles.inputError : null]}
            multiline
            maxLength={BIO_MAX_LENGTH}
            textAlignVertical="top"
          />
          <View style={styles.metaRow}>
            {error ? <Text style={styles.error}>{error}</Text> : <View />}
            <Text style={styles.counter}>
              {bio.trim().length}/{BIO_MAX_LENGTH}
            </Text>
          </View>

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
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  input: {
    minHeight: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  inputError: { borderColor: colors.like },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  error: { fontSize: 13, color: colors.like, fontWeight: '500', flex: 1 },
  counter: { fontSize: 13, color: colors.muted },
  footer: { marginTop: 'auto', paddingTop: 28 },
});
