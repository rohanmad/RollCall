import { UserProfileContent } from '../components/UserProfileContent';
import { CURRENT_USER_ID } from '../data/mockData';

export function ProfileScreen() {
  return <UserProfileContent userId={CURRENT_USER_ID} isOwnProfile />;
}
