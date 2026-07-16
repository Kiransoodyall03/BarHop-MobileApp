import React, { type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/colors';

const TOTAL_STEPS = 3;

interface OnboardingScaffoldProps extends PropsWithChildren {
  step: number; // 1-based
  title: string;
  subtitle: string;
  continueLabel?: string;
  continueDisabled?: boolean;
  submitting?: boolean;
  onContinue: () => void;
  /** Renders a "Skip" action in the header for optional steps. */
  onSkip?: () => void;
}

/** Shared wizard chrome: progress dots, title, skip action, continue CTA. */
export default function OnboardingScaffold({
  step,
  title,
  subtitle,
  continueLabel = 'Continue',
  continueDisabled = false,
  submitting = false,
  onContinue,
  onSkip,
  children,
}: OnboardingScaffoldProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i < step && styles.dotActive]} />
          ))}
        </View>
        {onSkip ? (
          <Pressable onPress={onSkip} hitSlop={12} disabled={submitting}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.stepLabel}>
            Step {step} of {TOTAL_STEPS}
          </Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View>{children}</View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={onContinue}
            disabled={continueDisabled || submitting}
            style={({ pressed }) => [
              styles.continueButton,
              (continueDisabled || pressed || submitting) && styles.continueDim,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.continueText}>{continueLabel}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 24,
      marginBottom: 8,
    },
    dots: { flexDirection: 'row', gap: 8 },
    dot: {
      width: 24,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceLight,
    },
    dotActive: { backgroundColor: colors.primary },
    skip: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
    content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
    stepLabel: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '800',
      marginTop: 8,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
      marginBottom: 28,
    },
    footer: { paddingHorizontal: 24, paddingTop: 8 },
    continueButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    },
    continueDim: { opacity: 0.55 },
    continueText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' },
  });
