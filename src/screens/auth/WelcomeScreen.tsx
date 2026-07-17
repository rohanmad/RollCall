import { StyleSheet, Text, View } from 'react-native';
import { AuthScreen } from '../../components/AuthScreen';
import { FadeIn } from '../../components/FadeIn';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors } from '../../theme/colors';

type Props = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export function WelcomeScreen({ onGetStarted, onSignIn }: Props) {
  return (
    <AuthScreen
      animate={false}
      footer={
        <FadeIn delay={420}>
          <View style={styles.footer}>
            <PrimaryButton label="Get Started" onPress={onGetStarted} />
            <PrimaryButton
              label="Already have an account? Sign In"
              onPress={onSignIn}
              variant="ghost"
            />
          </View>
        </FadeIn>
      }
    >
      <View style={styles.hero}>
        <FadeIn delay={60}>
          <Text style={styles.brand}>RollCall</Text>
        </FadeIn>
        <FadeIn delay={180}>
          <Text style={styles.title}>
            Your camera roll already tells your story.
          </Text>
        </FadeIn>
        <FadeIn delay={320}>
          <Text style={styles.subtitle}>
            We turn your favorite moments into beautiful memories you can share with
            the people who matter most.
          </Text>
        </FadeIn>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 16, paddingTop: 48 },
  footer: { gap: 12 },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    fontSize: 36,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -1,
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.muted,
  },
});
