import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Avatar from '../components/Avatar';
import ProUpsellModal from '../components/ProUpsellModal';
import { useAuth } from '../context/AuthContext';
import { useSquad } from '../context/SquadContext';
import { useFriends } from '../context/FriendsContext';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { fetchVenuesByIds } from '../services/venueService';
import { addStop, ItineraryLimitError, itineraryKeyFor } from '../services/itineraryService';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { friendUidOf, type VenueWithId } from '../types';
import type { FriendsStackParamList } from '../navigation/MainTabs';

type Props = NativeStackScreenProps<FriendsStackParamList, 'FriendMatches'>;

/**
 * Venues this user and one friend both right-swiped in solo mode.
 *
 * Matches are DERIVED (an intersection computed in FriendsContext), never
 * stored — so there is no match collection to keep in sync, and un-swiping a
 * venue makes its match disappear on its own.
 */
export default function FriendMatchesScreen({ route }: Props) {
  const { friendUid, friendName } = route.params;
  const { user } = useAuth();
  const { squadId, isInSquad } = useSquad();
  const { matchesWith, matchesByVenue, friends } = useFriends();
  const { maxItineraryStops, upgradeCtaLabel } = useConsumerSubscription();
  const tabBarHeight = useBottomTabBarHeight();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [venues, setVenues] = useState<VenueWithId[] | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [upsellVisible, setUpsellVisible] = useState(false);

  const matchedIds = useMemo(() => matchesWith(friendUid), [matchesWith, friendUid]);
  const matchedKey = useMemo(() => [...matchedIds].sort().join(','), [matchedIds]);

  useEffect(() => {
    let cancelled = false;
    if (!matchedIds.length) {
      setVenues([]);
      return;
    }
    setVenues(null);
    fetchVenuesByIds(matchedIds)
      .then((result) => {
        if (!cancelled) setVenues(result);
      })
      .catch((error) => {
        console.warn('[FriendMatchesScreen] venue resolve failed:', error);
        if (!cancelled) setVenues([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedKey]);

  // Names of the OTHER friends who also liked a venue — this is the
  // "you, Ben and Cara all liked X" grouping, built from my own friend list.
  const alsoLikedBy = useCallback(
    (venueId: string): string[] => {
      const uids = (matchesByVenue[venueId] ?? []).filter((uid) => uid !== friendUid);
      return uids.map((uid) => {
        const friendship = friends.find(
          (f) => friendUidOf(f, user?.uid ?? '') === uid
        );
        return friendship?.profiles?.[uid]?.displayName ?? 'a friend';
      });
    },
    [matchesByVenue, friendUid, friends, user]
  );

  async function handleAddToPlan(venue: VenueWithId) {
    if (!user || addingId) return;
    setAddingId(venue.id);
    try {
      await addStop(
        itineraryKeyFor(user.uid, isInSquad ? squadId : null),
        isInSquad ? 'squad' : 'solo',
        venue,
        user.uid,
        maxItineraryStops
      );
      setAddedIds((current) => new Set(current).add(venue.id));
    } catch (error) {
      if (error instanceof ItineraryLimitError) {
        setUpsellVisible(true);
      } else {
        console.warn('[FriendMatchesScreen] add to plan failed:', error);
        Alert.alert('Could not add', 'Check your connection and try again.');
      }
    } finally {
      setAddingId(null);
    }
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 20, paddingBottom: tabBarHeight + 24 }}
      >
        <Text style={styles.intro}>
          {matchedIds.length > 0
            ? `Places you and ${friendName} both swiped right on.`
            : `No matches with ${friendName} yet.`}
        </Text>

        {venues === null ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : venues.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing yet</Text>
            <Text style={styles.emptyText}>
              When you both swipe right on the same place, it lands here.
            </Text>
          </View>
        ) : (
          venues.map((venue) => {
            const others = alsoLikedBy(venue.id);
            const added = addedIds.has(venue.id);
            return (
              <View key={venue.id} style={styles.card}>
                {venue.images?.[0] ? (
                  <Image source={{ uri: venue.images[0] }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Text>🍸</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.venueName} numberOfLines={1}>
                    {venue.name}
                  </Text>
                  <Text style={styles.venueMeta} numberOfLines={1}>
                    {venue.category ? `${venue.category} · ` : ''}
                    {venue.address}
                  </Text>
                  {others.length > 0 && (
                    <Text style={styles.alsoLiked} numberOfLines={1}>
                      ✨ {friendName} and {others.join(', ')} also liked this
                    </Text>
                  )}
                </View>
                <Pressable
                  style={[styles.addButton, added && styles.addButtonDone]}
                  onPress={() => handleAddToPlan(venue)}
                  disabled={added || addingId === venue.id}
                >
                  {addingId === venue.id ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Ionicons
                      name={added ? 'checkmark' : 'add'}
                      size={18}
                      color={added ? colors.like : colors.onPrimary}
                    />
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <ProUpsellModal
        visible={upsellVisible}
        title="Your plan is full"
        message={`Your plan holds ${maxItineraryStops} stops. Upgrade for more room.`}
        ctaLabel={upgradeCtaLabel}
        source="friend-matches"
        onClose={() => setUpsellVisible(false)}
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    intro: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
    },
    thumb: { width: 52, height: 52, borderRadius: 12 },
    thumbFallback: {
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1 },
    venueName: { color: colors.text, fontSize: 15, fontWeight: '700' },
    venueMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
      textTransform: 'capitalize',
    },
    alsoLiked: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 4 },
    addButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonDone: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.like,
    },

    empty: { alignItems: 'center', paddingVertical: 40 },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
    emptyText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 6,
    },
  });
