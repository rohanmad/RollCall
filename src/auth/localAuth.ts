import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { normalizeEmail, normalizeUsername } from '../lib/validation';
import type { AuthResult, AuthService, AuthUser } from './types';

const USERS_KEY = 'rollcall.auth.users.v1';
const SESSION_KEY = 'rollcall.auth.session.v1';

type StoredUser = {
  id: string;
  email: string;
  username: string;
  bio?: string;
  avatar_uri?: string;
  password_hash: string;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
};

async function readStorage(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function writeStorage(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteStorage(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function loadUsers(): Promise<StoredUser[]> {
  const raw = await AsyncStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredUser[];
  } catch {
    return [];
  }
}

async function saveUsers(users: StoredUser[]): Promise<void> {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

function toAuthUser(u: StoredUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    bio: u.bio,
    avatarUri: u.avatar_uri,
    onboarded: u.onboarded,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

/**
 * Local auth backend used when Supabase env vars are not configured.
 * Persists users with unique email/username and hashed passwords.
 * Swap to Supabase by setting EXPO_PUBLIC_SUPABASE_URL + ANON_KEY.
 */
export const localAuthService: AuthService = {
  async restoreSession() {
    const sessionId = await readStorage(SESSION_KEY);
    if (!sessionId) return null;
    const users = await loadUsers();
    const user = users.find((u) => u.id === sessionId);
    return user ? toAuthUser(user) : null;
  },

  async signUp({ email, password, username }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);
    const users = await loadUsers();

    if (users.some((u) => u.email === normalizedEmail)) {
      return { ok: false, error: 'An account with this email already exists.' };
    }
    if (users.some((u) => u.username === normalizedUsername)) {
      return { ok: false, error: 'Username already taken' };
    }

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: Crypto.randomUUID?.() ?? `user-${Date.now()}`,
      email: normalizedEmail,
      username: normalizedUsername,
      password_hash: await hashPassword(password),
      onboarded: false,
      created_at: now,
      updated_at: now,
    };

    users.push(user);
    await saveUsers(users);
    await writeStorage(SESSION_KEY, user.id);
    return { ok: true, user: toAuthUser(user) };
  },

  async signIn({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const users = await loadUsers();
    const user = users.find((u) => u.email === normalizedEmail);
    if (!user) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    const hash = await hashPassword(password);
    if (hash !== user.password_hash) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    await writeStorage(SESSION_KEY, user.id);
    return { ok: true, user: toAuthUser(user) };
  },

  async signOut() {
    await deleteStorage(SESSION_KEY);
  },

  async requestPasswordReset(email) {
    const normalizedEmail = normalizeEmail(email);
    const users = await loadUsers();
    const exists = users.some((u) => u.email === normalizedEmail);
    // Always succeed to avoid account enumeration; local mode can't email.
    if (!exists) {
      return { ok: true };
    }
    return {
      ok: true,
    };
  },

  async isUsernameAvailable(username, excludeUserId) {
    const normalized = normalizeUsername(username);
    const users = await loadUsers();
    return !users.some(
      (u) => u.username === normalized && u.id !== excludeUserId,
    );
  },

  async updateUsername(userId, username) {
    const normalized = normalizeUsername(username);
    const users = await loadUsers();
    const taken = users.some(
      (u) => u.username === normalized && u.id !== userId,
    );
    if (taken) {
      return { ok: false, error: 'Username already taken' };
    }
    const next = users.map((u) =>
      u.id === userId
        ? { ...u, username: normalized, updated_at: new Date().toISOString() }
        : u,
    );
    await saveUsers(next);
    const user = next.find((u) => u.id === userId);
    if (!user) return { ok: false, error: 'User not found.' };
    return { ok: true, user: toAuthUser(user) };
  },

  async updateBio(userId, bio) {
    const users = await loadUsers();
    const next = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            bio: bio.trim() ? bio.trim() : undefined,
            updated_at: new Date().toISOString(),
          }
        : u,
    );
    await saveUsers(next);
    const user = next.find((u) => u.id === userId);
    if (!user) return { ok: false, error: 'User not found.' };
    return { ok: true, user: toAuthUser(user) };
  },

  async updateAvatar(userId, avatarUri) {
    const users = await loadUsers();
    const next = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            avatar_uri: avatarUri ?? undefined,
            updated_at: new Date().toISOString(),
          }
        : u,
    );
    await saveUsers(next);
    const user = next.find((u) => u.id === userId);
    if (!user) return { ok: false, error: 'User not found.' };
    return { ok: true, user: toAuthUser(user) };
  },

  async changePassword({ userId, currentPassword, newPassword }) {
    const users = await loadUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) return { ok: false, error: 'User not found.' };
    const currentHash = await hashPassword(currentPassword);
    if (currentHash !== user.password_hash) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    const password_hash = await hashPassword(newPassword);
    const next = users.map((u) =>
      u.id === userId
        ? { ...u, password_hash, updated_at: new Date().toISOString() }
        : u,
    );
    await saveUsers(next);
    return { ok: true };
  },

  async searchUsers(query, excludeUserId) {
    const q = normalizeUsername(query).replace(/^@/, '');
    if (!q) return [];
    const users = await loadUsers();
    return users
      .filter(
        (u) =>
          u.id !== excludeUserId &&
          u.username.includes(q),
      )
      .slice(0, 20)
      .map((u) => ({ id: u.id, username: u.username }));
  },

  async markOnboarded(userId) {
    const users = await loadUsers();
    const next = users.map((u) =>
      u.id === userId
        ? { ...u, onboarded: true, updated_at: new Date().toISOString() }
        : u,
    );
    await saveUsers(next);
  },

  async refreshUser(userId) {
    const users = await loadUsers();
    const user = users.find((u) => u.id === userId);
    return user ? toAuthUser(user) : null;
  },
};
