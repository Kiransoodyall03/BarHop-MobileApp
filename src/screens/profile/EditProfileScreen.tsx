import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import TextField from '../../components/form/TextField';
import ChipSelect from '../../components/form/ChipSelect';
import DobField from '../../components/form/DobField';
import { useAuth } from '../../context/AuthContext';
import { ageFromDob, updateProfile } from '../../services/profileService';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import { GENDER_OPTIONS, VENUE_CATEGORIES, type Gender } from '../../types';
import type { ProfileStackParamList } from '../../navigation/MainTabs';

const MIN_AGE = 18;

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

export default function EditProfileScreen({ navigation }: Props) {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth ?? '');
  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>(
    profile?.favoriteCategories ?? []
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const age = useMemo(() => (dateOfBirth ? ageFromDob(dateOfBirth) : null), [dateOfBirth]);
  const underage = age !== null && age < MIN_AGE;
  const valid =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !!dateOfBirth && !underage;

  function toggleCategory(category: string) {
    setFavoriteCategories((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category]
    );
  }

  async function handleSave() {
    setTouched(true);
    if (!user || !valid || saving) return;
    setSaving(true);
    try {
      await updateProfile(user.uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        dateOfBirth,
        ...(gender ? { gender } : {}),
        favoriteCategories,
      });
      navigation.goBack();
    } catch (error) {
      console.warn('[EditProfileScreen] save failed:', error);
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TextField
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          autoCapitalize="words"
          error={touched && !firstName.trim() ? 'First name is required.' : null}
        />
        <TextField
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          autoCapitalize="words"
          error={touched && !lastName.trim() ? 'Last name is required.' : null}
        />
        <DobField
          value={dateOfBirth}
          onChange={setDateOfBirth}
          error={
            touched && !dateOfBirth
              ? 'Date of birth is required.'
              : underage
                ? 'BarHop is for 18 and older.'
                : null
          }
        />
        <ChipSelect
          label="Gender"
          options={GENDER_OPTIONS}
          selected={gender}
          onToggle={(value) => setGender(gender === value ? null : (value as Gender))}
        />
        <ChipSelect
          label="What are you into?"
          options={VENUE_CATEGORIES.map((c) => ({ value: c, label: c }))}
          selected={favoriteCategories}
          onToggle={toggleCategory}
        />

        <Pressable
          onPress={handleSave}
          disabled={saving || (touched && !valid)}
          style={({ pressed }) => [
            styles.saveButton,
            (pressed || saving || (touched && !valid)) && styles.saveDim,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.saveText}>Save Changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 24, paddingBottom: 48 },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    saveDim: { opacity: 0.55 },
    saveText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' },
  });
