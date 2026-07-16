import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingProvider } from '../screens/onboarding/OnboardingContext';
import AboutYouScreen from '../screens/onboarding/AboutYouScreen';
import PreferencesScreen from '../screens/onboarding/PreferencesScreen';
import LocationScreen from '../screens/onboarding/LocationScreen';

export type OnboardingStackParamList = {
  AboutYou: undefined;
  Preferences: undefined;
  LocationPermission: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

/** Post-registration profile wizard; wizard state lives in OnboardingProvider. */
export default function OnboardingNavigator() {
  return (
    <OnboardingProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="AboutYou" component={AboutYouScreen} />
        <Stack.Screen name="Preferences" component={PreferencesScreen} />
        <Stack.Screen name="LocationPermission" component={LocationScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
