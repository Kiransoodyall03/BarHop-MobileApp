import React, { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../../context/AuthContext';
import { completeOnboarding } from '../../services/profileService';
import type { Gender } from '../../types';

interface OnboardingState {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 'YYYY-MM-DD'
  gender: Gender | null;
  favoriteCategories: string[];
  dietaryPreferences: string[];
}

interface OnboardingContextValue extends OnboardingState {
  setAboutYou: (data: { firstName: string; lastName: string; dateOfBirth: string }) => void;
  setGender: (gender: Gender | null) => void;
  toggleCategory: (category: string) => void;
  toggleDietary: (option: string) => void;
  /** Writes the whole profile + profileCompleted: true. Throws on failure. */
  finish: () => Promise<void>;
  submitting: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: null,
    favoriteCategories: [],
    dietaryPreferences: [],
  });
  const [submitting, setSubmitting] = useState(false);

  const value: OnboardingContextValue = {
    ...state,
    submitting,
    setAboutYou: (data) => setState((prev) => ({ ...prev, ...data })),
    setGender: (gender) => setState((prev) => ({ ...prev, gender })),
    toggleCategory: (category) =>
      setState((prev) => ({
        ...prev,
        favoriteCategories: prev.favoriteCategories.includes(category)
          ? prev.favoriteCategories.filter((c) => c !== category)
          : [...prev.favoriteCategories, category],
      })),
    toggleDietary: (option) =>
      setState((prev) => ({
        ...prev,
        dietaryPreferences: prev.dietaryPreferences.includes(option)
          ? prev.dietaryPreferences.filter((d) => d !== option)
          : [...prev.dietaryPreferences, option],
      })),
    finish: async () => {
      if (!user) return;
      setSubmitting(true);
      try {
        await completeOnboarding(user.uid, {
          firstName: state.firstName.trim(),
          lastName: state.lastName.trim(),
          dateOfBirth: state.dateOfBirth,
          ...(state.gender ? { gender: state.gender } : {}),
          ...(state.favoriteCategories.length
            ? { favoriteCategories: state.favoriteCategories }
            : {}),
          ...(state.dietaryPreferences.length
            ? { dietaryPreferences: state.dietaryPreferences }
            : {}),
        });
        // AuthContext's profile snapshot flips needsOnboarding → tabs appear.
      } finally {
        setSubmitting(false);
      }
    },
  };

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return context;
}
