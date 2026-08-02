import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { avatarColorFor } from '../utils/avatarColor';

interface AvatarProps {
  photoURL?: string | null;
  /** Caller computes this — initials logic differs slightly per screen. */
  initials: string;
  /** Hashed into a background color for the initials fallback (usually the uid). */
  seed: string;
  size: number;
  // Only border/layout props are ever passed in practice — this component
  // renders either an Image or a View, so the caller's style must apply to
  // both; the cast at the Image call site reflects that shared subset.
  style?: StyleProp<ViewStyle>;
}

export default function Avatar({ photoURL, initials, seed, size, style }: AvatarProps) {
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (photoURL) {
    return (
      <Image
        source={{ uri: photoURL }}
        style={[circle, style] as StyleProp<ImageStyle>}
      />
    );
  }

  return (
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
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '800' },
});
