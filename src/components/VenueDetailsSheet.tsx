import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getOpenStatus, WEEK_ORDER } from '../utils/openStatus';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { VenueWithId } from '../types';

interface VenueDetailsSheetProps {
  venue: VenueWithId | null;
  onClose: () => void;
}

function openUrl(url: string) {
  Linking.openURL(url).catch((error) =>
    console.warn('[VenueDetailsSheet] could not open url:', error)
  );
}

// Creator-webapp signup, used by the claim CTA on auto-created venue cards.
// The Foursquare place ID rides along so the owner lands on signup with their
// venue already selected instead of searching for their own bar. Unset ⇒ the
// CTA is hidden rather than opening a broken link.
const CLAIM_BASE_URL = process.env.EXPO_PUBLIC_CREATOR_CLAIM_URL;

function claimUrl(placeId: string): string | null {
  if (!CLAIM_BASE_URL) return null;
  return `${CLAIM_BASE_URL}${CLAIM_BASE_URL.includes('?') ? '&' : '?'}fsq=${encodeURIComponent(placeId)}`;
}

/** Normalizes a stored social value (full URL or bare handle) into a URL. */
function socialUrl(value: string, base: string): string {
  return /^https?:\/\//i.test(value) ? value : `${base}${value.replace(/^@/, '')}`;
}

/**
 * The swipe-up "About this place" popup: everything the venue owner entered
 * that isn't on the card front — description, contact & socials, weekly
 * trading hours (today highlighted), full address, all categories.
 */
