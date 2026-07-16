import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { VenueWithId } from '../types';

interface MatchModalProps {
  venue: VenueWithId | null;
  memberCount: number;
  onDismiss: () => void;
}

/** Full-screen "IT'S A MATCH!" celebration when the whole squad agrees. */
export default function MatchModal({ venue, memberCount, onDismiss }: MatchModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const imageUrl = venue?.images?.[0];

  return (
    <Modal visible={!!venue} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.scrim}>
        <Text style={styles.title}>IT&apos;S A MATCH! 🎉</Text>
        <Text style={styles.subtitle}>
          All {memberCount} of you want {venue?.name ?? 'this spot'}.
        </Text>

        <View style={styles.card}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <Text style={styles.fallbackEmoji}>🍸</Text>
            </View>
          )}
          <View style={styles.cardBody}>
            <Text style={styles.venueName} numberOfLines={1}>
              {venue?.name}
            </Text>
            {venue?.address ? (
              <Text style={styles.venueAddress} numberOfLines={2}>
                📍 {venue.address}
              </Text>
            ) : null}
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.button, pressed && styles.dim]} onPress={onDismiss}>
          <LinearGradient
            colors={colors.buttonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.buttonInner}
          >
            <Text style={styles.buttonText}>Keep Swiping</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(10, 5, 8, 0.88)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    title: {
      color: colors.accent,
      fontSize: 40,
      fontWeight: '900',
      letterSpacing: 1,
      textAlign: 'center',
    },
    subtitle: {
      color: 'rgba(255, 255, 255, 0.85)',
      fontSize: 16,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 28,
    },
    card: {
      width: '100%',
      borderRadius: 20,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    image: { width: '100%', height: 200 },
    imageFallback: {
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fallbackEmoji: { fontSize: 56 },
    cardBody: { padding: 16 },
    venueName: { color: colors.text, fontSize: 22, fontWeight: '800' },
    venueAddress: { color: colors.textMuted, fontSize: 14, marginTop: 6, lineHeight: 20 },
    button: { borderRadius: 16, overflow: 'hidden', marginTop: 28, alignSelf: 'stretch' },
    buttonInner: { paddingVertical: 16, alignItems: 'center' },
    buttonText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' },
    dim: { opacity: 0.8 },
  });
