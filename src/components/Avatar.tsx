import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import AvatarFrame from './AvatarFrame';
import { avatarColorFor } from '../utils/avatarColor';
import { useCardBorder } from '../services/borderCatalogService';

interface AvatarProps {
  photoURL?: string | null;
  /** Caller computes this — initials logic differs slightly per screen. */
  initials: string;
  /** Hashed into a background color for the initials fallback (usually the uid). */
  seed: string;
  size: number;
  /**
   * users/{uid}.avatarBorderStyle — a border catalog key of kind 'avatar'.
   * Absent (the common case) renders exactly as before, so every existing
   * caller keeps working untouched.
   */
  borderStyle?: string | null;
  // Only border/layout props are ever passed in practice — this component
  // renders either an Image or a View, so the caller's style must apply to
  // both; the cast at the Image call site reflects that shared subset.
  style?: StyleProp<ViewStyle>;
}

export default function Avatar({
  photoURL,
  initials,
  seed,
  size,
  borderStyle,
  style,
}: AvatarProps) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const border = useCardBorder(borderStyle);
  // The catalog's default entry is a CARD treatment; only a real avatar frame
  // may wrap a profile picture, and only when one was actually requested.
  const frame = borderStyle && border.kind === 'avatar' ? border : null;

  const face = photoURL ? (
    <Image
      source={{ uri: photoURL }}
      style={[circle, style] as StyleProp<ImageStyle>}
    />
  ) : (
    <View
      style={[
        circle,
        styles.fallback,
        { backgroundColor: avatarColorFor(seed) },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials || '🍸'}</Text>
    </View>
  );

  if (!frame) return face;

  return (
    <AvatarFrame border={frame} size={size}>
      {face}
    </AvatarFrame>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '800' },
});
