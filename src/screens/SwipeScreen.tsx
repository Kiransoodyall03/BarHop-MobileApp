import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import BarHopLogo from '../components/BarHopLogo';
import SwipeDeck, { type SwipeDeckHandle } from '../components/SwipeDeck';
import MatchModal from '../components/MatchModal';
import VenueDetailsSheet from '../components/VenueDetailsSheet';
import VenueFiltersModal from '../components/VenueFiltersModal';
import ProUpsellModal from '../components/ProUpsellModal';
import OutOfSwipesModal, { SWIPES_PER_REWARD } from '../ads/OutOfSwipesModal';
import { injectAdCards } from '../ads/injectAds';
import { useAuth } from '../context/AuthContext';
import { useSquad } from '../context/SquadContext';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import {
  fetchDeckVenues,
  fetchPublishedVenues,
  fetchSwipedVenueIds,
} from '../services/venueService';
import {
  recordSwipe,
  recordVenueClickThrough,
  recordSquadSwipeActivity,
  undoSwipeRecord,
} from '../services/swipeService';
import {
  recordSquadSwipe,
  removeSquadLike,
  updateSquadFilters,
} from '../services/squadService';
import { applyProFilters, countActiveFilters, normalizeFilters } from '../utils/venueFilters';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  EMPTY_FILTERS,
  type DeckItem,
  type SwipeDirection,
  type VenueFilters,
  type VenueWithId,
} from '../types';

// Clearance between the deck's bottom edge and the action buttons row.
const ACTION_BUTTON_CLEARANCE = 86;

// Free-tier session budget. Venue swipes decrement it (solo AND squad);
// ad-card dismissals never do. Resets on app restart. Pro/Elite: unlimited.
const FREE_SWIPES_PER_SESSION = 15;