export default function VenueDetailsSheet({ venue, onClose }: VenueDetailsSheetProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const translateY = useSharedValue(0);
  const dragPan = Gesture.Pan()
    .onChange((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (translateY.value > 110 || event.velocityY > 900) {
        runOnJS(onClose)();
        translateY.value = 0;
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!venue) {
    return <Modal visible={false} transparent onRequestClose={onClose} />;
  }

  const openStatus = getOpenStatus(venue.hours);
  const categories = (venue.categories?.length ? venue.categories : [venue.category]).filter(
    Boolean
  );
  const todayKey = WEEK_ORDER[(new Date().getDay() + 6) % 7];
  const { socialLinks } = venue;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.backdropWrap}>
          <Pressable style={styles.backdrop} onPress={onClose} />

          <Animated.View style={[styles.sheet, sheetStyle]}>
            <GestureDetector gesture={dragPan}>
              <View style={styles.handleZone}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.aboutLabel}>About this place</Text>
              <Text style={styles.name}>{venue.name}</Text>

              <View style={styles.badgeRow}>
                {openStatus.state !== 'unknown' && (
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          openStatus.state === 'open'
                            ? 'rgba(45, 212, 191, 0.15)'
                            : 'rgba(248, 113, 113, 0.15)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        { color: openStatus.state === 'open' ? colors.like : colors.nope },
                      ]}
                    >
                      {openStatus.state === 'open' ? 'Open now' : 'Closed'}
                      {openStatus.detail ? ` · ${openStatus.detail}` : ''}
                    </Text>
                  </View>
                )}
                {categories.map((category) => (
                  <View key={category} style={styles.categoryChip}>
                    <Text style={styles.categoryChipText}>{category}</Text>
                  </View>
                ))}
              </View>

              {venue.tagline ? <Text style={styles.tagline}>“{venue.tagline}”</Text> : null}

              {/* Auto-created listing with no owner yet — the claim funnel.
                  Framed as the upside an owner is missing (photos, hours,
                  offers), not as a knock on the venue: these are real named
                  businesses that never opted in, and the contrast with a
                  fully-built claimed card is motivation enough. */}
              {venue.autoCreated && claimUrl(venue.placeId) ? (
                <View style={styles.claimCard}>
                  <View style={styles.claimHeaderRow}>
                    <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
                    <Text style={styles.claimTitle}>This venue hasn’t been claimed</Text>
                  </View>
                  <Text style={styles.claimBody}>
                    Listing auto-generated from public place data. The owner can add photos,
                    trading hours, offers and a custom card.
                  </Text>
                  <Pressable
                    style={styles.claimButton}
                    onPress={() => {
                      const url = claimUrl(venue.placeId);
                      if (url) openUrl(url);
                    }}
                  >
                    <Text style={styles.claimButtonText}>Own this business? Claim it</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : null}

              <Section title="Description" styles={styles}>
                <Text style={styles.bodyText}>
                  {venue.description || 'No description available yet.'}
                </Text>
              </Section>

              <Section title="Contact & Socials" styles={styles}>
                {venue.phone ? (
                  <Pressable style={styles.linkRow} onPress={() => openUrl(`tel:${venue.phone}`)}>
                    <Ionicons name="call-outline" size={18} color={colors.primary} />
                    <Text style={styles.linkText}>{venue.phone}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.emptyText}>No phone added</Text>
                )}
                {venue.website ? (
                  <Pressable
                    style={styles.linkRow}
                    onPress={() =>
                      openUrl(
                        /^https?:\/\//i.test(venue.website)
                          ? venue.website
                          : `https://${venue.website}`
                      )
                    }
                  >
                    <Ionicons name="globe-outline" size={18} color={colors.primary} />
                    <Text style={styles.linkText}>
                      {venue.website.replace(/^https?:\/\//i, '')}
                    </Text>
                  </Pressable>
                ) : null}
                <View style={styles.socialRow}>
                  {socialLinks?.instagram ? (
                    <Pressable
                      style={styles.socialButton}
                      onPress={() =>
                        openUrl(socialUrl(socialLinks.instagram, 'https://instagram.com/'))
                      }
                    >
                      <Ionicons name="logo-instagram" size={18} color={colors.primary} />
                      <Text style={styles.socialText}>Instagram</Text>
                    </Pressable>
                  ) : null}
                  {socialLinks?.tiktok ? (
                    <Pressable
                      style={styles.socialButton}
                      onPress={() =>
                        openUrl(socialUrl(socialLinks.tiktok, 'https://tiktok.com/@'))
                      }
                    >
                      <Ionicons name="logo-tiktok" size={18} color={colors.primary} />
                      <Text style={styles.socialText}>TikTok</Text>
                    </Pressable>
                  ) : null}
                  {socialLinks?.facebook ? (
                    <Pressable
                      style={styles.socialButton}
                      onPress={() =>
                        openUrl(socialUrl(socialLinks.facebook, 'https://facebook.com/'))
                      }
                    >
                      <Ionicons name="logo-facebook" size={18} color={colors.primary} />
                      <Text style={styles.socialText}>Facebook</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Section>

              <Section title="Trading Hours" styles={styles}>
                {venue.hours ? (
                  WEEK_ORDER.map((day) => {
                    const dayHours = venue.hours[day];
                    const isToday = day === todayKey;
                    return (
                      <View key={day} style={styles.hoursRow}>
                        <Text style={[styles.hoursDay, isToday && styles.hoursToday]}>
                          {day}
                        </Text>
                        <Text style={[styles.hoursTime, isToday && styles.hoursToday]}>
                          {dayHours?.closed
                            ? 'Closed'
                            : dayHours?.open
                              ? `${dayHours.open} – ${dayHours.close}`
                              : 'TBD'}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.emptyText}>Hours will be displayed here</Text>
                )}
              </Section>

              <Section title="Address" styles={styles}>
                <View style={styles.linkRow}>
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                  <Text style={styles.bodyText}>{venue.address || 'Address coming soon'}</Text>
                </View>
              </Section>
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Section({
  title,
  styles,
  children,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    backdropWrap: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(10, 5, 8, 0.55)',
    },
    sheet: {
      maxHeight: '85%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    handleZone: { alignItems: 'center', paddingVertical: 12 },
    handle: {
      width: 96,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.borderStrong,
    },
    scroll: { flexGrow: 0 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

    aboutLabel: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    name: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 6 },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    statusBadgeText: { fontSize: 13, fontWeight: '700' },
    categoryChip: {
      backgroundColor: colors.chipActiveBg,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    categoryChipText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    tagline: {
      color: colors.textMuted,
      fontSize: 15,
      fontStyle: 'italic',
      marginTop: 14,
      lineHeight: 21,
    },

    claimCard: {
      marginTop: 18,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 8,
    },
    claimHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    claimTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    claimBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
    claimButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
      paddingVertical: 11,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    claimButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

    section: { marginTop: 26 },
    sectionTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 10,
    },
    bodyText: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      flex: 1,
    },
    emptyText: { color: colors.textFaint, fontSize: 14, fontStyle: 'italic' },

    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    linkText: { color: colors.text, fontSize: 15, fontWeight: '600' },
    socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
    socialButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    socialText: { color: colors.text, fontSize: 14, fontWeight: '600' },

    hoursRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 5,
    },
    hoursDay: {
      color: colors.textMuted,
      fontSize: 14,
      textTransform: 'capitalize',
    },
    hoursTime: { color: colors.textMuted, fontSize: 14 },
    hoursToday: { color: colors.text, fontWeight: '700' },
  });
