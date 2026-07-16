import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  authErrorMessage,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogleIdToken,
} from '../services/authService';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

// Completes the Google redirect if the app was opened by an auth callback.
WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const googleConfigured = Boolean(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
  );

  // NOTE: Google Sign-In cannot run inside Expo Go (Google rejects exp://
  // redirect URIs) — it needs a development/standalone build with the client
  // IDs below configured. Email/password works everywhere. See README.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    selectAccount: true,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (!idToken) {
        setError('Google sign-in did not return a credential. Please try again.');
        return;
      }
      setSubmitting(true);
      signInWithGoogleIdToken(idToken)
        .catch((err) => setError(authErrorMessage(err)))
        .finally(() => setSubmitting(false));
      // On success AuthContext flips the navigator to the main app.
    } else if (response.type === 'error') {
      setError('Google sign-in failed. Please try again.');
    }
  }, [response]);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length >= 6 && !submitting,
    [email, password, submitting]
  );

  async function handleEmailSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      // Navigation happens via AuthContext — nothing to do here.
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleGooglePress() {
    setError(null);
    if (!googleConfigured || !request) {
      setError(
        'Google Sign-In needs OAuth client IDs and a development build — see the README. Use email & password for now.'
      );
      return;
    }
    promptAsync();
  }

  return (
    <LinearGradient colors={colors.authGradient} style={styles.gradient}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.wordmark}>
            Bar<Text style={styles.wordmarkAccent}>Hop</Text>
          </Text>
          <Text style={styles.tagline}>Swipe your night out.</Text>

          <View style={styles.form}>
            <Text style={styles.heading}>
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textFaint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password (min. 6 characters)"
              placeholderTextColor={colors.textFaint}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={handleEmailSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                (!canSubmit || pressed) && styles.primaryButtonDim,
              ]}
            >
              <LinearGradient
                colors={colors.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryButtonInner}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {mode === 'login' ? 'Sign In' : 'Sign Up'}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={handleGooglePress}
              disabled={submitting}
              style={({ pressed }) => [styles.googleButton, pressed && styles.pressedDim]}
            >
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              style={styles.switchMode}
            >
              <Text style={styles.switchModeText}>
                {mode === 'login' ? "New here? " : 'Already have an account? '}
                <Text style={styles.switchModeAccent}>
                  {mode === 'login' ? 'Create an account' : 'Sign in'}
                </Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    gradient: { flex: 1 },
    flex: { flex: 1 },
    content: {
      flexGrow: 1,
      paddingHorizontal: 28,
      justifyContent: 'center',
    },
    wordmark: {
      fontSize: 48,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: 1,
    },
    wordmarkAccent: { color: colors.primary },
    tagline: {
      marginTop: 6,
      marginBottom: 40,
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
    },
    form: { width: '100%' },
    heading: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 20,
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
      marginBottom: 14,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginBottom: 12,
    },
    primaryButton: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
    primaryButtonDim: { opacity: 0.6 },
    primaryButtonInner: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: colors.onPrimary,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 22,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderStrong },
    dividerText: { color: colors.textFaint, marginHorizontal: 12, fontSize: 13 },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderColor: colors.borderStrong,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 15,
      gap: 10,
    },
    pressedDim: { opacity: 0.8 },
    googleG: {
      fontSize: 18,
      fontWeight: '800',
      color: '#4285F4',
    },
    googleButtonText: {
      color: '#1F1F1F',
      fontSize: 16,
      fontWeight: '600',
    },
    switchMode: { marginTop: 26, alignItems: 'center' },
    switchModeText: { color: colors.textMuted, fontSize: 15 },
    switchModeAccent: { color: colors.primary, fontWeight: '700' },
  });
