import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { UserProfileContent } from '../components/UserProfileContent';
import { CURRENT_USER_ID } from '../data/mockData';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

export function UserProfileScreen({ route }: Props) {
  const { userId } = route.params;
  return (
    <UserProfileContent
      userId={userId}
      isOwnProfile={userId === CURRENT_USER_ID}
    />
  );
}
