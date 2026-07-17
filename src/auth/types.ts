export type AuthUser = {
  id: string;
  email: string;
  username: string;
  bio?: string;
  avatarUri?: string;
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

export type AuthService = {
  restoreSession: () => Promise<AuthUser | null>;
  signUp: (input: {
    email: string;
    password: string;
    username: string;
  }) => Promise<AuthResult>;
  signIn: (input: { email: string; password: string }) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  isUsernameAvailable: (
    username: string,
    excludeUserId?: string,
  ) => Promise<boolean>;
  updateUsername: (userId: string, username: string) => Promise<AuthResult>;
  updateBio: (userId: string, bio: string) => Promise<AuthResult>;
  updateAvatar: (
    userId: string,
    avatarUri: string | null,
  ) => Promise<AuthResult>;
  changePassword: (input: {
    userId: string;
    email: string;
    currentPassword: string;
    newPassword: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  searchUsers: (
    query: string,
    excludeUserId?: string,
  ) => Promise<Array<{ id: string; username: string }>>;
  markOnboarded: (userId: string) => Promise<void>;
  refreshUser: (userId: string) => Promise<AuthUser | null>;
};
