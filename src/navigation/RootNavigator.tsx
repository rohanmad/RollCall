import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native';
import { useAuth } from '../state/AuthState';
import { AppStateProvider } from '../state/AppState';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { SignInScreen } from '../screens/auth/SignInScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { PhotoPermissionScreen } from '../screens/onboarding/PhotoPermissionScreen';
import { InviteFriendsScreen } from '../screens/onboarding/InviteFriendsScreen';
import { MagicLoadingScreen } from '../screens/onboarding/MagicLoadingScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { MomentsScreen } from '../screens/MomentsScreen';
import { DiscoverScreen } from '../screens/DiscoverScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { MemoryFocusScreen } from '../screens/MemoryFocusScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { ChangeUsernameScreen } from '../screens/settings/ChangeUsernameScreen';
import { ChangeBioScreen } from '../screens/settings/ChangeBioScreen';
import { ChangePasswordScreen } from '../screens/settings/ChangePasswordScreen';
import type {
  AuthStackParamList,
  MainTabParamList,
  OnboardingStackParamList,
  RootStackParamList,
} from './types';
import { colors } from '../theme/colors';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const AppStack = createNativeStackNavigator<RootStackParamList>();

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? '600' : '500',
        color: focused ? colors.ink : colors.muted,
        marginBottom: 4,
      }}
    >
      {label}
    </Text>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <AuthStack.Screen name="Welcome">
        {({ navigation }) => (
          <WelcomeScreen
            onGetStarted={() => navigation.navigate('SignUp')}
            onSignIn={() => navigation.navigate('SignIn')}
          />
        )}
      </AuthStack.Screen>
      <AuthStack.Screen name="SignUp">
        {({ navigation }) => (
          <SignUpScreen
            onSuccess={() => {
              /* AuthProvider user update swaps root navigator to onboarding */
            }}
            onBackToSignIn={() => navigation.navigate('SignIn')}
          />
        )}
      </AuthStack.Screen>
      <AuthStack.Screen name="SignIn">
        {({ navigation }) => (
          <SignInScreen
            onSuccess={() => {
              /* session restore routes via RootNavigator */
            }}
            onForgotPassword={() => navigation.navigate('ForgotPassword')}
            onBackToWelcome={() => navigation.navigate('Welcome')}
          />
        )}
      </AuthStack.Screen>
      <AuthStack.Screen name="ForgotPassword">
        {({ navigation }) => (
          <ForgotPasswordScreen onBack={() => navigation.navigate('SignIn')} />
        )}
      </AuthStack.Screen>
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator() {
  const { completeOnboarding } = useAuth();

  return (
    <OnboardingStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <OnboardingStack.Screen name="PhotoPermission">
        {({ navigation }) => (
          <PhotoPermissionScreen
            onContinue={() => navigation.navigate('InviteFriends')}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="InviteFriends">
        {({ navigation }) => (
          <InviteFriendsScreen
            onContinue={() => navigation.navigate('MagicLoading')}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="MagicLoading">
        {() => (
          <MagicLoadingScreen
            onFinished={async () => {
              await completeOnboarding();
            }}
          />
        )}
      </OnboardingStack.Screen>
    </OnboardingStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerTitle: 'RollCall',
        headerTitleStyle: {
          fontWeight: '600',
          color: colors.ink,
          letterSpacing: -0.3,
        },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          height: 84,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Memories" focused={focused} />
          ),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'images' : 'images-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Moments"
        component={MomentsScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="For you" focused={focused} />
          ),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'sparkles' : 'sparkles-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Discover" focused={focused} />
          ),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <TabLabel label="Profile" focused={focused} />
          ),
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStateProvider>
      <AppStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <AppStack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <AppStack.Screen
          name="UserProfile"
          component={UserProfileScreen}
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Back',
          }}
        />
        <AppStack.Screen
          name="MemoryFocus"
          component={MemoryFocusScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
          }}
        />
        <AppStack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: true,
            headerTitle: 'Settings',
            headerBackTitle: 'Back',
          }}
        />
        <AppStack.Screen
          name="ChangeUsername"
          component={ChangeUsernameScreen}
          options={{
            headerShown: true,
            headerTitle: 'Username',
            headerBackTitle: 'Settings',
          }}
        />
        <AppStack.Screen
          name="ChangeBio"
          component={ChangeBioScreen}
          options={{
            headerShown: true,
            headerTitle: 'Bio',
            headerBackTitle: 'Settings',
          }}
        />
        <AppStack.Screen
          name="ChangePassword"
          component={ChangePasswordScreen}
          options={{
            headerShown: true,
            headerTitle: 'Password',
            headerBackTitle: 'Settings',
          }}
        />
      </AppStack.Navigator>
    </AppStateProvider>
  );
}

export function RootNavigator() {
  const { user, bootstrapping } = useAuth();

  if (bootstrapping) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!user) return <AuthNavigator />;
  if (!user.onboarded) return <OnboardingNavigator />;
  return <AppNavigator />;
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
