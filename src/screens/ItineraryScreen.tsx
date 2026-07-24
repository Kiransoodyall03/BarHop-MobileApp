import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import ProUpsellModal from '../components/ProUpsellModal';
import { useAuth } from '../context/AuthContext';
import { useSquad } from '../context/SquadContext';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import {
  addStop,
  ItineraryLimitError,
  itineraryKeyFor,
  listenToItinerary,
  removeStop,
} from '../services/itineraryService';
import { fetchLikedVenueIds, fetchVenuesByIds } from '../services/venueService';
import { estimateTravel } from '../utils/geo';
import { openInMaps, openInUber } from '../utils/deepLinks';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { Itinerary, ItineraryStop, VenueWithId } from '../types';

// Fallback map center: Johannesburg CBD (launch market).
const DEFAULT_REGION = {
  latitude: -26.2041,
  longitude: 28.0473,
  latitudeDelta: 0.09,
  longitudeDelta: 0.09,
};

export default function ItineraryScreen() {
  const { user, profile } = useAuth();
  const { squadId, isInSquad, matchedVenueIds, squad } = useSquad();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { tier, maxItineraryStops, upgradeCtaLabel } = useConsumerSubscription();

  // The one-itinerary rule: squad plan while in a squad, else personal plan.
  const planKey = user ? itineraryKeyFor(user.uid, isInSquad ? squadId : null) : null;
  const planType: Itinerary['type'] = isInSquad ? 'squad' : 'solo';

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [upsellVisible, setUpsellVisible] = useState(false);
  const [candidates, setCandidates] = useState<VenueWithId[] | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!planKey) return;
    setPlanLoading(true);
    const unsubscribe = listenToItinerary(planKey, (plan) => {
      setItinerary(plan);
      setPlanLoading(false);
    });
    return unsubscribe;
  }, [planKey]);

  // Only CHECK permission (granted during onboarding/profile) — never prompt here.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((permission) => setHasLocationPermission(permission.status === 'granted'))
      .catch(() => {});
  }, []);

  const stops = useMemo(() => itinerary?.stops ?? [], [itinerary]);
  const mappedStops = useMemo(() => stops.filter((stop) => stop.coords), [stops]);
  // Finite for free (3) AND pro (5); Infinity for elite.
  const atCap = stops.length >= maxItineraryStops;

  // Keep every pin (and route) in frame as the plan evolves.
  useEffect(() => {
    if (mappedStops.length === 0) return;
    const coordinates = mappedStops.map((stop) => ({
      latitude: stop.coords!.latitude,
      longitude: stop.coords!.longitude,
    }));
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
        animated: true,
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [mappedStops]);

  const initialRegion = useMemo(() => {
    const first = mappedStops[0]?.coords;
    if (first) {
      return { ...DEFAULT_REGION, latitude: first.latitude, longitude: first.longitude };
    }
    if (profile?.location) {
      return {
        ...DEFAULT_REGION,
        latitude: profile.location.latitude,
        longitude: profile.location.longitude,
      };
    }
    return DEFAULT_REGION;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // initialRegion is only read on first mount

  const openPicker = useCallback(async () => {
    if (!user) return;
    setPickerVisible(true);
    setCandidates(null);
    try {
      const ids = isInSquad ? matchedVenueIds : await fetchLikedVenueIds(user.uid);
      const venues = await fetchVenuesByIds(ids);
      const stopIds = new Set(stops.map((stop) => stop.venueId));
      setCandidates(venues.filter((venue) => !stopIds.has(venue.id)));
    } catch (error) {
      console.warn('[ItineraryScreen] failed to load candidates:', error);
      setCandidates([]);
    }
  }, [user, isInSquad, matchedVenueIds, stops]);

  function handleAddStopPress() {
    if (atCap) {
      setUpsellVisible(true);
      return;
    }
    openPicker();
  }

  async function handleAddVenue(venue: VenueWithId) {
    if (!user || !planKey) return;
    if (atCap) {
      setPickerVisible(false);
      setUpsellVisible(true);
      return;
    }
    setPickerVisible(false);
    try {
      // Cap re-checked inside the transaction: catches races where another
      // squad member filled the plan while this picker was open.
      await addStop(planKey, planType, venue, user.uid, maxItineraryStops);
    } catch (error) {
      if (error instanceof ItineraryLimitError) {
        setUpsellVisible(true);
        return;
      }
      console.warn('[ItineraryScreen] failed to add stop:', error);
    }
  }

  function handleRemove(venueId: string) {
    if (!planKey) return;
    removeStop(planKey, venueId).catch((error) =>
      console.warn('[ItineraryScreen] failed to remove stop:', error)
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Map (top ~60%) ─────────────────────────────────────────────── */}
      <View style={styles.mapArea}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={initialRegion}
          showsUserLocation={hasLocationPermission}
        >
          {mappedStops.map((stop, index) => (
            <Marker
              key={stop.venueId}
              coordinate={{
                latitude: stop.coords!.latitude,
                longitude: stop.coords!.longitude,
              }}
              title={`${index + 1}. ${stop.name}`}
              description={stop.address}
            >
              <View style={styles.pin}>
                <Text style={styles.pinText}>{index + 1}</Text>
              </View>
            </Marker>
          ))}
          {mappedStops.length >= 2 && (
            <Polyline
              coordinates={mappedStops.map((stop) => ({
                latitude: stop.coords!.latitude,
                longitude: stop.coords!.longitude,
              }))}
              strokeColor={colors.primary}
              strokeWidth={3}
              lineDashPattern={[10, 8]}
            />
          )}
        </MapView>

        <View style={[styles.mapHeader, { top: insets.top + 8 }]}>
          <View style={styles.planPill}>
            <Text style={styles.planPillText}>
              {isInSquad
                ? `🍻 Squad plan · ${squad?.members.length ?? 0} members · live`
                : 'Solo plan'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Stop list (bottom ~40%) ────────────────────────────────────── */}
      <View style={styles.listArea}>
        <View style={styles.listHeader}>
          <View>
            <Text style={styles.listTitle}>Tonight&apos;s Plan</Text>
            <Text style={styles.listCount}>
              {stops.length}/{Number.isFinite(maxItineraryStops) ? maxItineraryStops : '∞'} stops
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              atCap && styles.addButtonLocked,
              pressed && styles.dim,
            ]}
            onPress={handleAddStopPress}
          >
            <Ionicons
              name={atCap ? 'lock-closed' : 'add'}
              size={16}
              color={atCap ? colors.textMuted : colors.onPrimary}
            />
            <Text style={[styles.addButtonText, atCap && styles.addButtonTextLocked]}>
              {atCap
                ? `${tier === 'free' ? 'Free' : 'Pro'} plan · ${maxItineraryStops} stops`
                : 'Add Stop'}
            </Text>
          </Pressable>
        </View>

        {planLoading ? (
          <View style={styles.listEmpty}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : stops.length === 0 ? (
          <View style={styles.listEmpty}>
            <Text style={styles.emptyTitle}>No stops yet</Text>
            <Text style={styles.emptyText}>
              {isInSquad
                ? 'Add venues your squad matched on to map out the night.'
                : 'Add venues you swiped right on to map out your night.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {stops.map((stop, index) => (
              <View key={stop.venueId}>
                <StopRow
                  stop={stop}
                  index={index}
                  onRemove={() => handleRemove(stop.venueId)}
                  styles={styles}
                  colors={colors}
                />
                {index < stops.length - 1 && (
                  <TransitRow from={stop} to={stops[index + 1]} styles={styles} />
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <AddStopModal
        visible={pickerVisible}
        candidates={candidates}
        isSquad={isInSquad}
        onAdd={handleAddVenue}
        onClose={() => setPickerVisible(false)}
        styles={styles}
        colors={colors}
      />

      <ProUpsellModal
        visible={upsellVisible}
        title="Your plan is full"
        message={
          tier === 'free'
            ? `Free plans hold ${maxItineraryStops} stops. BarHop Pro takes you to 5 — Elite goes unlimited.`
            : `Pro plans hold ${maxItineraryStops} stops. BarHop Elite plans the whole night, unlimited.`
        }
        ctaLabel={upgradeCtaLabel}
        source="itinerary"
        onClose={() => setUpsellVisible(false)}
      />
    </View>
  );
}

function StopRow({
  stop,
  index,
  onRemove,
  styles,
  colors,
}: {
  stop: ItineraryStop;
  index: number;
  onRemove: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.stopRow}>
      <View style={styles.stopNumber}>
        <Text style={styles.stopNumberText}>{index + 1}</Text>
      </View>
      {stop.imageUrl ? (
        <Image source={{ uri: stop.imageUrl }} style={styles.stopThumb} />
      ) : (
        <View style={[styles.stopThumb, styles.stopThumbFallback]}>
          <Text>🍸</Text>
        </View>
      )}
      <View style={styles.stopBody}>
        <Text style={styles.stopName} numberOfLines={1}>
          {stop.name}
        </Text>
        <Text style={styles.stopMeta} numberOfLines={1}>
          {stop.category ? `${stop.category} · ` : ''}
          {stop.address}
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={10}>
        <Ionicons name="close-circle" size={22} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

function TransitRow({
  from,
  to,
  styles,
}: {
  from: ItineraryStop;
  to: ItineraryStop;
  styles: ReturnType<typeof createStyles>;
}) {
  if (!from.coords || !to.coords) {
    return <View style={styles.transitConnector} />;
  }
  const estimate = estimateTravel(from.coords, to.coords);
  return (
    <View style={styles.transitRow}>
      <View style={styles.transitConnector} />
      <Text style={styles.transitLabel}>{estimate.label}</Text>
      <Pressable
        style={styles.transitButton}
        onPress={() => openInUber(to.coords!.latitude, to.coords!.longitude, to.name)}
      >
        <Text style={styles.transitButtonText}>Uber</Text>
      </Pressable>
      <Pressable
        style={styles.transitButton}
        onPress={() => openInMaps(to.coords!.latitude, to.coords!.longitude, to.name)}
      >
        <Text style={styles.transitButtonText}>Maps</Text>
      </Pressable>
    </View>
  );
}

function AddStopModal({
  visible,
  candidates,
  isSquad,
  onAdd,
  onClose,
  styles,
  colors,
}: {
  visible: boolean;
  candidates: VenueWithId[] | null;
  isSquad: boolean;
  onAdd: (venue: VenueWithId) => void;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.pickerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Add a stop</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.pickerSubtitle}>
            {isSquad ? 'Venues your squad matched on' : 'Venues you swiped right on'}
          </Text>

          {!candidates ? (
            <View style={styles.pickerEmpty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : candidates.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Text style={styles.emptyTitle}>
                {isSquad ? 'No squad matches yet' : 'Nothing liked yet'}
              </Text>
              <Text style={styles.emptyText}>
                {isSquad
                  ? 'When your whole squad swipes right on a venue, it lands here.'
                  : 'Swipe right on venues in Discover and they show up here.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={candidates}
              keyExtractor={(venue) => venue.id}
              renderItem={({ item }) => (
                <View style={styles.candidateRow}>
                  {item.images?.[0] ? (
                    <Image source={{ uri: item.images[0] }} style={styles.stopThumb} />
                  ) : (
                    <View style={[styles.stopThumb, styles.stopThumbFallback]}>
                      <Text>🍸</Text>
                    </View>
                  )}
                  <View style={styles.stopBody}>
                    <Text style={styles.stopName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.stopMeta} numberOfLines={1}>
                      {item.category}
                    </Text>
                  </View>
                  <Pressable style={styles.candidateAdd} onPress={() => onAdd(item)}>
                    <Text style={styles.candidateAddText}>Add</Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    mapArea: { flex: 6 },
    mapHeader: { position: 'absolute', left: 16, right: 16, alignItems: 'flex-start' },
    planPill: {
      backgroundColor: colors.tabBarBg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    planPillText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    pin: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinText: { color: colors.onPrimary, fontSize: 15, fontWeight: '800' },

    listArea: {
      flex: 4,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: 18,
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
    },
    listTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
    listCount: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    addButtonLocked: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
    addButtonTextLocked: { color: colors.textMuted },
    dim: { opacity: 0.7 },

    listEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
    emptyText: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginTop: 6,
    },

    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 12,
    },
    stopNumber: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopNumberText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
    stopThumb: { width: 44, height: 44, borderRadius: 10 },
    stopThumbFallback: {
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopBody: { flex: 1 },
    stopName: { color: colors.text, fontSize: 15, fontWeight: '700' },
    stopMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
      textTransform: 'capitalize',
    },

    transitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingLeft: 24,
    },
    transitConnector: {
      width: 2,
      height: 22,
      backgroundColor: colors.borderStrong,
      borderRadius: 1,
      marginRight: 2,
    },
    transitLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', flex: 1 },
    transitButton: {
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    transitButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },

    pickerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(10, 5, 8, 0.55)',
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      maxHeight: '70%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      paddingBottom: 34,
    },
    pickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
    pickerSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 14 },
    pickerEmpty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16 },
    candidateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
    },
    candidateAdd: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    candidateAddText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
  });
