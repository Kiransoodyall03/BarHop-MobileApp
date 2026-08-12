import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useFriends } from '../context/FriendsContext';
import { ensureFriendCode, FriendRequestError } from '../services/friendService';
import { describeFirebaseError } from '../utils/firebaseErrors';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

interface AddFriendModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pre-fills the input — used by the barhop://friend/{code} deep link. */
  initialCode?: string | null;
}

/**
 * Add-friend by code. Mirrors the squad PIN flow, which exists for the same
 * reason: users/{uid} is not readable by anyone else, so a shared code plus a
 * lookup collection is the only way one user can find another.
 */
export default function AddFriendModal({
  visible,
  onClose,
  initialCode,
}: AddFriendModalProps) {
  const { user, profile } = useAuth();
  const { addFriendByCode } = useFriends();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [code, setCode] = useState('');
  const [myCode, setMyCode] = useState<string | null>(profile?.friendCode ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Generate the user's own code the first time they open this sheet, so a
  // code only exists for people who actually use the feature.
  useEffect(() => {
    if (!visible || !user) return;
    if (profile?.friendCode) {
      setMyCode(profile.friendCode);
      return;
    }
    ensureFriendCode(user.uid, profile?.friendCode)
      .then((code) => {
        setMyCode(code);
        setCodeError(null);
      })
      .catch((err) => {
        console.warn('[AddFriendModal] code generation failed:', err);
        setCodeError(
          describeFirebaseError(err, 'Could not create your friend code.')
        );
      });
  }, [visible, user, profile?.friendCode]);

  useEffect(() => {
    if (visible && initialCode) setCode(initialCode.toUpperCase());
  }, [visible, initialCode]);

  function handleClose() {
    setCode('');
    setBusy(false);
    setError(null);
    setSuccess(null);
    onClose();
  }

  async function handleSubmit() {
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addFriendByCode(code);
      setSuccess('Request sent! They just need to accept.');
    } catch (err) {
      console.warn('[AddFriendModal] friend request failed:', err);
      setError(
        err instanceof FriendRequestError
          ? err.message
          : describeFirebaseError(
              err,
              'Could not send that request. Check your connection and try again.'
            )
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!myCode) return;
    try {
      await Share.share({
        message: `Add me on BarHop — my friend code is ${myCode}\nbarhop://friend/${myCode}`,
      });
    } catch {
      // User dismissed the share sheet; nothing to report.
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          {success ? (
            <>
              <Ionicons name="checkmark-circle" size={46} color={colors.like} />
              <Text style={styles.title}>Sent 🎉</Text>
              <Text style={styles.message}>{success}</Text>
              <Pressable style={styles.laterButton} onPress={handleClose} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.emoji}>🤝</Text>
              <Text style={styles.title}>Add a friend</Text>
              <Text style={styles.message}>
                Enter their friend code to send a request.
              </Text>

              <TextInput
                style={[styles.input, !!error && styles.inputError]}
                value={code}
                onChangeText={(next) => {
                  setCode(next.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="ABC123"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.submitButton, (pressed || busy) && styles.dim]}
                onPress={handleSubmit}
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
                    <Text style={styles.submitText}>Send request</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <View style={styles.divider} />

              <Text style={styles.myCodeLabel}>Your code</Text>
              {codeError ? (
                <Text style={styles.errorText}>{codeError}</Text>
              ) : (
                <Pressable style={styles.myCodeRow} onPress={handleShare} disabled={!myCode}>
                  <Text style={styles.myCodeText}>{myCode ?? '······'}</Text>
                  <Ionicons name="share-outline" size={19} color={colors.primary} />
                </Pressable>
              )}

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
      fontSize: 19,
      fontWeight: '700',
      letterSpacing: 4,
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

    divider: {
      alignSelf: 'stretch',
      height: 1,
      backgroundColor: colors.border,
      marginTop: 22,
    },
    myCodeLabel: {
      color: colors.textFaint,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: 16,
    },
    myCodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
      paddingVertical: 4,
    },
    myCodeText: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: 4,
    },

    laterButton: { marginTop: 14, paddingVertical: 6 },
    laterText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    doneText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  });
