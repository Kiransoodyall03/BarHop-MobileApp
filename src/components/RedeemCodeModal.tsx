import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { redeemVoucher } from '../services/voucherService';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

interface RedeemCodeModalProps {
  visible: boolean;
  onClose: () => void;
  /** Fired after a successful redemption, so a paywall can dismiss itself. */
  onRedeemed?: () => void;
}

/**
 * Voucher entry. All validation is server-side (see voucherService) — this only
 * collects a string and renders the outcome.
 *
 * On success the granted Pro shows up through the normal path: the function
 * writes proGrantExpiresAt, AuthContext's onSnapshot fires, and every gate
 * unlocks. No local tier juggling here.
 */
export default function RedeemCodeModal({
  visible,
  onClose,
  onRedeemed,
}: RedeemCodeModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setCode('');
    setBusy(false);
    setError(null);
    setSuccess(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleRedeem() {
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);

    const result = await redeemVoucher(code);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    const until = new Date(result.expiresAt).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    setSuccess(`Pro unlocked until ${until}.`);
    onRedeemed?.();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          {success ? (
            <>
              <Ionicons name="checkmark-circle" size={46} color={colors.like} />
              <Text style={styles.title}>You’re on Pro 🥂</Text>
              <Text style={styles.message}>{success}</Text>
              <Pressable style={styles.laterButton} onPress={handleClose} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.emoji}>🎟️</Text>
              <Text style={styles.title}>Redeem a code</Text>
              <Text style={styles.message}>
                Enter your BarHop voucher code to unlock Pro.
              </Text>

              <TextInput
                style={[styles.input, !!error && styles.inputError]}
                value={code}
                onChangeText={(next) => {
                  setCode(next);
                  if (error) setError(null);
                }}
                placeholder="BARHOP-XXXX"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={handleRedeem}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.submitButton, (pressed || busy) && styles.dim]}
                onPress={handleRedeem}
                disabled={busy || !code.trim()}
              >
                <LinearGradient
                  colors={colors.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitInner}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.submitText}>Redeem</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable style={styles.laterButton} onPress={handleClose} hitSlop={8}>
                <Text style={styles.laterText}>Cancel</Text>
              </Pressable>
            </>
          )}
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
      paddingHorizontal: 28,
    },
    card: {
      alignSelf: 'stretch',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 24,
      padding: 26,
    },
    emoji: { fontSize: 46 },
    title: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 10 },
    message: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 8,
    },

    input: {
      alignSelf: 'stretch',
      marginTop: 18,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 1.5,
      textAlign: 'center',
    },
    inputError: { borderColor: colors.danger },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 10,
    },

    submitButton: {
      alignSelf: 'stretch',
      borderRadius: 14,
      overflow: 'hidden',
      marginTop: 18,
    },
    submitInner: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
    submitText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    dim: { opacity: 0.7 },

    laterButton: { marginTop: 14, paddingVertical: 6 },
    laterText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    doneText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  });
