import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { cardBorderArtSource, type CardBorder } from '../theme/cardBorders';

/**
 * Wraps a profile picture in a premium frame.
 *
 * Avatar frames are OVERLAYS, not nine-slices: the target is a circle, so the
 * whole square asset scales uniformly over it and there is no band to stretch.
 * That also means a frame drawn for an avatar can never be reused on a card
 * (and vice versa) — hence `kind` on the border spec.
 *
 * The art is drawn OVER the photo rather than around it, so the frame can
 * legitimately overlap the photo's edge — which is what makes laurels, chains
 * and notches read as jewellery instead of as a plain ring.
 *
 * `overflowPad` gives the art room outside the photo's own circle. Without it
 * a frame whose ornament sits proud of the rim would be clipped by the
 * caller's layout.
 */
export default function AvatarFrame({
  border,
  size,
  children,
}: {
  border: CardBorder | null;
  /** The avatar's diameter in dp — the frame is sized from it. */
  size: number;
  children: React.ReactNode;
}) {
  const source = border ? cardBorderArtSource(border) : null;

  // No frame, or its art is unavailable: render the photo untouched rather
  // than a bare ring, which on a circular avatar reads as a broken image.
  if (!border || !source) return <>{children}</>;

  const overflowPad = Math.round(size * 0.12);
  const frameSize = size + overflowPad * 2;

  return (
    <View style={{ width: size, height: size }}>
      {children}
      <View
        pointerEvents="none"
        style={[
          styles.frameSlot,
          { top: -overflowPad, left: -overflowPad, width: frameSize, height: frameSize },
        ]}
      >
        <FrameArt border={border} source={source} />
      </View>
    </View>
  );
}

/** Split out so the animation hooks only exist for frames that pulse. */
function FrameArt({
  border,
  source,
}: {
  border: CardBorder;
  source: NonNullable<ReturnType<typeof cardBorderArtSource>>;
}) {
  const progress = useSharedValue(1);
  const pulse = border.pulse;

  useEffect(() => {
    if (!pulse) return;
    progress.value = 1;
    progress.value = withRepeat(
      withTiming(pulse.minOpacity, {
        duration: pulse.durationMs / 2,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
  }, [pulse, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse ? progress.value : 1,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frameSlot: { position: 'absolute' },
});
