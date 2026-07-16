// Single choke point for the react-native-google-mobile-ads NATIVE module.
//
// The ads SDK cannot run inside Expo Go (no custom native code), so every ad
// feature imports the library exclusively through this file. In Expo Go the
// require() throws, `adsSupported` is false, and the app degrades gracefully:
// no ad cards are injected and the rewarded flow is simulated. In a dev/
// standalone build (npx expo run:android) the real SDK loads.

type AdsLibrary = typeof import('react-native-google-mobile-ads');

let loaded: AdsLibrary | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  loaded = require('react-native-google-mobile-ads');
} catch {
  loaded = null; // Expo Go — native module unavailable
}

export const adsModule: AdsLibrary | null = loaded;
export const adsSupported = adsModule != null;

let initialized = false;

/** Initializes the Mobile Ads SDK once. No-op where ads are unsupported. */
export function initializeAds(): void {
  if (!adsModule || initialized) return;
  initialized = true;
  adsModule
    .default()
    .initialize()
    .catch((error: unknown) => console.warn('[adsModule] initialize failed:', error));
}

// Ad unit IDs: real IDs come from .env (EXPO_PUBLIC_ADMOB_*); in dev builds
// without env values we fall back to Google's public test units. TEST ADS
// ONLY until real AdMob units exist — clicking real ads yourself violates
// AdMob invalid-traffic policy.
export const NATIVE_AD_UNIT_ID: string =
  process.env.EXPO_PUBLIC_ADMOB_NATIVE_AD_UNIT ||
  (__DEV__ && adsModule ? adsModule.TestIds.NATIVE : '');

export const REWARDED_AD_UNIT_ID: string =
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT ||
  (__DEV__ && adsModule ? adsModule.TestIds.REWARDED : '');
