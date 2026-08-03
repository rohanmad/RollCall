import { StyleSheet, Text, View } from 'react-native';
import {
  PASSWORD_REQUIREMENTS,
  type PasswordRequirement,
} from '../lib/validation';
import { colors } from '../theme/colors';

type Props = {
  value: string;
  /** When true, unmet rules use the error color instead of muted. */
  showFailures?: boolean;
};

export function PasswordRequirements({ value, showFailures = false }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      {PASSWORD_REQUIREMENTS.map((req) => (
        <RequirementRow
          key={req.id}
          requirement={req}
          met={req.test(value)}
          showFailures={showFailures && value.length > 0}
        />
      ))}
    </View>
  );
}

function RequirementRow({
  requirement,
  met,
  showFailures,
}: {
  requirement: PasswordRequirement;
  met: boolean;
  showFailures: boolean;
}) {
  const tone = met ? 'met' : showFailures ? 'fail' : 'idle';
  return (
    <Text
      style={[
        styles.row,
        tone === 'met' && styles.met,
        tone === 'fail' && styles.fail,
        tone === 'idle' && styles.idle,
      ]}
    >
      {met ? '✓' : '•'} {requirement.label}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: -4 },
  row: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  idle: { color: colors.muted },
  met: { color: '#1F4D3A' },
  fail: { color: colors.like },
});
