import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { colors } from '../theme/colors';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string | null;
  hintTone?: 'ok' | 'bad' | 'muted';
};

export const FormField = forwardRef<TextInput, Props>(function FormField(
  { label, error, hint, hintTone = 'muted', style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? (
        <Text
          style={[
            styles.hint,
            hintTone === 'ok' && styles.hintOk,
            hintTone === 'bad' && styles.hintBad,
          ]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.like },
  error: { fontSize: 13, color: colors.like, fontWeight: '500' },
  hint: { fontSize: 13, color: colors.muted },
  hintOk: { color: '#1F4D3A', fontWeight: '600' },
  hintBad: { color: colors.like, fontWeight: '600' },
});
