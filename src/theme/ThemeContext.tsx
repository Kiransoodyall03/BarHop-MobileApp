import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type ThemeColors, type ThemeMode } from './colors';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'barhop.themePreference';

interface ThemeContextValue {
  /** Resolved mode actually rendered right now. */
  mode: ThemeMode;
  /** What the user picked in Profile → Appearance. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  preference: 'dark',
  setPreference: () => {},
  colors: darkColors,
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  // Dark is the brand default (nightlife) until the stored choice loads.
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const mode: ThemeMode =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      preference,
      setPreference,
      colors: mode === 'dark' ? darkColors : lightColors,
    }),
    [mode, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Theme-aware StyleSheet hook. Pass a module-level factory so its reference
 * stays stable; styles are rebuilt only when the palette flips.
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}
