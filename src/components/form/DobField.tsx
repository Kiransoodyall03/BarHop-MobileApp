import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

interface DobFieldProps {
  label?: string;
  /** ISO 'YYYY-MM-DD' or empty. */
  value: string;
  onChange: (isoDate: string) => void;
  error?: string | null;
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDobDisplay(iso: string): string {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// Sensible picker start point for an 18+ app when no date is set yet.
const DEFAULT_DOB = new Date(2000, 0, 1);

export default function DobField({ label = 'Date of birth', value, onChange, error }: DobFieldProps) {
  const { mode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [showPicker, setShowPicker] = useState(false);
  const pickerDate = value ? new Date(`${value}T00:00:00`) : DEFAULT_DOB;

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowPicker(false); // Android modal closes itself
    if (event.type !== 'dismissed' && date) onChange(toIso(date));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setShowPicker((visible) => !visible)}
        style={[styles.field, error ? styles.fieldError : null]}
      >
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatDobDisplay(value) : 'Select your date of birth'}
        </Text>
        <Text style={styles.calendarIcon}>📅</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {showPicker && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          themeVariant={mode}
          onChange={handleChange}
        />
      )}
      {showPicker && Platform.OS === 'ios' && (
        <Pressable style={styles.doneButton} onPress={() => setShowPicker(false)}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      )}
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
      marginBottom: 8,
    },
    field: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    fieldError: { borderColor: colors.danger },
    value: { color: colors.text, fontSize: 16 },
    placeholder: { color: colors.textFaint, fontSize: 16 },
    calendarIcon: { fontSize: 16 },
    error: { color: colors.danger, fontSize: 13, marginTop: 6 },
    doneButton: { alignSelf: 'flex-end', paddingVertical: 10, paddingHorizontal: 6 },
    doneButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  });
