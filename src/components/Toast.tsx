import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type ToastKind = 'success' | 'error' | 'info';

type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<ToastKind>('info');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (next: string, nextKind: ToastKind = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(next);
      setKind(nextKind);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setMessage(null));
      }, 2800);
    },
    [opacity],
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
            { opacity },
          ]}
        >
          <Text style={styles.text}>{message}</Text>
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
    left: 24,
    right: 24,
    bottom: 48,
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    zIndex: 1000,
  },
  error: { backgroundColor: '#7A2E2E' },
  success: { backgroundColor: '#1F4D3A' },
  text: { color: colors.surface, fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
