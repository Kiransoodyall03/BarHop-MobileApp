import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { adsModule, adsSupported, REWARDED_AD_UNIT_ID } from './adsModule';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/AppNavigator';

// Guarded at module scope: null in Expo Go, real hook in dev builds. The
// component that calls it is only mounted when adsSupported is true.
const useRewardedAd = adsModule?.useRewardedAd;

export const SWIPES_PER_REWARD = 15;

interface OutOfSwipesModalProps {
  visible: boolean;
  onClose: () => void;
  /** Grant exactly SWIPES_PER_REWARD swipes and dismiss. */
  onRewardEarned: () => void;
}

/** Shown when the free-tier session swipe budget hits zero. */
export default function OutOfSwipesModal({
  visible,
  onClose,
  onRewardEarned,
}: OutOfSwipesModalProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  function handleUpgradePress() {
    // Dismiss first — this modal would otherwise cover the pushed Paywall.
    onClose();
    navigation.navigate('Paywall', { source: 'out-of-swipes' });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>

          <Text style={styles.emoji}>🥃</Text>
          <Text style={styles.title}>You&apos;re out of swipes</Text>
          <Text style={styles.subtitle}>
            That&apos;s your {SWIPES_PER_REWARD} free swipes for this session. Keep the night
            going:
          </Text>

          <Pressable
            style={({ pressed }) => [styles.upgradeButton, pressed && styles.dim]}
            onPress={handleUpgradePress}
          >
            <LinearGradient
              colors={colors.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.upgradeInner}
            >
              <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
              <Text style={styles.upgradeText}>Upgrade to Pro — Unlimited</Text>
            </LinearGradient>
          </Pressable>

          {adsSupported ? (
            <RewardedAdButton onEarned={onRewardEarned} />
          ) : (
            <SimulatedRewardedButton onEarned={onRewardEarned} />
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Real rewarded video (dev/standalone builds). Loads on mount, grants on the
 * EARNED_REWARD event only — closing the video early grants nothing — then
 * preloads the next ad after close.
 */
function RewardedAdButton({ onEarned }: { onEarned: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { isLoaded, isClosed, isEarnedReward, load, show, error } =
    useRewardedAd!(REWARDED_AD_UNIT_ID);
  const granted = useRef(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isEarnedReward && !granted.current) {
      granted.current = true;
      onEarned();
    }
  }, [isEarnedReward, onEarned]);

  // After the video closes (rewarded or not), prep the next one.
  useEffect(() => {
    if (isClosed) {
      granted.current = false;
      load();
    }
  }, [isClosed, load]);

  const label = isLoaded
    ? `Watch Ad for ${SWIPES_PER_REWARD} Swipes`
    : error
      ? 'Ad unavailable — try again soon'
      : 'Loading ad…';

  return (
    <Pressable
      style={({ pressed }) => [styles.watchButton, (!isLoaded || pressed) && styles.dim]}
      disabled={!isLoaded}
      onPress={() => show()}
    >
      {!isLoaded && !error ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
      )}
      <Text style={styles.watchText}>{label}</Text>
    </Pressable>
  );
}

/** Expo Go fallback: the native ads SDK can't run, so the reward is simulated. */
function SimulatedRewardedButton({ onEarned }: { onEarned: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  function handlePress() {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      onEarned();
    }, 1200);
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.watchButton, (busy || pressed) && styles.dim]}
      onPress={handlePress}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
      )}
      <Text style={styles.watchText}>
        Watch Ad for {SWIPES_PER_REWARD} Swipes{'\n'}
        <Text style={styles.simNote}>(simulated in Expo Go)</Text>
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(10, 5, 8, 0.8)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    card: {
      width: '100%',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 24,
      padding: 26,
      alignItems: 'center',
    },
    close: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
    emoji: { fontSize: 52 },
    title: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
      marginTop: 12,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 24,
    },
    upgradeButton: {
      alignSelf: 'stretch',
      borderRadius: 14,
      overflow: 'hidden',
    },
    upgradeInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    upgradeText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    watchButton: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      paddingVertical: 15,
    },
    watchText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
    },
    simNote: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
    dim: { opacity: 0.6 },
  });
