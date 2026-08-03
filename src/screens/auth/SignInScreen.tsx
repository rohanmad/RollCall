import { useEffect, useRef, useState } from 'react';
import { TextInput, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthScreen } from '../../components/AuthScreen';
import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  validateEmail,
  validateEmailFormat,
  validatePasswordPresent,
} from '../../lib/validation';
import { useAuth } from '../../state/AuthState';
import { colors } from '../../theme/colors';

type Props = {
  onSuccess: () => void;
  onForgotPassword: () => void;
  onBackToWelcome: () => void;
};

export function SignInScreen({
  onSuccess,
  onForgotPassword,
  onBackToWelcome,
}: Props) {
  const { signIn } = useAuth();
  const emailRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const onSubmit = async () => {
    const eErr = validateEmail(email);
    const pErr = validatePasswordPresent(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;

    setLoading(true);
    const result = await signIn({ email, password });
    setLoading(false);

    if (!result.ok) {
      setPasswordError(result.error);
      return;
    }

    onSuccess();
  };

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to continue your timeline."
      footer={
        <>
          <PrimaryButton
            label="Sign In"
            onPress={onSubmit}
            loading={loading}
            disabled={loading}
          />
          <PrimaryButton
            label="Back"
            onPress={onBackToWelcome}
            variant="ghost"
          />
        </>
      }
    >
      <View style={styles.fields}>
        <FormField
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setEmailError(validateEmailFormat(v));
          }}
          onBlur={() => {
            if (email.trim()) setEmailError(validateEmail(email));
          }}
          error={emailError}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
        />
        <FormField
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setPasswordError(null);
          }}
          error={passwordError}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        <Pressable onPress={onForgotPassword} hitSlop={8}>
          <Text style={styles.forgot}>Forgot Password</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 16 },
  forgot: {
    alignSelf: 'flex-start',
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
});
