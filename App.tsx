import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { SquadProvider } from './src/context/SquadContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { initializeAds } from './src/ads/adsModule';
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
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <AppNavigator />
      </SquadProvider>
    </AuthProvider>
  );
}

function App() {
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
