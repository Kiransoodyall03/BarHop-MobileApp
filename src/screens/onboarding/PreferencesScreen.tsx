import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import OnboardingScaffold from './OnboardingScaffold';
import ChipSelect from '../../components/form/ChipSelect';
import { useOnboarding } from './OnboardingContext';
import {
  DIETARY_OPTIONS,
  GENDER_OPTIONS,
  ONBOARDING_CATEGORY_CHIPS,
  type Gender,
} from '../../types';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Preferences'>;

export default function PreferencesScreen({ navigation }: Props) {
  const { gender, setGender, favoriteCategories, toggleCategory, dietaryPreferences, toggleDietary } =
    useOnboarding();

  return (
    <OnboardingScaffold
      step={2}
      title="Your vibe"
      subtitle="Optional — helps us surface the right spots for you."
      onContinue={() => navigation.navigate('LocationPermission')}
      onSkip={() => navigation.navigate('LocationPermission')}
    >
      <ChipSelect
        label="Gender"
        options={GENDER_OPTIONS}
        selected={gender}
        onToggle={(value) => setGender(gender === value ? null : (value as Gender))}
      />
      <ChipSelect
        label="What are you into?"
        options={ONBOARDING_CATEGORY_CHIPS.map((c) => ({ value: c, label: c }))}
        selected={favoriteCategories}
        onToggle={toggleCategory}
      />
      <ChipSelect
        label="Dietary needs"
        options={DIETARY_OPTIONS}
        selected={dietaryPreferences}
        onToggle={toggleDietary}
      />
    </OnboardingScaffold>
  );
}
