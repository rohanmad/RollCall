import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { authService } from '../auth';
import type { AuthUser } from '../auth/types';
import {
  normalizeEmail,
  normalizeUsername,
  normalizeBio,
  validateBio,
  validateEmail,
  validatePassword,
  validatePasswordPresent,
  validateUsernameFormat,
} from '../lib/validation';

type Ok = { ok: true };
type Fail = { ok: false; error: string };

type AuthContextValue = {
  user: AuthUser | null;
  bootstrapping: boolean;
  signUp: (input: {
    email: string;
    password: string;
    username: string;
  }) => Promise<Ok | Fail>;
  signIn: (input: { email: string; password: string }) => Promise<Ok | Fail>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<Ok | Fail>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  updateUsername: (username: string) => Promise<Ok | Fail>;
  updateBio: (bio: string) => Promise<Ok | Fail>;
  updateAvatar: (avatarUri: string | null) => Promise<Ok | Fail>;
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<Ok | Fail>;
  completeOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const busy = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sessionUser = await authService.restoreSession();
        if (mounted) setUser(sessionUser);
      } finally {
        if (mounted) setBootstrapping(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const signUp = useCallback(async (input: {
    email: string;
    password: string;
    username: string;
  }): Promise<Ok | Fail> => {
    if (busy.current) return { ok: false, error: 'Please wait…' };
    const emailErr = validateEmail(input.email);
    const passErr = validatePassword(input.password);
    const userErr = validateUsernameFormat(input.username);
    if (emailErr || passErr || userErr) {
      return { ok: false, error: emailErr || passErr || userErr || 'Invalid input' };
    }

    busy.current = true;
    try {
      const result = await authService.signUp({
        email: normalizeEmail(input.email),
        password: input.password,
        username: normalizeUsername(input.username),
      });
      if (!result.ok) return result;
      setUser(result.user);
      return { ok: true };
    } finally {
      busy.current = false;
    }
  }, []);

  const signIn = useCallback(async (input: {
    email: string;
    password: string;
  }): Promise<Ok | Fail> => {
    if (busy.current) return { ok: false, error: 'Please wait…' };
    const emailErr = validateEmail(input.email);
    const passErr = validatePasswordPresent(input.password);
    if (emailErr || passErr) {
      return { ok: false, error: emailErr || passErr || 'Invalid input' };
    }

    busy.current = true;
    try {
      const result = await authService.signIn({
        email: normalizeEmail(input.email),
        password: input.password,
      });
      if (!result.ok) return result;
      setUser(result.user);
      return { ok: true };
    } finally {
      busy.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<Ok | Fail> => {
    const emailErr = validateEmail(email);
    if (emailErr) return { ok: false, error: emailErr };
    return authService.requestPasswordReset(normalizeEmail(email));
  }, []);

  const checkUsernameAvailable = useCallback(
    async (username: string) => {
      const formatErr = validateUsernameFormat(username);
      if (formatErr) return false;
      const normalized = normalizeUsername(username);
      if (user && normalized === user.username) return true;
      return authService.isUsernameAvailable(normalized, user?.id);
    },
    [user],
  );

  const updateUsername = useCallback(
    async (username: string): Promise<Ok | Fail> => {
      if (!user) return { ok: false, error: 'Not signed in.' };
      if (busy.current) return { ok: false, error: 'Please wait…' };
      const formatErr = validateUsernameFormat(username);
      if (formatErr) return { ok: false, error: formatErr };

      const normalized = normalizeUsername(username);
      if (normalized === user.username) return { ok: true };

      busy.current = true;
      try {
        const result = await authService.updateUsername(user.id, normalized);
        if (!result.ok) return result;
        setUser(result.user);
        return { ok: true };
      } finally {
        busy.current = false;
      }
    },
    [user],
  );

  const updateBio = useCallback(
    async (bio: string): Promise<Ok | Fail> => {
      if (!user) return { ok: false, error: 'Not signed in.' };
      if (busy.current) return { ok: false, error: 'Please wait…' };
      const err = validateBio(bio);
      if (err) return { ok: false, error: err };

      const normalized = normalizeBio(bio);
      if (normalized === (user.bio ?? '')) return { ok: true };

      busy.current = true;
      try {
        const result = await authService.updateBio(user.id, normalized);
        if (!result.ok) return result;
        setUser(result.user);
        return { ok: true };
      } finally {
        busy.current = false;
      }
    },
    [user],
  );

  const updateAvatar = useCallback(
    async (avatarUri: string | null): Promise<Ok | Fail> => {
      if (!user) return { ok: false, error: 'Not signed in.' };
      if (busy.current) return { ok: false, error: 'Please wait…' };

      busy.current = true;
      try {
        const result = await authService.updateAvatar(user.id, avatarUri);
        if (!result.ok) return result;
        setUser(result.user);
        return { ok: true };
      } finally {
        busy.current = false;
      }
    },
    [user],
  );

  const changePassword = useCallback(
    async (input: {
      currentPassword: string;
      newPassword: string;
    }): Promise<Ok | Fail> => {
      if (!user) return { ok: false, error: 'Not signed in.' };
      if (busy.current) return { ok: false, error: 'Please wait…' };
      const currentErr = validatePasswordPresent(input.currentPassword);
      const newErr = validatePassword(input.newPassword);
      if (currentErr) return { ok: false, error: currentErr };
      if (newErr) return { ok: false, error: newErr };

      busy.current = true;
      try {
        return await authService.changePassword({
          userId: user.id,
          email: user.email,
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
        });
      } finally {
        busy.current = false;
      }
    },
    [user],
  );

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    await authService.markOnboarded(user.id);
    const refreshed = await authService.refreshUser(user.id);
    if (refreshed) setUser(refreshed);
    else setUser({ ...user, onboarded: true });
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      bootstrapping,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      checkUsernameAvailable,
      updateUsername,
      updateBio,
      updateAvatar,
      changePassword,
      completeOnboarding,
    }),
    [
      user,
      bootstrapping,
      signUp,
      signIn,
      signOut,
      requestPasswordReset,
      checkUsernameAvailable,
      updateUsername,
      updateBio,
      updateAvatar,
      changePassword,
      completeOnboarding,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
