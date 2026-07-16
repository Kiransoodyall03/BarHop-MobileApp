import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from './OnboardingScaffold';
import { useOnboarding } from './OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { captureLocation, updateProfile } from '../../services/profileService';
import { useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'LocationPermission'>;

const BENEFITS = [
  { icon: '📍', text: 'See bars and clubs near you first' },
  { icon: '🔥', text: 'Catch what’s buzzing in your area tonight' },
  { icon: '🕐', text: 'Only while you’re using the app — never in the background' },
];

export default function LocationScreen(_props: Props) {
  const { user } = useAuth();
  const { finish, submitting } = useOnboarding();
  const styles = useThemedStyles(createStyles);
  const [requesting, setRequesting] = useState(false);

  async function finishOnboarding() {
    try {
      await finish();
    } catch (error) {
      console.warn('[LocationScreen] finishing onboarding failed:', error);
      Alert.alert('Something went wrong', 'Could not save your profile. Please try again.');
    }
  }

  async function handleEnable() {
    if (!user) return;
    setRequesting(true);
    try {
      const result = await captureLocation(user.uid);
      if (result.status === 'denied' && result.canAskAgain === false) {
        Alert.alert(
          'Location is off',
          'You can enable location for BarHop anytime in your device Settings.'
        );
      }
    } catch (error) {
      console.warn('[LocationScreen] location request failed:', error);
    } finally {
      setRequesting(false);
    }
    await finishOnboarding();
  }

  async function handleSkip() {
    if (user) {
      updateProfile(user.uid, { locationPermission: 'skipped' }).catch((error) =>
        console.warn('[LocationScreen] could not record skip:', error)
      );
    }
    await finishOnboarding();
  }

  return (
    <OnboardingScaffold
      step={3}
      title="Find venues near you"
      subtitle="BarHop works best when it knows what’s around you."
      continueLabel="Enable Location"
      onContinue={handleEnable}
      onSkip={handleSkip}
      submitting={submitting || requesting}
    >
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>🧭</Text>
      </View>
      {BENEFITS.map((benefit) => (
        <View key={benefit.text} style={styles.benefitRow}>
          <Text style={styles.benefitIcon}>{benefit.icon}</Text>
          <Text style={styles.benefitText}>{benefit.text}</Text>
        </View>
      ))}
      <Text style={styles.privacyNote}>
        We ask for permission with the next dialog. You can change this anytime from your
        Profile or device Settings.
      </Text>
    </OnboardingScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    iconCircle: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  icon: { fontSize: 44 },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  benefitIcon: { fontSize: 20 },
  benefitText: { color: colors.text, fontSize: 15, flex: 1, lineHeight: 21 },
  privacyNote: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    textAlign: 'center',
  },
});
