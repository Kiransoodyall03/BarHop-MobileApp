import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  type ImageSourcePropType,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import VibeCheckBadge from './VibeCheckBadge';
import NineSliceFrame from './NineSliceFrame';
import {
  cardBorderArtSource,
  cardBorderShadowStyle,
  gradientPoints,
  type CardBorder,
} from '../theme/cardBorders';
import { useCardBorder } from '../services/borderCatalogService';
import { useDistanceLabel } from '../hooks/useDistanceLabel';
import { getOpenStatus } from '../utils/openStatus';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { VenueWithId } from '../types';

interface MediaItem {
  type: 'image' | 'video';
  src: string;
}

/** Outer corner radius of the swipe card. Premium frames hug this value. */
const CARD_RADIUS = 24;

/**
 * Border chrome is theme-INDEPENDENT: every treatment's colours come from the
 * registry (they are brand artwork, not semantic tokens), so these styles live
 * outside createStyles and are shared by all three shell variants.
 */
const shellStyles = StyleSheet.create({
  shell: { flex: 1 },
});

/**
 * Full-bleed venue card, front face only (details live in VenueDetailsSheet):
 * stories-style media stack (all images + the venue video as the final slide,
 * tap left third = back / elsewhere = forward), live Open/Closed badge,
 * name (+ verified check), categories, address, and distance from the user.
 */
