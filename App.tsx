import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SquadProvider } from './src/context/SquadContext';
import { FriendsProvider } from './src/context/FriendsContext';
import { AreaSelectionProvider } from './src/context/AreaSelectionContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { initializeAds } from './src/ads/adsModule';
import { enforceAppUpdate } from './src/services/appUpdates';
import { initSentry, sentryEnabled, Sentry } from './src/services/sentry';

// Init crash reporting FIRST so a failure during any of the setup below is
// still captured. No-op until a DSN is configured.
initSentry();

// No-op in Expo Go; initializes the Google Mobile Ads SDK in dev/store builds.
initializeAds();

function ThemedApp() {
  const { mode } = useTheme();
  return (
    <AuthProvider>
      <SquadProvider>
        <FriendsProvider>
          <AreaSelectionProvider>
            <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
            <AppNavigator />
          </AreaSelectionProvider>
        </FriendsProvider>
      </SquadProvider>
    </AuthProvider>
  );
}

/**
 * Play's Immediate update gate. Runs OUTSIDE the auth tree on purpose: an
 * out-of-date client should be blocked before it can read or write anything,
 * not after it signs in.
 *
 * Re-checked on foreground so a session left open across a release still gets
 * gated, but never more than once per foreground transition.
 */
function useForcedUpdateCheck() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    void enforceAppUpdate();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const returning = appState.current.match(/inactive|background/) && next === 'active';
      appState.current = next;
      if (returning) void enforceAppUpdate();
    });
    return () => subscription.remove();
  }, []);
}

function App() {
  useForcedUpdateCheck();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds native crash handling + an error boundary around the tree.
// Only applied when a DSN is configured, so nothing native is touched in Expo
// Go / before Sentry exists.
export default sentryEnabled ? Sentry.wrap(App) : App;
