import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useFriends } from '../context/FriendsContext';
import { useAreaSelection } from '../context/AreaSelectionContext';
import {
  fetchAllDistricts,
  fetchDistrictStats,
  fetchDistrictVenueIds,
} from '../services/districtService';
import { haversineKm } from '../utils/geo';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { DistrictRef } from '../types';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AreaSelector'>;

// Fallback map center: Johannesburg CBD (launch market).
const DEFAULT_REGION = {
  latitude: -26.2041,
  longitude: 28.0473,
  latitudeDelta: 0.35,
  longitudeDelta: 0.35,
};

// Drawn radius for an area chip.
//
// Deliberately NOT district.radiusM: that value is the Foursquare SEARCH radius
// the daily refresh job used, not a boundary the area actually occupies.
// Rendering it would imply a precision the data doesn't have and would make
// districts overlap unevenly. A constant reads honestly as "this area", and
// selection is a discrete choice anyway.
const DISPLAY_RADIUS_M = 1200;

interface DistrictStats {
  venueCount: number;
  topCategories: string[];
  friendLikes: number;
}

export default function AreaSelectorScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { matchesByVenue } = useFriends();
  const { selectedDistrictIds, toggle, clear } = useAreaSelection();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const mapRef = useRef<MapView>(null);

  const [districts, setDistricts] = useState<DistrictRef[] | null>(null);
  const [focused, setFocused] = useState<DistrictRef | null>(null);
  const [stats, setStats] = useState<Record<string, DistrictStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    fetchAllDistricts()
      .then(setDistricts)
      .catch((error) => {
        console.warn('[AreaSelectorScreen] district load failed:', error);
        setDistricts([]);
      });
  }, []);

  // Nearest first, so the list under the map is ordered the way a user thinks
  // about it. Without a stored location we keep the index's own order.
  const ordered = useMemo(() => {
    if (!districts) return [];
    if (!profile?.location) return districts;
    const from = profile.location;
    return [...districts].sort(
      (a, b) => haversineKm(from, a.center) - haversineKm(from, b.center)
    );
  }, [districts, profile?.location]);

  const initialRegion = useMemo(() => {
    if (profile?.location) {
      return {
        ...DEFAULT_REGION,
        latitude: profile.location.latitude,
        longitude: profile.location.longitude,
      };
    }
    return DEFAULT_REGION;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // read once on mount

  /**
   * Stats are fetched ONLY when an area is focused. Loading all ~11 districts
   * up front would mean 11 reads of full venue arrays every time this screen
   * opens; on-tap keeps it to one, and the district cache makes repeat taps
   * free.
   */
  const focusDistrict = useCallback(
    async (district: DistrictRef) => {
      setFocused(district);
      mapRef.current?.animateToRegion(
        {
          latitude: district.center.latitude,
          longitude: district.center.longitude,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        },
        350
      );
      if (stats[district.id]) return;

      setStatsLoading(true);
      try {
        const [basic, venueIds] = await Promise.all([
          fetchDistrictStats(district.id),
          fetchDistrictVenueIds(district.id),
        ]);
        // "Friends here" comes from shared LIKES, never from anyone's live
        // location — the friend graph deliberately never inherits GPS.
        const friendLikes = venueIds.filter((id) => matchesByVenue[id]?.length).length;
        setStats((current) => ({
          ...current,
          [district.id]: {
            venueCount: basic?.venueCount ?? 0,
            topCategories: basic?.topCategories ?? [],
            friendLikes,
          },
        }));
      } catch (error) {
        console.warn('[AreaSelectorScreen] stats load failed:', error);
      } finally {
        setStatsLoading(false);
      }
    },
    [stats, matchesByVenue]
  );

  const focusedStats = focused ? stats[focused.id] : undefined;
  const focusedSelected = !!focused && selectedDistrictIds.includes(focused.id);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onPress={() => setFocused(null)}
      >
        {ordered.map((district) => {
          const selected = selectedDistrictIds.includes(district.id);
          const isFocused = focused?.id === district.id;
          return (
            <React.Fragment key={district.id}>
              <Circle
                center={district.center}
                radius={DISPLAY_RADIUS_M}
                strokeWidth={isFocused || selected ? 3 : 1.5}
                strokeColor={selected ? colors.primary : colors.borderStrong}
                fillColor={
                  selected
                    ? 'rgba(255, 77, 109, 0.28)'
                    : isFocused
                      ? 'rgba(255, 77, 109, 0.14)'
                      : 'rgba(120, 120, 140, 0.10)'
                }
              />
              <Marker
                coordinate={district.center}
                anchor={{ x: 0.5, y: 0.5 }}
                // Custom marker children re-render the native view on every
                // frame unless this is off — a well-known Android perf trap.
                tracksViewChanges={false}
                onPress={() => focusDistrict(district)}
              >
                <View style={[styles.chip, selected && styles.chipSelected]}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {district.name}
                  </Text>
                </View>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapView>

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.headerButton} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Choose your areas</Text>
        <Pressable style={styles.headerButton} onPress={clear} hitSlop={8}>
          <Text style={styles.clearText}>Reset</Text>
        </Pressable>
      </View>

      {districts === null && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {focused ? (
          <>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetTitle}>{focused.name}</Text>
                {statsLoading && !focusedStats ? (
                  <Text style={styles.sheetMeta}>Loading…</Text>
                ) : focusedStats ? (
                  <Text style={styles.sheetMeta}>
                    {focusedStats.venueCount} place
                    {focusedStats.venueCount === 1 ? '' : 's'}
                    {focusedStats.topCategories.length
                      ? ` · ${focusedStats.topCategories.join(', ')}`
                      : ''}
                  </Text>
                ) : (
                  <Text style={styles.sheetMeta}>No venue data yet</Text>
                )}
                {focusedStats && focusedStats.friendLikes > 0 && (
                  <Text style={styles.friendsHere}>
                    ✨ {focusedStats.friendLikes} place
                    {focusedStats.friendLikes === 1 ? '' : 's'} your friends liked
                  </Text>
                )}
              </View>
              <Pressable
                style={[styles.pickButton, focusedSelected && styles.pickButtonOn]}
                onPress={() => toggle(focused.id)}
              >
                <Ionicons
                  name={focusedSelected ? 'checkmark' : 'add'}
                  size={16}
                  color={focusedSelected ? colors.like : colors.onPrimary}
                />
                <Text
                  style={[styles.pickText, focusedSelected && styles.pickTextOn]}
                >
                  {focusedSelected ? 'Added' : 'Swipe here'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ordered.map((district) => {
              const selected = selectedDistrictIds.includes(district.id);
              return (
                <Pressable
                  key={district.id}
                  style={[styles.listChip, selected && styles.listChipOn]}
                  onPress={() => focusDistrict(district)}
                >
                  <Text style={[styles.listChipText, selected && styles.listChipTextOn]}>
                    {district.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Pressable
          style={({ pressed }) => [styles.doneButton, pressed && styles.dim]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneText}>
            {selectedDistrictIds.length > 0
              ? `Swipe in ${selectedDistrictIds.length} area${
                  selectedDistrictIds.length === 1 ? '' : 's'
                }`
              : 'Use my location'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 10,
      backgroundColor: colors.tabBarBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerButton: { minWidth: 54, paddingVertical: 4 },
    headerTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
    clearText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'right',
    },

    loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

    chip: {
      backgroundColor: colors.tabBarBg,
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
    chipTextSelected: { color: colors.onPrimary },

    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 16,
      gap: 14,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sheetTitleBlock: { flex: 1 },
    sheetTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
    sheetMeta: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: 3,
      textTransform: 'capitalize',
    },
    friendsHere: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 4 },
    pickButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 15,
      paddingVertical: 9,
    },
    pickButtonOn: {
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.like,
    },
    pickText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' },
    pickTextOn: { color: colors.like },

    listChip: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginRight: 8,
    },
    listChipOn: { backgroundColor: colors.chipActiveBg, borderColor: colors.primary },
    listChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    listChipTextOn: { color: colors.text },

    doneButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      alignItems: 'center',
      paddingVertical: 15,
    },
    doneText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    dim: { opacity: 0.7 },
  });
