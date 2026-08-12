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
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Avatar from '../../components/Avatar';
import TextField from '../../components/form/TextField';
import ChipSelect from '../../components/form/ChipSelect';
import DobField from '../../components/form/DobField';
import { useAuth } from '../../context/AuthContext';
import { useSquad } from '../../context/SquadContext';
import { ageFromDob, updateProfile } from '../../services/profileService';
import { uploadAvatar } from '../../services/avatarService';
import { propagatePhotoToMySquads } from '../../services/squadService';
import { describeFirebaseError } from '../../utils/firebaseErrors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import {
  DIETARY_OPTIONS,
  GENDER_OPTIONS,
  ONBOARDING_CATEGORY_CHIPS,
  type Gender,
} from '../../types';
import type { ProfileStackParamList } from '../../navigation/MainTabs';

const MIN_AGE = 18;

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

export default function EditProfileScreen({ navigation }: Props) {
  const { user, profile } = useAuth();
  const { mySquads } = useSquad();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.photoURL ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth ?? '');
  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>(
    profile?.favoriteCategories ?? []
  );
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>(
    profile?.dietaryPreferences ?? []
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const initials =
    `${(firstName || profile?.firstName || '')[0] ?? ''}${(lastName || profile?.lastName || '')[0] ?? ''}`.toUpperCase();

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

  function toggleDietary(option: string) {
    setDietaryPreferences((current) =>
      current.includes(option) ? current.filter((d) => d !== option) : [...current, option]
    );
  }

  async function handleChangePhoto() {
    if (!user || uploadingAvatar) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Photo access needed',
        'Enable photo library access in Settings to set a profile picture.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    const previousUri = avatarUri;
    const pickedUri = result.assets[0].uri;
    setAvatarUri(pickedUri);
    setUploadingAvatar(true);
    try {
      const photoURL = await uploadAvatar(user.uid, pickedUri);
      setAvatarUri(photoURL);
      if (mySquads.length > 0) {
        await propagatePhotoToMySquads(mySquads, user.uid, photoURL);
      }
    } catch (error) {
      console.warn('[EditProfileScreen] avatar upload failed:', error);
      setAvatarUri(previousUri);
      Alert.alert(
        'Could not upload photo',
        describeFirebaseError(error, 'Please check your connection and try again.')
      );
    } finally {
      setUploadingAvatar(false);
    }
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
        dietaryPreferences,
      });
      navigation.goBack();
    } catch (error) {
      console.warn('[EditProfileScreen] save failed:', error);
      Alert.alert(
        'Could not save',
        describeFirebaseError(error, 'Please check your connection and try again.')
      );
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
        <View style={styles.avatarSection}>
          <Pressable onPress={handleChangePhoto} disabled={uploadingAvatar}>
            <Avatar photoURL={avatarUri} initials={initials} seed={user?.uid ?? ''} size={96} />
            <View style={styles.avatarEditBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Ionicons name="camera" size={16} color={colors.onPrimary} />
              )}
            </View>
          </Pressable>
        </View>

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
    avatarSection: { alignItems: 'center', marginBottom: 24 },
    avatarEditBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
