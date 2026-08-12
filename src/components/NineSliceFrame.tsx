import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import type { BorderArtwork } from '../theme/cardBorders';

/**
 * Draws hand-drawn frame art around its children as a true NINE-SLICE: the
 * four corners keep their aspect ratio, the four edges stretch along their run,
 * and the middle is left transparent for the card underneath.
 *
 * ── Why this is hand-rolled ──────────────────────────────────────────────────
 * React Native has no cross-platform nine-slice. `Image.capInsets` is iOS-only,
 * and Android's `.9.png` support applies to native drawables, not to the JS
 * asset pipeline Expo uses. Rendering one stretched Image instead would smear
 * the corners — exactly the detail hand-drawn frame art exists to show off.
 *
 * ── How it works ─────────────────────────────────────────────────────────────
 * Each of the eight pieces is a clipping View (`overflow: 'hidden'`) holding
 * ONE copy of the whole artwork, scaled and offset so that only the intended
 * region lands inside the window — the classic CSS-sprite technique.
 *
 * Corners scale uniformly by `k = width / slice`, so `slice` source pixels
 * render as `width` dp. Edges use that same scale on their thickness axis but
 * stretch along their length, which is why they get an explicit width/height
 * rather than a uniform scale: source band `[slice, size - slice]` maps onto
 * the full run of that edge.
 *
 * All of it is `pointerEvents="none"` — the frame is decoration over a card
 * that must stay swipeable.
 */
export default function NineSliceFrame({
  artwork,
  source,
  radius,
  children,
}: {
  artwork: BorderArtwork;
  /**
   * Bundled asset (`require()`) or a remote `{ uri }` published from the
   * Border Studio — see cardBorderArtSource in theme/cardBorders.ts.
   */
  source: ImageSourcePropType;
  /** Outer corner radius in dp, so the glow/clip matches the card. */
  radius: number;
  children: React.ReactNode;
}) {
  const { size, slice, width } = artwork;

  // Uniform corner scale: `slice` source px must render as `width` dp.
  const k = width / slice;
  // Full artwork at that scale — what every corner window looks through.
  const artSize = size * k;
  // Where the far-side band starts, in scaled dp.
  const farOffset = (size - slice) * k;

  // The source's stretchable middle band, in source px. A slice >= size/2
  // leaves nothing to stretch, so the frame is refused rather than drawn
  // inside out (the art spec caps slice at 40% of the canvas).
  const bandPx = size - slice * 2;
  if (bandPx <= 0) return <>{children}</>;

  const corner = (top: boolean, left: boolean) => (
    <View
      style={[
        styles.piece,
        { width, height: width },
        top ? { top: 0 } : { bottom: 0 },
        left ? { left: 0 } : { right: 0 },
      ]}
    >
      <Image
        source={source}
        style={{
          position: 'absolute',
          width: artSize,
          height: artSize,
          left: left ? 0 : -farOffset,
          top: top ? 0 : -farOffset,
        }}
        resizeMode="stretch"
      />
    </View>
  );

  /**
   * A horizontal edge. The image is stretched so its middle band fills the run
   * between the two corners; `flex` sizing means the run is only known at
   * layout time, so the image is over-sized proportionally and pulled left by
   * the same ratio, which lands the band exactly in the window at any width.
   */
  const horizontalEdge = (top: boolean) => (
    <View
      style={[
        styles.piece,
        { left: width, right: width, height: width },
        top ? { top: 0 } : { bottom: 0 },
      ]}
    >
      <Image
        source={source}
        style={{
          position: 'absolute',
          // Scale the full canvas so its band covers 100% of this window.
          width: `${(size / bandPx) * 100}%`,
          height: size * k,
          left: `${-(slice / bandPx) * 100}%`,
          top: top ? 0 : -farOffset,
        }}
        resizeMode="stretch"
      />
    </View>
  );

  const verticalEdge = (left: boolean) => (
    <View
      style={[
        styles.piece,
        { top: width, bottom: width, width },
        left ? { left: 0 } : { right: 0 },
      ]}
    >
      <Image
        source={source}
        style={{
          position: 'absolute',
          width: size * k,
          height: `${(size / bandPx) * 100}%`,
          top: `${-(slice / bandPx) * 100}%`,
          left: left ? 0 : -farOffset,
        }}
        resizeMode="stretch"
      />
    </View>
  );

  return (
    <View style={[styles.root, { borderRadius: radius }]}>
      {children}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {corner(true, true)}
        {corner(true, false)}
        {corner(false, true)}
        {corner(false, false)}
        {horizontalEdge(true)}
        {horizontalEdge(false)}
        {verticalEdge(true)}
        {verticalEdge(false)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  piece: { position: 'absolute', overflow: 'hidden' },
});
