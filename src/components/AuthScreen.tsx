import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FadeIn } from './FadeIn';
import { colors } from '../theme/colors';

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  /** When false, caller owns entrance motion (e.g. Welcome). */
  animate?: boolean;
};

function StaticBlock({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}) {
  return <View style={style}>{children}</View>;
}

export function AuthScreen({
  children,
  title,
  subtitle,
  footer,
  animate = true,
}: Props) {
  const Wrap = animate ? FadeIn : StaticBlock;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {title ? (
            <Wrap delay={40}>
              <Text style={styles.title}>{title}</Text>
            </Wrap>
          ) : null}
          {subtitle ? (
            <Wrap delay={140}>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </Wrap>
          ) : null}
          <Wrap delay={240} style={styles.body}>
            {children}
          </Wrap>
          {footer ? (
            <Wrap delay={360} style={styles.footer}>
              {footer}
            </Wrap>
          ) : null}
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
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  body: { marginTop: 32, gap: 16 },
  footer: { marginTop: 'auto', paddingTop: 28, gap: 12 },
});
