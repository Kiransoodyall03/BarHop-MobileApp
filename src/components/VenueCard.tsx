import React, { useState } from 'react';
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import VibeCheckBadge from './VibeCheckBadge';
import { getOpenStatus } from '../utils/openStatus';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { VenueWithId } from '../types';

interface MediaItem {
  type: 'image' | 'video';
  src: string;
}

/**
 * Full-bleed venue card, front face only (details live in VenueDetailsSheet):
 * stories-style media stack (all images + the venue video as the final slide,
 * tap left third = back / elsewhere = forward), live Open/Closed badge,
 * name, categories, address, and a distance placeholder.
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

  const chips = (venue.categories?.length ? venue.categories : [venue.category])
    .filter(Boolean)
    .slice(0, 3);
  const openStatus = getOpenStatus(venue.hours);

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
          <Text style={styles.venueName} numberOfLines={2}>
            {venue.name}
          </Text>

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
            {/* Distance placeholder — wired up once venue geocoding lands. */}
            <Text style={styles.distance}>— km away</Text>
          </View>

          <Text style={styles.address} numberOfLines={1}>
            📍 {venue.address}
          </Text>
        </LinearGradient>
      </View>
    </>
  );

  return (
    <View style={styles.card} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
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
    card: {
      flex: 1,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
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
    venueName: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
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
