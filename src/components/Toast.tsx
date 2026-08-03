import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type ToastKind = 'success' | 'error' | 'info';

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<ToastKind>('info');
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (next: string, nextKind: ToastKind = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      setKind(nextKind);
      opacity.setValue(0);
      translateY.setValue(-8);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
      timer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -6,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(() => setMessage(null));
      }, 1800);
    },
    [opacity, translateY],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            kind === 'error' && styles.error,
            kind === 'success' && styles.success,
            {
              top: Math.max(insets.top, 12) + 6,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Text
            style={[
              styles.text,
              kind === 'error' && styles.errorText,
              kind === 'success' && styles.successText,
            ]}
          >
            {message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(247, 247, 245, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    zIndex: 1000,
    shadowColor: '#1C1C1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  error: {
    backgroundColor: 'rgba(255, 246, 246, 0.96)',
    borderColor: 'rgba(196, 92, 92, 0.28)',
  },
  success: {
    backgroundColor: 'rgba(247, 247, 245, 0.94)',
    borderColor: colors.line,
  },
  text: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  errorText: { color: colors.like },
  successText: { color: colors.ink },
});
