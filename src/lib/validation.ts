/** Auth / signup field validation — pure, reusable utilities */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email) return 'Email is required';
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required';
  if (value.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export function validateUsernameFormat(value: string): string | null {
  const username = normalizeUsername(value);
  if (!username) return 'Username is required';
  if (username.length < 3 || username.length > 20) {
    return 'Username must be 3–20 characters';
  }
  if (!USERNAME_RE.test(username)) {
    return 'Use lowercase letters, numbers, and underscores only';
  }
  return null;
}

export function passwordsMatch(a: string, b: string): string | null {
  if (a !== b) return 'Passwords do not match';
  return null;
}

const BIO_MAX = 160;

export function normalizeBio(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function validateBio(value: string): string | null {
  const bio = value.trim();
  if (bio.length > BIO_MAX) {
    return `Bio must be ${BIO_MAX} characters or fewer`;
  }
  return null;
}

export const BIO_MAX_LENGTH = BIO_MAX;
