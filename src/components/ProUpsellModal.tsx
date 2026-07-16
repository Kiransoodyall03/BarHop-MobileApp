import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

interface ProUpsellModalProps {
  visible: boolean;
  title?: string;
  message?: string;
  /** CTA copy — pass "Upgrade to Elite" when a Pro user hits a Pro cap. */
  ctaLabel?: string;
  onClose: () => void;
}

/** Reusable tier gate: pitch the next tier up, offer a graceful "Maybe later". */
export default function ProUpsellModal({
  visible,
  title = 'That’s a Pro feature',
  message = 'BarHop Pro unlocks unlimited planning, no ads, and more.',
  ctaLabel = 'Upgrade to Pro',
  onClose,
}: ProUpsellModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  function handleUpgradePress() {
    Alert.alert(
      'BarHop Pro is coming soon 🥂',
      'Unlimited itinerary stops, unlimited swipes, and no ads. Watch this space.'
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.emoji}>✨</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

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
              <Text style={styles.upgradeText}>{ctaLabel}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable style={styles.laterButton} onPress={onClose} hitSlop={8}>
            <Text style={styles.laterText}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(10, 5, 8, 0.8)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
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
    emoji: { fontSize: 46 },
    title: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '800',
      marginTop: 10,
      textAlign: 'center',
    },
    message: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 22,
    },
    upgradeButton: { alignSelf: 'stretch', borderRadius: 14, overflow: 'hidden' },
    upgradeInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 15,
    },
    upgradeText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    laterButton: { marginTop: 14 },
    laterText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
    dim: { opacity: 0.7 },
  });
