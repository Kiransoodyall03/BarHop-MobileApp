import React, { useMemo, useState } from 'react';
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
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import BarHopLogo from '../components/BarHopLogo';
import {
  authErrorMessage,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogleIdToken,
} from '../services/authService';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

// The WEB / server OAuth client ID — Firebase validates the returned Google
// idToken against this, so it must be the "Web application" client, NOT the
// Android one. Native sign-in identifies the app itself by package name +
// SHA-1 registered on the Google Cloud OAuth Android client.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Configure once at load. Wrapped because the native module is absent in Expo
// Go — there the Google button reports unavailable and email/password still
// works. Dev-client and store builds have it.
try {
  if (GOOGLE_WEB_CLIENT_ID) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  }
} catch {
  // Expo Go — native module unavailable.
}

type Mode = 'login' | 'register';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  // Aliased — `mode` is already this screen's login/register state.
  const { colors, mode: themeMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleGooglePress() {
    setError(null);
    if (!GOOGLE_WEB_CLIENT_ID) {
      setError('Google Sign-In isn’t available in this build. Use email & password for now.');
      return;
    }
    setSubmitting(true);
    try {
      // Ensures up-to-date Play Services; on Android without them signIn can't run.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (isSuccessResponse(result)) {
        const idToken = result.data.idToken;
        if (!idToken) {
          setError('Google sign-in did not return a credential. Please try again.');
          setSubmitting(false);
          return;
        }
        await signInWithGoogleIdToken(idToken);
        // Success: AuthContext flips the navigator to the main app; this unmounts.
        return;
      }
      // User dismissed the account chooser — not an error.
      setSubmitting(false);
    } catch (err) {
      // Cancelling the native sheet surfaces as SIGN_IN_CANCELLED — stay silent.
      if (!(isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED)) {
        setError(authErrorMessage(err));
      }
      setSubmitting(false);
    }
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
          <BarHopLogo width={248} style={styles.logo} />
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
              style={({ pressed }) => [
                styles.googleButton,
                themeMode === 'dark' && styles.googleButtonDark,
                pressed && styles.pressedDim,
              ]}
            >
              <Text style={styles.googleG}>G</Text>
              <Text
                style={[
                  styles.googleButtonText,
                  themeMode === 'dark' && styles.googleButtonTextDark,
                ]}
              >
                Continue with Google
              </Text>
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
    logo: { alignSelf: 'center' },
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
    // Google's branding guidelines allow a light OR a dark button; the blue "G"
    // is fixed in both. A white slab on the dark plum gradient was the one part
    // of this screen that ignored the theme, so dark mode takes the dark
    // variant instead of forcing white.
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
    googleButtonDark: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
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
    googleButtonTextDark: { color: colors.text },
    switchMode: { marginTop: 26, alignItems: 'center' },
    switchModeText: { color: colors.textMuted, fontSize: 15 },
    switchModeAccent: { color: colors.primary, fontWeight: '700' },
  });
