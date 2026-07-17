import { isSupabaseConfigured } from '../lib/supabase';
import { localAuthService } from './localAuth';
import { supabaseAuthService } from './supabaseAuth';
import type { AuthService } from './types';

/**
 * Production uses Supabase when env is set.
 * Otherwise a local encrypted-session auth store keeps the app fully usable.
 */
export const authService: AuthService = isSupabaseConfigured
  ? supabaseAuthService
  : localAuthService;

export { isSupabaseConfigured };
