import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ChipSelect from './form/ChipSelect';
import ProUpsellModal from './ProUpsellModal';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import {
  DIETARY_OPTIONS,
  DISTANCE_OPTIONS,
  DRESS_CODE_OPTIONS,
  EMPTY_FILTERS,
  FILTER_GENRE_OPTIONS,
  MAX_COVER_OPTIONS,
  type VenueFilters,
} from '../types';

interface VenueFiltersModalProps {
  visible: boolean;
  initialFilters: VenueFilters;
  /** Squad members see the host's filters without controls. */
  readOnly?: boolean;
  /** Distance filtering needs the user's stored location. */
  hasLocation: boolean;
  onApply: (filters: VenueFilters) => void;
  onClose: () => void;
}

/**
 * Deck filters sheet. Distance is free-tier; Genres/Dress Code/Max Cover are
 * Pro — locked sections stay visible behind a padlock overlay that raises the
 * upsell. In squad mode only the host edits (members get readOnly).
 */
export default function VenueFiltersModal({
  visible,
  initialFilters,
  readOnly = false,
  hasLocation,
  onApply,
  onClose,
}: VenueFiltersModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { hasAdvancedFilters, upgradeCtaLabel } = useConsumerSubscription();

  const [draft, setDraft] = useState<VenueFilters>(initialFilters);
  const [upsellVisible, setUpsellVisible] = useState(false);

  // Re-seed the draft each time the sheet opens.
  useEffect(() => {
    if (visible) setDraft(initialFilters);
  }, [visible, initialFilters]);

  const locked = !hasAdvancedFilters && !readOnly;
  const interactive = !readOnly;

  function toggleGenre(value: string) {
    setDraft((d) => ({
      ...d,
      genres: d.genres.includes(value)
        ? d.genres.filter((g) => g !== value)
        : [...d.genres, value],
    }));
  }

  function toggleDietary(value: string) {
    setDraft((d) => ({
      ...d,
      dietary: d.dietary.includes(value)
        ? d.dietary.filter((x) => x !== value)
        : [...d.dietary, value],
    }));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {readOnly ? (
            <View style={styles.hostBanner}>
              <Ionicons name="people" size={15} color={colors.primary} />
              <Text style={styles.hostBannerText}>
                Filters are set by your squad host and apply to the whole squad.
              </Text>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* ── Distance — available on every tier ── */}
            <Text style={styles.sectionNote}>
              {hasLocation
                ? 'Show venues within…'
                : 'Enable location (Profile → Location) to filter by distance.'}
            </Text>
            <View pointerEvents={interactive && hasLocation ? 'auto' : 'none'}>
              <ChipSelect
                label="Distance"
                options={DISTANCE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                selected={draft.maxDistanceKm != null ? String(draft.maxDistanceKm) : null}
                onToggle={(value) =>
                  setDraft((d) => ({
                    ...d,
                    maxDistanceKm: d.maxDistanceKm === Number(value) ? null : Number(value),
                  }))
                }
              />
            </View>

            {/* ── Dietary — free tier (a need, pre-filled from the profile) ── */}
            <View pointerEvents={interactive ? 'auto' : 'none'}>
              <ChipSelect
                label="Dietary needs"
                options={DIETARY_OPTIONS}
                selected={draft.dietary}
                onToggle={toggleDietary}
              />
            </View>

            {/* ── Pro sections ── */}
            <View>
              <View pointerEvents={interactive && !locked ? 'auto' : 'none'}>
                <ChipSelect
                  label="Music & Vibe (at least one match)"
                  options={FILTER_GENRE_OPTIONS.map((g) => ({ value: g, label: g }))}
                  selected={draft.genres}
                  onToggle={toggleGenre}
                />
                <ChipSelect
                  label="Dress Code"
                  options={DRESS_CODE_OPTIONS}
                  selected={draft.dressCode}
                  onToggle={(value) =>
                    setDraft((d) => ({ ...d, dressCode: d.dressCode === value ? null : value }))
                  }
                />
                <ChipSelect
                  label="Max Cover Charge"
                  options={MAX_COVER_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                  selected={draft.maxCover != null ? String(draft.maxCover) : null}
                  onToggle={(value) =>
                    setDraft((d) => ({
                      ...d,
                      maxCover: d.maxCover === Number(value) ? null : Number(value),
                    }))
                  }
                />
              </View>

              {locked && (
                // Padlock overlay: the sections stay visible but every touch
                // lands here and pitches Pro instead.
                <Pressable style={styles.lockOverlay} onPress={() => setUpsellVisible(true)}>
                  <View style={styles.lockPill}>
                    <Ionicons name="lock-closed" size={15} color={colors.text} />
                    <Text style={styles.lockPillText}>Pro filters — tap to unlock</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </ScrollView>

          {interactive && (
            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [styles.resetButton, pressed && styles.dim]}
                onPress={() => setDraft(EMPTY_FILTERS)}
              >
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.applyButton, pressed && styles.dim]}
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
              >
                <Text style={styles.applyText}>Apply Filters</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <ProUpsellModal
        visible={upsellVisible}
        title="Unlock Pro Filters"
        message="Filter by music genre, dress code and cover charge with BarHop Pro."
        ctaLabel={upgradeCtaLabel}
        source="filters"
        onClose={() => setUpsellVisible(false)}
        // This upsell lives inside the filters <Modal> — that sheet must close
        // too, or it covers the Paywall.
        onDismissParent={onClose}
      />
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(10, 5, 8, 0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '82%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      paddingBottom: 30,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: '800' },
    hostBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.chipActiveBg,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      marginBottom: 10,
    },
    hostBannerText: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
    sectionNote: { color: colors.textFaint, fontSize: 13, marginBottom: 10, marginTop: 4 },

    lockOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(10, 5, 8, 0.35)',
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lockPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderColor: colors.accent,
      borderWidth: 1.5,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    lockPillText: { color: colors.text, fontSize: 14, fontWeight: '700' },

    footer: { flexDirection: 'row', gap: 12, marginTop: 14 },
    resetButton: {
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    resetText: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
    applyButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    applyText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    dim: { opacity: 0.7 },
  });
