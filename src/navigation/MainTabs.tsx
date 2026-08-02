import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import SwipeScreen from '../screens/SwipeScreen';
import SquadScreen from '../screens/SquadScreen';
import ItineraryScreen from '../screens/ItineraryScreen';
import FriendsScreen from '../screens/FriendsScreen';
import FriendMatchesScreen from '../screens/FriendMatchesScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import { useTheme } from '../theme/ThemeContext';

export type MainTabsParamList = {
  Discover: undefined;
  Squad: undefined;
  Friends: undefined;
  Itinerary: undefined;
  ProfileTab: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
};

export type FriendsStackParamList = {
  FriendsList: undefined;
  FriendMatches: { friendUid: string; friendName: string };
};

// [focused, unfocused] Ionicons per tab. A lookup rather than a nested ternary
// so adding a tab is a one-line change here instead of another arm.
const TAB_ICONS: Record<keyof MainTabsParamList, [string, string]> = {
  Discover: ['flame', 'flame-outline'],
  Squad: ['people', 'people-outline'],
  Friends: ['heart', 'heart-outline'],
  Itinerary: ['map', 'map-outline'],
  ProfileTab: ['person', 'person-outline'],
};

const Tab = createBottomTabNavigator<MainTabsParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const FriendsStack = createNativeStackNavigator<FriendsStackParamList>();

function ProfileStackNavigator() {
  const { colors } = useTheme();
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <ProfileStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: 'Edit Profile' }}
      />
    </ProfileStack.Navigator>
  );
}

function FriendsStackNavigator() {
  const { colors } = useTheme();
  return (
    <FriendsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <FriendsStack.Screen
        name="FriendsList"
        component={FriendsScreen}
        options={{ headerShown: false }}
      />
      <FriendsStack.Screen
        name="FriendMatches"
        component={FriendMatchesScreen}
        options={({ route }) => ({ title: route.params.friendName })}
      />
    </FriendsStack.Navigator>
  );
}

export default function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        // Absolute + translucent: the swipe deck's imagery extends behind the
        // bar while interactive content pads itself above it via
        // useBottomTabBarHeight().
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const [active, inactive] = TAB_ICONS[route.name];
          return (
            <Ionicons
              name={(focused ? active : inactive) as never}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Discover" component={SwipeScreen} />
      <Tab.Screen name="Squad" component={SquadScreen} />
      <Tab.Screen name="Friends" component={FriendsStackNavigator} />
      <Tab.Screen name="Itinerary" component={ItineraryScreen} />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
