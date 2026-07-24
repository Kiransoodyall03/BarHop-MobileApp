import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { signOutUser } from '../../services/authService';
import { captureLocation } from '../../services/profileService';
import { removeSampleVenues, seedSampleVenues } from '../../dev/sampleVenues';
import { useConsumerSubscription } from '../../hooks/useConsumerSubscription';
import RedeemCodeModal from '../../components/RedeemCodeModal';
import { toDate } from '../../utils/timestamps';
import { useTheme, useThemedStyles, type ThemePreference } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';
import type { ProfileStackParamList } from '../../navigation/MainTabs';
import type { RootStackParamList } from '../../navigation/AppNavigator';

// Where Play sends users to cancel or change a subscription. Play requires an
// in-app path to manage an active subscription.
const PLAY_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;

// Sunset-family avatar backgrounds (initials are always white).
const AVATAR_COLORS = ['#E63A5B', '#D97706', '#0D9488', '#B45309', '#C2410C', '#BE185D'];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];


export default function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, profile } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [locating, setLocating] = useState(false);
  const [redeemVisible, setRedeemVisible] = useState(false);
  const { isPro, tier } = useConsumerSubscription();
  // The Paywall lives on the ROOT stack (reachable from every tab), so it needs
  // root typing rather than this screen's ProfileStack `navigation` prop.
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [seeding, setSeeding] = useState(false);

  const displayName =
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    user?.displayName ||
    'BarHop user';
  const email = profile?.email || user?.email || '';
  const initials =
    `${(profile?.firstName || displayName)[0] ?? ''}${(profile?.lastName || '')[0] ?? ''}`
      .toUpperCase() || '🍸';
  const avatarColor =
    AVATAR_COLORS[
      (user?.uid ?? '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) %
        AVATAR_COLORS.length
    ];

  const locationGranted = profile?.locationPermission === 'granted';
  const locationUpdated = toDate(profile?.location?.updatedAt);
  const locationStatus = locationGranted
    ? `Enabled${locationUpdated ? ` · updated ${locationUpdated.toLocaleDateString()}` : ''}`
    : profile?.locationPermission === 'denied'
      ? 'Off — permission denied'
      : 'Off';

  async function handleLocationPress() {
    if (!user || locating) return;
    setLocating(true);
    try {
      const result = await captureLocation(user.uid);
      if (result.status === 'denied') {
        if (result.canAskAgain === false) {
          Alert.alert(
            'Location is off for BarHop',
            'Enable it in your device Settings to see venues near you.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
      }
    } catch (error) {
      console.warn('[ProfileScreen] location update failed:', error);
    } finally {
      setLocating(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Log out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => signOutUser() },
    ]);
  }

  async function handleSeedSamples() {
    if (!user || seeding) return;
    setSeeding(true);
    try {
      const count = await seedSampleVenues(user.uid);
      Alert.alert(
        'Sample venues added',
        `Seeded ${count} venues into Firestore. Open Discover and hit Refresh (or reload the app) to deal them into the deck.`
      );
    } catch (error) {
      console.warn('[ProfileScreen] seeding failed:', error);
      Alert.alert('Seeding failed', 'Check your connection and Firestore rules, then try again.');
    } finally {
      setSeeding(false);
    }
  }

  function handleRemoveSamples() {
    if (!user || seeding) return;
    Alert.alert('Remove sample venues?', 'Deletes all sample venues this account created.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setSeeding(true);
          try {
            const count = await removeSampleVenues(user.uid);
            Alert.alert(
              'Done',
              count > 0 ? `Removed ${count} sample venues.` : 'No sample venues found.'
            );
          } catch (error) {
            console.warn('[ProfileScreen] sample removal failed:', error);
            Alert.alert('Removal failed', 'Check your connection and try again.');
          } finally {
            setSeeding(false);
          }
        },
      },
    ]);
  }

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: tabBarHeight + 24,
      }}
    >
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}
        <View style={[styles.tierBadge, isPro && styles.tierBadgePro]}>
          <Text style={[styles.tierBadgeText, isPro && styles.tierBadgeTextPro]}>
            {tier.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Subscription — top of the list so it's the first thing a free user
          sees. Pro users get a manage path instead (required by Play). */}
      <View style={styles.section}>
        <Pressable
          style={styles.row}
          onPress={() =>
            isPro
              ? Linking.openURL(PLAY_SUBSCRIPTIONS_URL)
              : rootNavigation.navigate('Paywall', { source: 'profile' })
          }
        >
          <Ionicons
            name={isPro ? 'settings-outline' : 'sparkles'}
            size={22}
            color={isPro ? colors.primary : colors.accent}
          />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>
              {isPro ? 'Manage subscription' : 'Upgrade to Pro'}
            </Text>
            <Text style={styles.rowSubtitle}>
              {isPro
                ? 'Change or cancel your plan in Google Play'
                : 'No ads, unlimited swipes, bigger squads'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.row} onPress={() => setRedeemVisible(true)}>
          <Ionicons name="ticket-outline" size={22} color={colors.primary} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Redeem a code</Text>
            <Text style={styles.rowSubtitle}>Unlock Pro with a voucher</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.row} onPress={() => navigation.navigate('EditProfile')}>
          <Ionicons name="create-outline" size={22} color={colors.primary} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Edit Profile</Text>
            <Text style={styles.rowSubtitle}>Name, birthday, vibe & preferences</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.row} onPress={handleLocationPress}>
          <Ionicons
            name={locationGranted ? 'location' : 'location-outline'}
            size={22}
            color={locationGranted ? colors.like : colors.primary}
          />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Location</Text>
            <Text style={styles.rowSubtitle}>{locationStatus}</Text>
          </View>
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.rowAction}>{locationGranted ? 'Update' : 'Enable'}</Text>
          )}
        </Pressable>

        <View style={styles.divider} />

        {/* Appearance: System / Light / Dark, persisted across launches. */}
        <View style={styles.row}>
          <Ionicons name="moon-outline" size={22} color={colors.primary} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Appearance</Text>
            <View style={styles.themeOptions}>
              {THEME_OPTIONS.map((option) => {
                const active = preference === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setPreference(option.value)}
                    style={[styles.themePill, active && styles.themePillActive]}
                  >
                    <Text style={[styles.themePillText, active && styles.themePillTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.row} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={22} color={colors.nope} />
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: colors.nope }]}>Log Out</Text>
          </View>
        </Pressable>
      </View>

      {__DEV__ && (
        <View style={styles.section}>
          <Pressable style={styles.row} onPress={handleSeedSamples} disabled={seeding}>
            <Ionicons name="flask-outline" size={22} color={colors.accent} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Add sample venues</Text>
              <Text style={styles.rowSubtitle}>
                Dev only — seeds 5 test cards (images, video, varied hours)
              </Text>
            </View>
            {seeding ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.row} onPress={handleRemoveSamples} disabled={seeding}>
            <Ionicons name="trash-outline" size={22} color={colors.nope} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>Remove sample venues</Text>
              <Text style={styles.rowSubtitle}>Deletes this account&apos;s seeded venues</Text>
            </View>
          </Pressable>
        </View>
      )}

      <Text style={styles.version}>BarHop v1.0.0</Text>
    </ScrollView>

    <RedeemCodeModal visible={redeemVisible} onClose={() => setRedeemVisible(false)} />
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    identity: { alignItems: 'center', marginBottom: 32 },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
    name: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 14 },
    email: { color: colors.textMuted, fontSize: 14, marginTop: 4 },

    tierBadge: {
      marginTop: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      paddingHorizontal: 11,
      paddingVertical: 4,
    },
    tierBadgePro: { borderColor: colors.accent, backgroundColor: colors.chipActiveBg },
    tierBadgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    tierBadgeTextPro: { color: colors.accent },

    section: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 18,
      marginHorizontal: 20,
      marginBottom: 18,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    rowBody: { flex: 1 },
    rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    rowSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
    rowAction: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    divider: { height: 1, backgroundColor: colors.border, marginLeft: 54 },

    themeOptions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    themePill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    themePillActive: {
      backgroundColor: colors.chipActiveBg,
      borderColor: colors.primary,
    },
    themePillText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    themePillTextActive: { color: colors.text },

    version: {
      color: colors.textFaint,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 12,
    },
  });
