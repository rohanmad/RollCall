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
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  passwordsMatch,
  validatePassword,
  validatePasswordPresent,
} from '../../lib/validation';
import { useAuth } from '../../state/AuthState';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;

export function ChangePasswordScreen({ navigation }: Props) {
  const { changePassword } = useAuth();
  const currentRef = useRef<TextInput>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => currentRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const onSave = async () => {
    setAttempted(true);
    const cErr = validatePasswordPresent(currentPassword);
    const nErr = validatePassword(newPassword);
    const mErr = passwordsMatch(newPassword, confirmPassword);
    setCurrentError(cErr);
    setNewError(nErr);
    setConfirmError(mErr);
    if (cErr || nErr || mErr) return;

    setLoading(true);
    const result = await changePassword({ currentPassword, newPassword });
    setLoading(false);

    if (!result.ok) {
      if (result.error.toLowerCase().includes('current')) {
        setCurrentError(result.error);
      } else {
        setNewError(result.error);
      }
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
          <View style={styles.fields}>
            <FormField
              ref={currentRef}
              label="Current Password"
              value={currentPassword}
              onChangeText={(v) => {
                setCurrentPassword(v);
                setCurrentError(null);
              }}
              error={currentError}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              returnKeyType="next"
            />
            <View style={styles.passwordBlock}>
              <FormField
                label="New Password"
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  setNewError(
                    attempted && v.length > 0 ? validatePassword(v) : null,
                  );
                  setConfirmError(null);
                }}
                error={newError}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="password-new"
                returnKeyType="next"
              />
              <PasswordRequirements
                value={newPassword}
                showFailures={attempted || newPassword.length > 0}
              />
            </View>
            <FormField
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                setConfirmError(
                  v.length > 0 ? passwordsMatch(newPassword, v) : null,
                );
              }}
              error={confirmError}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="password-new"
              returnKeyType="done"
              onSubmitEditing={onSave}
            />
          </View>
          <View style={styles.footer}>
            <PrimaryButton
              label="Save"
              onPress={onSave}
              disabled={loading}
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
  fields: { gap: 16 },
  passwordBlock: { gap: 8 },
  footer: { marginTop: 'auto', paddingTop: 28 },
});
