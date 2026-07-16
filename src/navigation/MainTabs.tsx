import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import SwipeScreen from '../screens/SwipeScreen';
import SquadScreen from '../screens/SquadScreen';
import ItineraryScreen from '../screens/ItineraryScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import { useTheme } from '../theme/ThemeContext';

export type MainTabsParamList = {
  Discover: undefined;
  Squad: undefined;
  Itinerary: undefined;
  ProfileTab: undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

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
          const icon =
            route.name === 'Discover'
              ? focused
                ? 'flame'
                : 'flame-outline'
              : route.name === 'Squad'
                ? focused
                  ? 'people'
                  : 'people-outline'
                : route.name === 'Itinerary'
                  ? focused
                    ? 'map'
                    : 'map-outline'
                  : focused
                    ? 'person'
                    : 'person-outline';
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Discover" component={SwipeScreen} />
      <Tab.Screen name="Squad" component={SquadScreen} />
      <Tab.Screen name="Itinerary" component={ItineraryScreen} />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
