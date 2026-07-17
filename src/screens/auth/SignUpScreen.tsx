import { useEffect, useRef, useState } from 'react';
import { TextInput, StyleSheet, View } from 'react-native';
import { AuthScreen } from '../../components/AuthScreen';
import { FormField } from '../../components/FormField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useToast } from '../../components/Toast';
import {
  normalizeUsername,
  validateEmail,
  validatePassword,
  validateUsernameFormat,
} from '../../lib/validation';
import { useAuth } from '../../state/AuthState';

type Props = {
  onSuccess: () => void;
  onBackToSignIn: () => void;
};

export function SignUpScreen({ onSuccess, onBackToSignIn }: Props) {
  const { signUp, checkUsernameAvailable } = useAuth();
  const { showToast } = useToast();
  const emailRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameHint, setUsernameHint] = useState<string | null>(null);
  const [usernameOk, setUsernameOk] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  // Debounced username availability
  useEffect(() => {
    const normalized = normalizeUsername(username);
    const formatErr = validateUsernameFormat(normalized);
    setUsernameError(formatErr);
    setUsernameOk(false);
    setUsernameHint(null);

    if (formatErr || !normalized) return;

    let cancelled = false;
    setCheckingUsername(true);
    const timer = setTimeout(async () => {
      const available = await checkUsernameAvailable(normalized);
      if (cancelled) return;
      setCheckingUsername(false);
      if (available) {
        setUsernameHint('✓ Username available');
        setUsernameOk(true);
        setUsernameError(null);
      } else {
        setUsernameHint('Username already taken');
        setUsernameOk(false);
        setUsernameError('Username already taken');
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, checkUsernameAvailable]);

  const canContinue =
    !validateEmail(email) &&
    !validatePassword(password) &&
    !validateUsernameFormat(username) &&
    usernameOk &&
    !checkingUsername &&
    !loading;

  const onContinue = async () => {
    setEmailError(validateEmail(email));
    setPasswordError(validatePassword(password));
    setUsernameError(validateUsernameFormat(username));
    if (!canContinue) return;

    setLoading(true);
    const result = await signUp({ email, password, username });
    setLoading(false);

    if (!result.ok) {
      if (result.error.toLowerCase().includes('username')) {
        setUsernameError(result.error);
        setUsernameOk(false);
      } else if (result.error.toLowerCase().includes('email')) {
        setEmailError(result.error);
      } else {
        showToast(result.error, 'error');
      }
      return;
    }

    onSuccess();
  };

  return (
    <AuthScreen
      title="Create account"
      subtitle="A few details, then we’ll build your timeline."
      footer={
        <>
          <PrimaryButton
            label="Continue"
            onPress={onContinue}
            disabled={!canContinue}
            loading={loading}
          />
          <PrimaryButton
            label="Already have an account? Sign In"
            onPress={onBackToSignIn}
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
            setEmailError(null);
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
          textContentType="newPassword"
          autoComplete="password-new"
          returnKeyType="next"
        />
        <FormField
          label="Username"
          value={username}
          onChangeText={(v) => setUsername(normalizeUsername(v))}
          error={usernameError}
          hint={
            checkingUsername
              ? 'Checking availability…'
              : usernameHint
          }
          hintTone={
            checkingUsername ? 'muted' : usernameOk ? 'ok' : usernameHint ? 'bad' : 'muted'
          }
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
          returnKeyType="done"
          onSubmitEditing={onContinue}
        />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 16 },
});
