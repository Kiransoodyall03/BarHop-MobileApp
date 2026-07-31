import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import type { SquadWithId } from '../types';

interface SquadSwitcherSheetProps {
  visible: boolean;
  squads: SquadWithId[];
  /** null ⇒ currently swiping solo. */
  activeSquadId: string | null;
  currentUserId: string | undefined;
  /** null selects solo. */
  onSelect: (squadId: string | null) => void;
  onClose: () => void;
}

/**
 * Picks what the deck is built from: solo, or one of the user's squads.
 *
 * Solo is a first-class choice here, not the absence of one — a user can belong
 * to several squads and still want to browse alone, and that choice persists.
 */
export default function SquadSwitcherSheet({
  visible,
  squads,
  activeSquadId,
  currentUserId,
  onSelect,
  onClose,
}: SquadSwitcherSheetProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  function choose(id: string | null) {
    onSelect(id);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Swiping as</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                activeSquadId === null && styles.rowActive,
                pressed && styles.dim,
              ]}
              onPress={() => choose(null)}
            >
              <Text style={styles.rowEmoji}>🕺</Text>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Solo</Text>
                <Text style={styles.rowMeta}>Your own deck, filtered to you</Text>
              </View>
              {activeSquadId === null && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </Pressable>

            {squads.map((squad) => {
              const active = squad.id === activeSquadId;
              const isHost = !!currentUserId && squad.hostId === currentUserId;
              const count = squad.members.length;
              return (
                <Pressable
                  key={squad.id}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && styles.dim,
                  ]}
                  onPress={() => choose(squad.id)}
                >
                  <Text style={styles.rowEmoji}>🍻</Text>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTitleRow}>
                      <Text style={styles.rowTitle}>{squad.pin}</Text>
                      {isHost && (
                        <View style={styles.hostBadge}>
                          <Text style={styles.hostBadgeText}>HOST</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowMeta}>
                      {count} {count === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                  {active && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.footnote}>
            Squad decks combine everyone&apos;s nearby spots, so the whole crew swipes the
            same cards.
          </Text>
        </View>
      </View>
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
      maxHeight: '72%',
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
      marginBottom: 12,
    },
    title: { color: colors.text, fontSize: 20, fontWeight: '800' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    rowActive: { borderColor: colors.primary, backgroundColor: colors.chipActiveBg },
    dim: { opacity: 0.7 },
    rowEmoji: { fontSize: 22 },
    rowBody: { flex: 1 },
    rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
    rowMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    hostBadge: {
      backgroundColor: colors.chipActiveBg,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    hostBadgeText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
    footnote: {
      color: colors.textFaint,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },
  });