export default function VenueCard({ venue }: { venue: VenueWithId }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const media: MediaItem[] = [
    ...(venue.images ?? []).map((src): MediaItem => ({ type: 'image', src })),
    ...(venue.video ? [{ type: 'video' as const, src: venue.video }] : []),
  ];
  const mediaCount = media.length;

  const [mediaIndex, setMediaIndex] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  // Clamp instead of syncing state: the deck recycles this component across
  // venues with different media counts.
  const safeIndex = mediaIndex < mediaCount ? mediaIndex : 0;
  const activeMedia = media[safeIndex];

  function handleTap(event: GestureResponderEvent) {
    if (mediaCount < 2 || cardWidth === 0) return;
    const isLeftThird = event.nativeEvent.locationX < cardWidth / 3;
    setMediaIndex(
      isLeftThird ? (safeIndex - 1 + mediaCount) % mediaCount : (safeIndex + 1) % mediaCount
    );
  }

  // Both sides can be empty: a venue whose source tags mapped to nothing
  // carries no category at all (see Venue.category), and renders no chips.
  const chips = (venue.categories?.length ? venue.categories : [venue.category])
    .filter((chip): chip is string => Boolean(chip))
    .slice(0, 3);
  const openStatus = getOpenStatus(venue.hours);
  const distanceLabel = useDistanceLabel(venue);

  const overlay = (
    <>
      {/* Stories-style progress segments */}
      {mediaCount > 0 && (
        <View style={styles.progressRow} pointerEvents="none">
          {media.map((item, index) => (
            <View
              key={`${item.src}-${index}`}
              style={[styles.progressSegment, index === safeIndex && styles.progressActive]}
            />
          ))}
        </View>
      )}

      {/* Live "Vibe Check" telemetry (Pro) — top-right, under the progress bar */}
      <View style={styles.vibeCheckSlot} pointerEvents="none">
        <VibeCheckBadge venue={venue} />
      </View>

      <View style={styles.bottomArea} pointerEvents="none">
        <View style={styles.swipeHint}>
          <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.75)" />
          <Text style={styles.swipeHintText}>Swipe up for details</Text>
        </View>

        <LinearGradient
          // Photo scrim stays dark in both themes — overlay text is always white.
          colors={['transparent', 'rgba(10, 5, 8, 0.62)', 'rgba(10, 5, 8, 0.94)']}
          style={styles.cardGradient}
        >
          <View style={styles.nameRow}>
            <Text style={styles.venueName} numberOfLines={2}>
              {venue.name}
            </Text>
            {/* venues/{id}.verified — written by the Creator webapp once an
                owner clears Paystack KYB. Gold rather than the theme accent:
                the photo scrim is always dark, so overlay chrome is
                theme-independent (see the gradient note below). */}
            {venue.verified && (
              <Ionicons
                name="checkmark-circle"
                size={19}
                color="#FFB84D"
                style={styles.verifiedBadge}
              />
            )}
          </View>

          <View style={styles.chipRow}>
            {chips.map((chip) => (
              <View key={chip} style={styles.chip}>
                <Text style={styles.chipText}>{chip}</Text>
              </View>
            ))}
            {/* Auto-created from the district cache — no owner has built a
                card yet, so there are no photos, hours, or offers to show. */}
            {venue.autoCreated && (
              <View style={styles.unclaimedChip}>
                <Ionicons name="sparkles-outline" size={12} color="rgba(255,255,255,0.9)" />
                <Text style={styles.unclaimedText}>Unclaimed</Text>
              </View>
            )}
          </View>

          <View style={styles.statusRow}>
            {openStatus.state !== 'unknown' ? (
              <View
                style={[
                  styles.statusBadge,
                  openStatus.state === 'open' ? styles.statusOpen : styles.statusClosed,
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: openStatus.state === 'open' ? colors.like : colors.nope },
                  ]}
                />
                <Text style={styles.statusText}>
                  {openStatus.state === 'open' ? 'Open now' : 'Closed'}
                  {openStatus.detail ? ` · ${openStatus.detail}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={styles.statusUnknown}>Hours TBD</Text>
            )}
            {distanceLabel && <Text style={styles.distance}>{distanceLabel}</Text>}
          </View>

          <Text style={styles.address} numberOfLines={1}>
            📍 {venue.address}
          </Text>
        </LinearGradient>
      </View>
    </>
  );

  // venues/{id}.cardBorderStyle — the premium treatment the owner bought in the
  // Creator webapp. Unknown/absent keys resolve to the plain shell.
  // Resolved from the LIVE catalog, so frame art published in the Border
  // Studio appears without an app release.
  const border = useCardBorder(venue.cardBorderStyle);
  // null when the border has no art, or when its asset was never registered in
  // ART_SOURCES — either way the flat ring below is what renders.
  const artSource = cardBorderArtSource(border);
  const hasArt = artSource !== null && border.artwork !== null;
  const cardRadius = border.gradient ? CARD_RADIUS - border.ring.width : CARD_RADIUS;

  return (
    <CardBorderShell border={border} artSource={artSource}>
      <View
        style={[
          styles.card,
          {
            borderRadius: cardRadius,
            // A gradient ring IS the wrapper's padding and frame art draws its
            // own edge, so neither may have a second flat border under it.
            borderWidth: border.gradient || hasArt ? 0 : border.ring.width,
            borderColor: border.ring.color,
          },
        ]}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
      >
        <Pressable style={styles.media} onPress={handleTap}>
          {activeMedia ? (
            activeMedia.type === 'video' ? (
              <View style={styles.mediaFill}>
                <CardVideo uri={activeMedia.src} />
                {overlay}
              </View>
            ) : (
              <ImageBackground
                source={{ uri: activeMedia.src }}
                style={styles.mediaFill}
                resizeMode="cover"
              >
                {overlay}
              </ImageBackground>
            )
          ) : (
            <View style={[styles.mediaFill, styles.mediaFallback]}>
              <Text style={styles.fallbackEmoji}>🍸</Text>
              {overlay}
            </View>
          )}
        </Pressable>
      </View>
      {/* Frame art draws its own edge — a flat pulsing ring on top of it would
          read as a rendering fault, so pulse is generated-treatments only. */}
      {!hasArt && <PulseRing border={border} radius={cardRadius} />}
    </CardBorderShell>
  );
}

/**
 * Paints the premium border AROUND the card.
 *
 * The glow cannot live on the card itself: the card sets `overflow: 'hidden'`
 * to clip its rounded media, and iOS drops a view's shadow when that same view
 * clips. So the shadow rides on this wrapper, and a gradient ring is drawn as
 * this wrapper's padded background — the only way to stroke a gradient that
 * follows a corner radius on both platforms.
 */
function CardBorderShell({
  border,
  artSource,
  children,
}: {
  border: CardBorder;
  artSource: ImageSourcePropType | null;
  children: React.ReactNode;
}) {
  const shadow = cardBorderShadowStyle(border);

  // 1. Hand-drawn frame art wins over every generated treatment.
  if (border.artwork && artSource !== null) {
    return (
      <View style={[shellStyles.shell, shadow, { borderRadius: CARD_RADIUS }]}>
        <NineSliceFrame
          artwork={border.artwork}
          source={artSource}
          radius={CARD_RADIUS}
        >
          {children}
        </NineSliceFrame>
      </View>
    );
  }

  // 2. A gradient ring is drawn as padding, so the card inset by ring.width
  //    leaves exactly the stroke showing.
  if (border.gradient) {
    const { start, end } = gradientPoints(border.gradient.angle);
    return (
      <LinearGradient
        colors={border.gradient.colors as [string, string, ...string[]]}
        start={start}
        end={end}
        style={[
          shellStyles.shell,
          shadow,
          { borderRadius: CARD_RADIUS, padding: border.ring.width },
        ]}
      >
        {children}
      </LinearGradient>
    );
  }

  // 3. Flat ring — drawn by the card itself; this wrapper only carries the glow.
  return (
    <View style={[shellStyles.shell, shadow, { borderRadius: CARD_RADIUS }]}>
      {children}
    </View>
  );
}

/**
 * The breathing ring for pulsing treatments. Deliberately a separate overlay
 * rather than an animation on the card's own border: `shadowOpacity` is not
 * reliably animatable on Android, whereas the opacity of a plain bordered view
 * is, so this renders identically on both platforms.
 *
 * Returns null for every non-pulsing border, so the hook cost is paid only by
 * the (rare) cards that actually pulse.
 */
function PulseRing({ border, radius }: { border: CardBorder; radius: number }) {
  const progress = useSharedValue(1);
  const pulse = border.pulse;
  // A permanently breathing frame is exactly the ambient movement this OS
  // setting exists to stop, so the ring renders static rather than not at all.
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!pulse || reduceMotion) return;
    progress.value = 1;
    progress.value = withRepeat(
      withTiming(pulse.minOpacity, {
        duration: pulse.durationMs / 2,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true // reverse — one withTiming becomes a full breath in and out
    );
  }, [pulse, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!pulse) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        animatedStyle,
        {
          borderRadius: radius,
          borderWidth: border.ring.width,
          borderColor: border.ring.color,
        },
      ]}
    />
  );
}

/** Separate component so the player hook only exists while the slide shows. */
function CardVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // borderRadius / borderWidth / borderColor are applied at the call site
    // from the resolved cardBorderStyle — see CardBorderShell.
    card: {
      flex: 1,
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    media: { flex: 1 },
    mediaFill: { flex: 1, justifyContent: 'flex-end' },
    mediaFallback: {
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
    },
    fallbackEmoji: {
      position: 'absolute',
      top: '38%',
      fontSize: 72,
    },

    progressRow: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      flexDirection: 'row',
      gap: 5,
      zIndex: 5,
    },
    progressSegment: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.35)',
    },
    progressActive: { backgroundColor: '#FFFFFF' },

    vibeCheckSlot: {
      position: 'absolute',
      top: 26,
      right: 14,
      zIndex: 5,
    },

    bottomArea: { width: '100%' },
    swipeHint: {
      alignItems: 'center',
      marginBottom: -6,
      zIndex: 5,
    },
    swipeHintText: {
      color: 'rgba(255, 255, 255, 0.75)',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.4,
    },

    cardGradient: {
      width: '100%',
      paddingHorizontal: 22,
      paddingTop: 46,
      paddingBottom: 24,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
    },
    venueName: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '800',
      letterSpacing: 0.3,
      // Must shrink, not push the badge off-screen, on long two-line names.
      flexShrink: 1,
    },
    // Nudged down to sit on the first line's optical centre, not its box top.
    verifiedBadge: { marginTop: 9 },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    chip: {
      backgroundColor: 'rgba(15, 8, 12, 0.45)',
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    chipText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'capitalize',
    },

    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    statusOpen: { backgroundColor: 'rgba(45, 212, 191, 0.18)' },
    statusClosed: { backgroundColor: 'rgba(248, 113, 113, 0.18)' },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    unclaimedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(15, 8, 12, 0.45)',
      borderColor: 'rgba(255, 255, 255, 0.35)',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    unclaimedText: {
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: 12,
      fontWeight: '600',
    },

    statusUnknown: {
      color: 'rgba(255, 255, 255, 0.6)',
      fontSize: 13,
      fontWeight: '600',
    },
    distance: { color: 'rgba(255, 255, 255, 0.65)', fontSize: 13, fontWeight: '600' },

    address: {
      color: 'rgba(255, 255, 255, 0.82)',
      fontSize: 14,
      lineHeight: 20,
      marginTop: 10,
    },
  });
