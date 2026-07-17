import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { runMemoryScan } from '../../lib/memoryPipeline';
import { colors } from '../../theme/colors';

type Props = {
  onFinished: () => void;
};

const MIN_DISPLAY_MS = 2800;
const FALLBACK_STEPS = [
  'Finding moments...',
  'Looking through recent photos...',
  'Creating your timeline...',
];

export function MagicLoadingScreen({ onFinished }: Props) {
  const [lines, setLines] = useState<string[]>([FALLBACK_STEPS[0]]);
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const startedAt = useRef(Date.now());
  const finishedRef = useRef(false);

  const visibleLines = useMemo(() => lines, [lines]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    Animated.timing(fade, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();

    const finish = async () => {
      if (finishedRef.current || cancelled) return;
      finishedRef.current = true;
      const elapsed = Date.now() - startedAt.current;
      const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
      await new Promise((r) => setTimeout(r, wait));
      if (!cancelled) onFinished();
    };

    (async () => {
      // Run the real camera-roll pipeline during the magic beat
      const resultPromise = runMemoryScan({ requestPermission: false });

      // Reveal fallback lines while the scan runs so the screen never feels stuck
      FALLBACK_STEPS.forEach((label, index) => {
        if (index === 0) return;
        timers.push(
          setTimeout(() => {
            if (!cancelled) {
              setLines((prev) =>
                prev.includes(label) ? prev : [...prev, label],
              );
            }
          }, 600 * index),
        );
      });

      Animated.timing(progress, {
        toValue: 0.7,
        duration: 1600,
        useNativeDriver: false,
      }).start();

      try {
        const result = await resultPromise;
        if (cancelled) return;

        const nextLines =
          result.messages.length > 0 ? result.messages : FALLBACK_STEPS;
        setLines(nextLines);

        Animated.timing(progress, {
          toValue: 1,
          duration: 700,
          useNativeDriver: false,
        }).start();

        // Stagger checkmarks so the list still feels alive
        nextLines.forEach((_, index) => {
          timers.push(
            setTimeout(() => {
              if (!cancelled) {
                setLines((prev) => prev.slice(0, Math.max(prev.length, index + 1)));
              }
            }, 180 * index),
          );
        });

        timers.push(setTimeout(() => void finish(), 700 + nextLines.length * 180));
      } catch {
        if (!cancelled) {
          setLines([
            'Finding moments...',
            'Couldn’t finish the scan — you can try again later',
            'Creating your timeline...',
          ]);
          timers.push(setTimeout(() => void finish(), 1200));
        }
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [fade, onFinished, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['8%', '100%'],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <Animated.View style={[styles.content, { opacity: fade }]}>
        <Text style={styles.kicker}>RollCall</Text>
        <Text style={styles.title}>Building your timeline</Text>
        <Text style={styles.subtitle}>
          A quiet scan of recent moments — nothing posts without you.
        </Text>

        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width }]} />
        </View>

        <View style={styles.list}>
          {visibleLines.map((label, index) => {
            const isLast = index === visibleLines.length - 1;
            const done = label.startsWith('✓') || (!isLast && !label.endsWith('...'));
            return (
              <View key={`${label}-${index}`} style={styles.row}>
                <Text style={styles.check}>{done ? '✓' : '·'}</Text>
                <Text style={[styles.line, !done && styles.lineActive]}>
                  {label.replace(/^✓\s*/, '')}
                </Text>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 72,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    marginTop: 12,
    fontSize: 32,
    fontWeight: '600',
    color: colors.ink,
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
  },
  barTrack: {
    marginTop: 36,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.chipBg,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.ink,
  },
  list: { marginTop: 28, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { width: 18, fontSize: 16, fontWeight: '700', color: colors.ink },
  line: { fontSize: 16, color: colors.ink, fontWeight: '500', flex: 1 },
  lineActive: { color: colors.muted },
});
