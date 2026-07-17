import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { AuthScreen } from '../../components/AuthScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors } from '../../theme/colors';

type Props = {
  onContinue: () => void;
};

export function PhotoPermissionScreen({ onContinue }: Props) {
  const [loading, setLoading] = useState(false);

  const requestPhotos = async () => {
    setLoading(true);
    try {
      await MediaLibrary.requestPermissionsAsync();
    } catch {
      // Never block — continue either way.
    } finally {
      setLoading(false);
      onContinue();
    }
  };

  return (
    <AuthScreen
      title="Let's build your timeline."
      subtitle="To create memories automatically, we'll look at your recent photos on your device. Nothing is ever shared without your approval."
      footer={
        <>
          <PrimaryButton
            label="Allow Photos"
            onPress={requestPhotos}
            loading={loading}
            disabled={loading}
          />
          <PrimaryButton
            label="Skip for now"
            onPress={onContinue}
            variant="ghost"
            disabled={loading}
          />
        </>
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Private by default</Text>
        <Text style={styles.cardBody}>
          Suggested memories stay on your device until you choose to post them to
          friends.
        </Text>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  cardBody: { fontSize: 15, lineHeight: 22, color: colors.muted },
});
