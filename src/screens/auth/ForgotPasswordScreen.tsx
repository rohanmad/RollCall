import { useEffect, useRef, useState } from 'react';
import { TextInput, StyleSheet, Text, View } from 'react-native';
import { AuthScreen } from '../../components/AuthScreen';
import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { validateEmail, validateEmailFormat } from '../../lib/validation';
import { useAuth } from '../../state/AuthState';
import { colors } from '../../theme/colors';

type Props = {
  onBack: () => void;
};

export function ForgotPasswordScreen({ onBack }: Props) {
  const { requestPasswordReset } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const onSubmit = async () => {
    const err = validateEmail(email);
    setError(err);
    if (err) return;

    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSent(true);
  };

  return (
    <AuthScreen
      title="Reset password"
      subtitle={
        sent
          ? 'If an account exists for that email, you’ll get reset instructions shortly.'
          : 'Enter your email and we’ll help you get back in.'
      }
      footer={
        <>
          {!sent ? (
            <PrimaryButton
              label="Send reset link"
              onPress={onSubmit}
              loading={loading}
              disabled={loading}
            />
          ) : null}
          <PrimaryButton label="Back to Sign In" onPress={onBack} variant="ghost" />
        </>
      }
    >
      {!sent ? (
        <FormField
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setError(validateEmailFormat(v));
          }}
          onBlur={() => {
            if (email.trim()) setError(validateEmail(email));
          }}
          error={error}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
      ) : (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            You can close this screen and return to sign in.
          </Text>
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  note: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  noteText: { fontSize: 15, lineHeight: 22, color: colors.muted },
});
