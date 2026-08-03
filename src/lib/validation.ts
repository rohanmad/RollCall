/** Auth / signup field validation — pure, reusable utilities */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export type PasswordRequirement = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

/** Shown under new-password fields; all must pass to create/change a password. */
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (v) => v.length >= 8,
  },
  {
    id: 'upper',
    label: 'One uppercase letter',
    test: (v) => /[A-Z]/.test(v),
  },
  {
    id: 'lower',
    label: 'One lowercase letter',
    test: (v) => /[a-z]/.test(v),
  },
  {
    id: 'number',
    label: 'One number',
    test: (v) => /\d/.test(v),
  },
];

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

/** Format-only check — no “required” message while the field is empty. */
export function validateEmailFormat(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email) return null;
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address';
  return null;
}

/** New password (sign up / change password) — full complexity. */
export function validatePassword(value: string): string | null {
  if (!value) return 'Password is required';
  const unmet = PASSWORD_REQUIREMENTS.filter((r) => !r.test(value));
  if (unmet.length === 1) {
    return `Password needs ${unmet[0].label.toLowerCase()}`;
  }
  if (unmet.length > 1) {
    return 'Password does not meet all requirements';
  }
  return null;
}

/** Sign-in only — existing passwords may predate complexity rules. */
export function validatePasswordPresent(value: string): string | null {
  if (!value) return 'Password is required';
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
