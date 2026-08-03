import { useAuth } from '../state/AuthState';
import { UserProfileContent } from '../components/UserProfileContent';

export function ProfileScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return <UserProfileContent userId={user.id} isOwnProfile />;
}
