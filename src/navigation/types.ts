export type AuthStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  SignIn: undefined;
  ForgotPassword: undefined;
};

export type OnboardingStackParamList = {
  PhotoPermission: undefined;
  InviteFriends: undefined;
  MagicLoading: undefined;
};

export type MainTabParamList = {
  Feed: undefined;
  Moments: undefined;
  Discover: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  UserProfile: { userId: string };
  MemoryFocus: { postId: string };
  Notifications: undefined;
  Settings: undefined;
  ChangeUsername: undefined;
  ChangeBio: undefined;
  ChangePassword: undefined;
};