export default function SwipeScreen() {
  const { user, profile } = useAuth();
  const { squad, squadId, isInSquad, isHost, matchedVenueIds } = useSquad();
  const {
    showAds,
    hasUnlimitedSwipes,
    canRewind,
    upgradeCtaLabel,
  } = useConsumerSubscription();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const deckRef = useRef<SwipeDeckHandle>(null);

  const [deck, setDeck] = useState<DeckItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allSwiped, setAllSwiped] = useState(false);
  // Swipe-up "About this place" sheet.
  const [detailsVenue, setDetailsVenue] = useState<VenueWithId | null>(null);
  const warnedWriteFailure = useRef(false);

  // ── Deck filters ───────────────────────────────────────────────────────────
  // Solo: personal/local. Squad: the HOST's filters stored on the squad doc,
  // inherited live by every member so decks stay identical for consensus.
  const [soloFilters, setSoloFilters] = useState<VenueFilters>(EMPTY_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);

  // Pre-fill the solo deck's dietary filter from the user's saved profile
  // preference — ONCE, and only if they haven't already set a dietary filter
  // this session. After that it's fully editable (edits and clears stick), so
  // it's a starting point, not a lock. Squad decks use the host's filters.
  const seededDietary = useRef(false);
  useEffect(() => {
    if (seededDietary.current) return;
    const prefs = profile?.dietaryPreferences;
    if (prefs && prefs.length > 0) {
      seededDietary.current = true;
      setSoloFilters((f) => (f.dietary.length ? f : { ...f, dietary: prefs }));
    }
  }, [profile?.dietaryPreferences]);

  const activeFilters = isInSquad ? normalizeFilters(squad?.filters) : soloFilters;
  // Reload key: changes ONLY when the applied filters change (a squad's likes
  // updates must not churn the deck).
  const filtersKey = useMemo(() => JSON.stringify(activeFilters), [activeFilters]);
  const locationKey = profile?.location
    ? `${profile.location.latitude},${profile.location.longitude}`
    : 'none';

  // ── Free-tier swipe budget + rewarded gateway ─────────────────────────────
  const [remainingSwipes, setRemainingSwipes] = useState(FREE_SWIPES_PER_SESSION);
  const [swipesModalVisible, setSwipesModalVisible] = useState(false);
  const outOfSwipes = !hasUnlimitedSwipes && remainingSwipes <= 0;

  useEffect(() => {
    if (!hasUnlimitedSwipes && remainingSwipes === 0) setSwipesModalVisible(true);
  }, [remainingSwipes, hasUnlimitedSwipes]);

  // ── Pro Rewind ────────────────────────────────────────────────────────────
  const [lastSwiped, setLastSwiped] = useState<{
    venue: VenueWithId;
    direction: SwipeDirection;
    inSquad: boolean;
  } | null>(null);
  const [upsell, setUpsell] = useState<{ title: string; message: string } | null>(null);

  // Match celebration state — driven by the squad listener so EVERY member's
  // device fires the modal, not just the final swiper's.
  const [matchVenue, setMatchVenue] = useState<VenueWithId | null>(null);
  // Venues whose details sheet has already been counted this session. Without
  // this, swiping up on the same card repeatedly inflates the owner's "Profile
  // Expansions" KPI into meaninglessness.
  const countedClickThroughsRef = useRef<Set<string>>(new Set());
  const seenMatchesRef = useRef<Set<string>>(new Set());
  const seededSquadRef = useRef<string | null>(null);

  const loadDeck = useCallback(async () => {
    if (!user) return;
    setDeck(null);
    setLoadError(null);
    setAllSwiped(false);
    setLastSwiped(null);
    try {
      let venues: VenueWithId[];
      if (isInSquad) {
        // Squad mode: identical deck for every member (host filters applied
        // below, same for everyone) — personal history does not apply.
        //
        // Deliberately owner-created venues ONLY: auto-created stubs are
        // resolved from the viewer's own district, and squad members routinely
        // plan a night out from opposite sides of the city. Passing each
        // member's location here would hand them different decks and silently
        // break consensus matching (a venue only matches when EVERY member
        // right-swipes it — impossible if some never see the card). Enabling
        // stubs for squads needs the HOST's district stored on the squad doc,
        // the same way `filters` already is.
        venues = await fetchPublishedVenues();
      } else {
        const [allVenues, swipedIds] = await Promise.all([
          fetchDeckVenues(profile?.location ?? null),
          fetchSwipedVenueIds(user.uid),
        ]);
        // Solo mode: never show a card the user has already swiped on.
        venues = allVenues.filter((venue) => !swipedIds.has(venue.id));
      }
      // Distance is the ONE filter that depends on the viewer's own location,
      // so in a squad it must be skipped: applying the host's maxDistanceKm
      // against each member's location would filter the shared deck differently
      // per member and break consensus (same reason the deck is owner-only
      // above). Genre/dress/cover are venue properties — identical for everyone
      // — so they still apply. Honoring distance in a squad needs the host's
      // location on the squad doc; deferred with that enhancement.
      const filterLocation = isInSquad ? null : profile?.location ?? null;
      const filtered = applyProFilters(
        venues,
        JSON.parse(filtersKey) as VenueFilters,
        filterLocation
      );
      // Ads: skipped entirely for Pro/Elite (showAds false) and in Expo Go.
      setDeck(injectAdCards(filtered, 8, showAds));
    } catch (error) {
      console.warn('[SwipeScreen] failed to load venues:', error);
      setLoadError('Could not load venues. Check your connection and try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isInSquad, filtersKey, showAds, locationKey]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  // Watch for freshly-completed consensus. The first snapshot of a squad seeds
  // the seen-set so pre-existing matches don't replay after an app restart.
  useEffect(() => {
    if (!squadId || !squad) {
      seededSquadRef.current = null;
      seenMatchesRef.current = new Set();
      return;
    }
    if (seededSquadRef.current !== squadId) {
      seededSquadRef.current = squadId;
      seenMatchesRef.current = new Set(matchedVenueIds);
      return;
    }
    const fresh = matchedVenueIds.find((id) => !seenMatchesRef.current.has(id));
    if (fresh) {
      matchedVenueIds.forEach((id) => seenMatchesRef.current.add(id));
      const matchedItem = deck?.find(
        (item): item is Extract<DeckItem, { kind: 'venue' }> =>
          item.kind === 'venue' && item.venue.id === fresh
      );
      if (matchedItem) setMatchVenue(matchedItem.venue);
    }
  }, [squadId, squad, matchedVenueIds, deck]);

  // Opening the details sheet IS the "profile expansion" the B2B dashboard
  // reports. Counted once per venue per session, and never allowed to block the
  // sheet from opening.
  const openVenueDetails = useCallback((venue: VenueWithId) => {
    setDetailsVenue(venue);
    if (countedClickThroughsRef.current.has(venue.id)) return;
    countedClickThroughsRef.current.add(venue.id);
    void recordVenueClickThrough(venue.id);
  }, []);

  const handleSwiped = useCallback(
    (item: DeckItem, direction: SwipeDirection) => {
      // Ad cards: dismissal only. No Firestore writes, no ad SDK interaction,
      // and it never costs the user a swipe.
      if (item.kind === 'ad') return;
      if (!user) return;

      const venue = item.venue;
      setLastSwiped({ venue, direction, inSquad: isInSquad });

      const onWriteError = (error: unknown) => {
        console.warn('[SwipeScreen] failed to record swipe:', error);
        if (
          !warnedWriteFailure.current &&
          (error as { code?: string })?.code === 'permission-denied'
        ) {
          warnedWriteFailure.current = true;
          Alert.alert(
            'Swipe not recorded',
            'Firestore rejected the write — the security rules need to allow this. See firestore.rules.example in the project root.'
          );
        }
      };

      // Fire-and-forget: the gesture must never wait on the network.
      if (isInSquad && squadId) {
        // Venue analytics still count squad activity; personal history doesn't.
        recordSquadSwipeActivity(venue.id, direction).catch(onWriteError);
        if (direction === 'right') {
          // The listener effect above raises the match modal for everyone.
          recordSquadSwipe(squadId, venue.id, user.uid).catch(onWriteError);
        }
      } else {
        recordSwipe(user.uid, venue.id, direction).catch(onWriteError);
      }

      // Free-tier budget (venue swipes only); Pro/Elite are unlimited.
      if (!hasUnlimitedSwipes) {
        setRemainingSwipes((current) => Math.max(0, current - 1));
      }
    },
    [user, isInSquad, squadId, hasUnlimitedSwipes]
  );

  function handleRewind() {
    if (!lastSwiped) return; // nothing cached — safe no-op
    if (!canRewind) {
      setUpsell({
        title: 'Rewind that swipe',
        message: 'Accidental left-swipe? Pro members get unlimited do-overs.',
      });
      return;
    }
    if (!deckRef.current?.rewind()) return;
    setAllSwiped(false); // rewinding out of an exhausted deck revives it

    // Undo the swipe's side-effects (venue analytics deliberately stay).
    const { venue, direction, inSquad } = lastSwiped;
    if (user) {
      if (inSquad && squadId) {
        if (direction === 'right') {
          removeSquadLike(squadId, venue.id, user.uid).catch((error) =>
            console.warn('[SwipeScreen] failed to undo squad like:', error)
          );
        }
      } else {
        undoSwipeRecord(user.uid, venue.id).catch((error) =>
          console.warn('[SwipeScreen] failed to undo swipe record:', error)
        );
      }
    }
    setLastSwiped(null);
  }

  function handleApplyFilters(filters: VenueFilters) {
    if (isInSquad) {
      if (isHost && squadId) {
        updateSquadFilters(squadId, filters).catch((error) =>
          console.warn('[SwipeScreen] failed to update squad filters:', error)
        );
      }
    } else {
      setSoloFilters(filters);
    }
  }

  if (!deck) {
    return (
      <View style={[styles.centered, { paddingBottom: tabBarHeight }]}>
        {loadError ? (
          <>
            <Text style={styles.emptyTitle}>Something went wrong</Text>
            <Text style={styles.emptySubtitle}>{loadError}</Text>
            <Pressable style={styles.retryButton} onPress={loadDeck}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Finding tonight&apos;s spots…</Text>
          </>
        )}
      </View>
    );
  }

  const deckExhausted = allSwiped || deck.length === 0;
  const activeFilterCount = countActiveFilters(activeFilters);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <BarHopLogo width={104} />
        <View style={styles.headerPills}>
          {!hasUnlimitedSwipes && remainingSwipes <= 5 && (
            <View style={[styles.pill, outOfSwipes && styles.pillAlert]}>
              <Text style={styles.pillText}>🔥 {remainingSwipes} left</Text>
            </View>
          )}
          {isInSquad && squad ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                🍻 Squad · {squad.members.length}{' '}
                {squad.members.length === 1 ? 'member' : 'members'}
              </Text>
            </View>
          ) : null}
          <Pressable style={styles.filterButton} onPress={() => setFiltersVisible(true)}>
            <Ionicons name="options-outline" size={18} color={colors.text} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/*
        The deck is ALWAYS mounted (below the loading guard) so it keeps its
        internal card position. The out-of-swipes and exhausted states render as
        overlays ON TOP — a full-cover View that captures touches, freezing the
        deck without unmounting it. Previously the out-of-swipes case swapped the
        whole deck out; remounting after the rewarded ad reset the position to 0
        and replayed already-swiped cards.
      */}
      <View
        style={[
          styles.deckArea,
          {
            marginTop: insets.top + 52,
            marginBottom: tabBarHeight + ACTION_BUTTON_CLEARANCE,
          },
        ]}
      >
        <SwipeDeck
          ref={deckRef}
          items={deck}
          onSwiped={handleSwiped}
          onDeckEmpty={() => setAllSwiped(true)}
          onSwipeUp={openVenueDetails}
        />
      </View>

      {outOfSwipes ? (
        // Budget exhausted — overlay blocks swiping (and hides the action
        // buttons) while the deck stays mounted behind it, so watching an ad
        // resumes from the next unseen card instead of the start.
        <View style={[styles.emptyOverlay, { paddingBottom: tabBarHeight }]}>
          <Text style={styles.emptyEmoji}>🥃</Text>
          <Text style={styles.emptyTitle}>You&apos;re out of swipes</Text>
          <Text style={styles.emptySubtitle}>
            Watch a quick ad for {SWIPES_PER_REWARD} more swipes, or go unlimited with Pro.
          </Text>
          <Pressable style={styles.retryButton} onPress={() => setSwipesModalVisible(true)}>
            <Text style={styles.retryButtonText}>Get More Swipes</Text>
          </Pressable>
        </View>
      ) : deckExhausted ? (
        <View style={[styles.emptyOverlay, { paddingBottom: tabBarHeight }]}>
          <Text style={styles.emptyEmoji}>🌙</Text>
          <Text style={styles.emptyTitle}>No more venues tonight</Text>
          <Text style={styles.emptySubtitle}>
            {activeFilterCount > 0
              ? 'Nothing else matches the current filters. Loosen them or check back later.'
              : isInSquad
                ? "Your squad has seen every spot in town. Fingers crossed a match landed."
                : "You've seen every spot in town. Check back soon — new venues join BarHop all the time."}
          </Text>
          <Pressable style={styles.retryButton} onPress={loadDeck}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </Pressable>
          {lastSwiped && (
            <Pressable style={styles.rewindLink} onPress={handleRewind}>
              <Ionicons name="arrow-undo" size={16} color={colors.accent} />
              <Text style={styles.rewindLinkText}>Rewind last swipe</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={[styles.actions, { bottom: tabBarHeight + 12 }]}>
          {/* Pro Rewind — gold, visually distinct, disabled with no cache */}
          <Pressable
            style={[
              styles.actionButton,
              styles.actionRewind,
              !lastSwiped && styles.actionDisabled,
            ]}
            onPress={handleRewind}
            disabled={!lastSwiped}
          >
            <Ionicons name="arrow-undo" size={24} color={colors.accent} />
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.actionNope]}
            onPress={() => deckRef.current?.swipeLeft()}
          >
            <Text style={[styles.actionIcon, { color: colors.nope }]}>✕</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.actionLike]}
            onPress={() => deckRef.current?.swipeRight()}
          >
            <Text style={[styles.actionIcon, { color: colors.like }]}>♥</Text>
          </Pressable>
        </View>
      )}

      <VenueDetailsSheet venue={detailsVenue} onClose={() => setDetailsVenue(null)} />

      <VenueFiltersModal
        visible={filtersVisible}
        initialFilters={activeFilters}
        readOnly={isInSquad && !isHost}
        hasLocation={!!profile?.location}
        onApply={handleApplyFilters}
        onClose={() => setFiltersVisible(false)}
      />

      <ProUpsellModal
        visible={!!upsell}
        title={upsell?.title}
        message={upsell?.message}
        ctaLabel={upgradeCtaLabel}
        source="rewind"
        onClose={() => setUpsell(null)}
      />

      <OutOfSwipesModal
        visible={swipesModalVisible}
        onClose={() => setSwipesModalVisible(false)}
        onRewardEarned={() => {
          setRemainingSwipes((current) => current + SWIPES_PER_REWARD);
          setSwipesModalVisible(false);
        }}
      />

      <MatchModal
        venue={matchVenue}
        memberCount={squad?.members.length ?? 0}
        onDismiss={() => setMatchVenue(null)}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      position: 'absolute',
      left: 20,
      right: 20,
      zIndex: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerPills: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pill: {
      backgroundColor: colors.chipActiveBg,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    pillAlert: { borderColor: colors.nope },
    pillText: { color: colors.text, fontSize: 12, fontWeight: '700' },
    filterButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    filterBadgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '800' },

    deckArea: {
      flex: 1,
      marginHorizontal: 16,
    },

    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      backgroundColor: colors.background,
    },
    emptyOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      backgroundColor: colors.background,
    },
    loadingText: { color: colors.textMuted, marginTop: 16, fontSize: 15 },
    emptyEmoji: { fontSize: 56, marginBottom: 16 },
    emptyTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptySubtitle: {
      color: colors.textMuted,
      fontSize: 15,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 22,
    },
    retryButton: {
      marginTop: 24,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingHorizontal: 28,
      paddingVertical: 13,
    },
    retryButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    rewindLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 18,
    },
    rewindLinkText: { color: colors.accent, fontSize: 15, fontWeight: '700' },

    actions: {
      position: 'absolute',
      left: 0,
      right: 0,
      zIndex: 10,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 26,
    },
    actionButton: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.actionButtonBg,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionRewind: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderColor: colors.accent,
    },
    actionDisabled: { opacity: 0.35 },
    actionNope: { borderColor: colors.nope },
    actionLike: { borderColor: colors.like },
    actionIcon: { fontSize: 26, fontWeight: '700' },
  });
