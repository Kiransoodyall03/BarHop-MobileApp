import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from './OnboardingScaffold';
import TextField from '../../components/form/TextField';
import DobField from '../../components/form/DobField';
import { useOnboarding } from './OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { ageFromDob } from '../../services/profileService';
import { useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

const MIN_AGE = 18;

type Props = NativeStackScreenProps<OnboardingStackParamList, 'AboutYou'>;

export default function AboutYouScreen({ navigation }: Props) {
  const { user } = useAuth();
  const onboarding = useOnboarding();
  const styles = useThemedStyles(createStyles);

  // Prefill from the auth provider (e.g. Google displayName) when available.
  const [providerFirst = '', providerLast = ''] = (user?.displayName ?? '').split(' ');
  const [firstName, setFirstName] = useState(onboarding.firstName || providerFirst);
  const [lastName, setLastName] = useState(onboarding.lastName || providerLast);
  const [dateOfBirth, setDateOfBirth] = useState(onboarding.dateOfBirth);
  const [touched, setTouched] = useState(false);

  const age = useMemo(() => (dateOfBirth ? ageFromDob(dateOfBirth) : null), [dateOfBirth]);
  const underage = age !== null && age < MIN_AGE;
  const valid = firstName.trim().length > 0 && lastName.trim().length > 0 && !!dateOfBirth && !underage;

  function handleContinue() {
    setTouched(true);
    if (!valid) return;
    onboarding.setAboutYou({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth,
    });
    navigation.navigate('Preferences');
  }

  return (
    <OnboardingScaffold
      step={1}
      title="About you"
      subtitle="Tell us who's hitting the town. You must be 18 or older to use BarHop."
      onContinue={handleContinue}
      continueDisabled={touched && !valid}
    >
      <TextField
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        placeholder="First name"
        autoComplete="given-name"
        autoCapitalize="words"
        error={touched && !firstName.trim() ? 'First name is required.' : null}
      />
      <TextField
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Last name"
        autoComplete="family-name"
        autoCapitalize="words"
        error={touched && !lastName.trim() ? 'Last name is required.' : null}
      />
      <DobField
        value={dateOfBirth}
        onChange={setDateOfBirth}
        error={touched && !dateOfBirth ? 'Date of birth is required.' : null}
      />

      {underage && (
        <View style={styles.underageBox}>
          <Text style={styles.underageTitle}>Sorry, BarHop is 18+</Text>
          <Text style={styles.underageText}>
            You need to be at least 18 years old to discover venues on BarHop.
          </Text>
        </View>
      )}
    </OnboardingScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    underageBox: {
      backgroundColor: 'rgba(220, 38, 38, 0.10)',
      borderColor: colors.nope,
      borderWidth: 1,
      borderRadius: 14,
      padding: 16,
      marginTop: 4,
    },
    underageTitle: { color: colors.danger, fontSize: 16, fontWeight: '700' },
    underageText: { color: colors.textMuted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  });
