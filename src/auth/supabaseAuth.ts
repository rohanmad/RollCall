import { normalizeEmail, normalizeUsername } from '../lib/validation';
import { supabase } from '../lib/supabase';
import type { AuthResult, AuthService, AuthUser } from './types';

type ProfileRow = {
  id: string;
  email: string;
  username: string;
  bio?: string | null;
  avatar_url?: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
};

function mapProfile(row: ProfileRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    bio: row.bio ?? undefined,
    avatarUri: row.avatar_url ?? undefined,
    onboarded: row.onboarded,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchProfile(userId: string): Promise<AuthUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, username, bio, avatar_url, onboarded, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfile(data as ProfileRow);
}

export const supabaseAuthService: AuthService = {
  async restoreSession() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return null;
    return fetchProfile(userId);
  },

  async signUp({ email, password, username }) {
    if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);

    const available = await this.isUsernameAvailable(normalizedUsername);
    if (!available) {
      return { ok: false, error: 'Username already taken' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { username: normalizedUsername },
      },
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data.user) {
      return { ok: false, error: 'Could not create account. Try again.' };
    }

    // Profile trigger may lag slightly — upsert defensively
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email: normalizedEmail,
      username: normalizedUsername,
    });

    const user = await fetchProfile(data.user.id);
    if (!user) {
      return {
        ok: false,
        error: 'Account created, but profile setup failed. Please sign in.',
      };
    }
    return { ok: true, user };
  },

  async signIn({ email, password }) {
    if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });

    if (error) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    if (!data.user) {
      return { ok: false, error: 'Could not sign in.' };
    }

    const user = await fetchProfile(data.user.id);
    if (!user) {
      return { ok: false, error: 'Signed in, but profile was not found.' };
    }
    return { ok: true, user };
  },

  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  async requestPasswordReset(email) {
    if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizeEmail(email),
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async isUsernameAvailable(username, excludeUserId) {
    if (!supabase) return true;
    const normalized = normalizeUsername(username);
    const { data: rows } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalized)
      .limit(1);
    if (!rows || rows.length === 0) return true;
    return Boolean(excludeUserId && rows[0]?.id === excludeUserId);
  },

  async updateUsername(userId, username) {
    if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
    const normalized = normalizeUsername(username);
    const available = await this.isUsernameAvailable(normalized, userId);
    if (!available) {
      return { ok: false, error: 'Username already taken' };
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username: normalized })
      .eq('id', userId);

    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: 'Username already taken' };
      }
      return { ok: false, error: error.message };
    }

    await supabase.auth.updateUser({ data: { username: normalized } });
    const user = await fetchProfile(userId);
    if (!user) return { ok: false, error: 'Could not update username.' };
    return { ok: true, user };
  },

  async updateBio(userId, bio) {
    if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
    const trimmed = bio.trim();
    const { error } = await supabase
      .from('profiles')
      .update({ bio: trimmed.length ? trimmed : null })
      .eq('id', userId);

    if (error) return { ok: false, error: error.message };
    const user = await fetchProfile(userId);
    if (!user) return { ok: false, error: 'Could not update bio.' };
    return { ok: true, user };
  },

  async updateAvatar(userId, avatarUri) {
    if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUri })
      .eq('id', userId);

    if (error) return { ok: false, error: error.message };
    const user = await fetchProfile(userId);
    if (!user) return { ok: false, error: 'Could not update profile photo.' };
    return { ok: true, user };
  },

  async changePassword({ email, currentPassword, newPassword }) {
    if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: currentPassword,
    });
    if (verifyError) {
      return { ok: false, error: 'Current password is incorrect.' };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async searchUsers(query, excludeUserId) {
    if (!supabase) return [];
    const q = normalizeUsername(query).replace(/^@/, '');
    if (!q) return [];

    let request = supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `%${q}%`)
      .limit(20);

    if (excludeUserId) {
      request = request.neq('id', excludeUserId);
    }

    const { data, error } = await request;
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id as string,
      username: row.username as string,
    }));
  },

  async markOnboarded(userId) {
    if (!supabase) return;
    await supabase
      .from('profiles')
      .update({ onboarded: true })
      .eq('id', userId);
  },

  async refreshUser(userId) {
    return fetchProfile(userId);
  },
};
