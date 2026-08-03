import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { UserProfileContent } from '../components/UserProfileContent';
import { useAuth } from '../state/AuthState';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

export function UserProfileScreen({ route }: Props) {
  const { user } = useAuth();
  const { userId } = route.params;
  return (
    <UserProfileContent
      userId={userId}
      isOwnProfile={Boolean(user && userId === user.id)}
    />
  );
}
