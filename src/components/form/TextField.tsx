import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export default function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.textFaint}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: colors.text,
      fontSize: 16,
    },
    inputError: { borderColor: colors.danger },
    error: { color: colors.danger, fontSize: 13, marginTop: 6 },
  });
