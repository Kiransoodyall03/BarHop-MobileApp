import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

export interface ChipOption {
  value: string;
  label: string;
}

interface ChipSelectProps {
  label?: string;
  options: ChipOption[];
  /** Selected value(s) — pass an array for multi-select. */
  selected: string | string[] | null | undefined;
  onToggle: (value: string) => void;
}

/** Themed chip picker; single- or multi-select based on `selected` type. */
export default function ChipSelect({ label, options, selected, onToggle }: ChipSelectProps) {
  const styles = useThemedStyles(createStyles);
  const isSelected = (value: string) =>
    Array.isArray(selected) ? selected.includes(value) : selected === value;

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {options.map((option) => {
          const active = isSelected(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => onToggle(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { marginBottom: 18 },
    label: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 10,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    chipActive: {
      backgroundColor: colors.chipActiveBg,
      borderColor: colors.primary,
    },
    chipText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    chipTextActive: { color: colors.text },
  });
