// Forced app updates via Google Play's In-App Updates API.
//
// IMMEDIATE, not FLEXIBLE: this app reads and writes a Firestore contract it
// shares with the Creator webapp, and that contract changes (field names, tier
// vocabularies, category lists). A client running an old build against a newer
// contract doesn't degrade gracefully — it writes data the dashboard can't read
// or silently filters venues out of the deck. Blocking is the correct posture.
//
// ── Where this does NOT work ────────────────────────────────────────────────
//
// The Play API only responds for builds INSTALLED FROM PLAY. On a local dev
// build, an EAS internal-distribution APK, or an emulator, checkNeedsUpdate()
// rejects. That is expected, not a failure — see the swallow in enforceAppUpdate.

import { Platform } from 'react-native';

// Loaded through a try/catch like adsModule/purchasesModule: the native module
// is absent in Expo Go, where a bare require() would throw at import time and
// take the whole app down before it renders.
type InAppUpdatesLibrary = typeof import('sp-react-native-in-app-updates');

let loaded: InAppUpdatesLibrary | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  loaded = require('sp-react-native-in-app-updates');
} catch {
  loaded = null; // Expo Go — native module unavailable
}

/** True only on Android with the native module present. */
export const inAppUpdatesSupported = Platform.OS === 'android' && loaded != null;

/**
 * Blocks the user on Play's full-screen update flow when a newer build exists.
 *
 * Never throws and never rejects. Every failure mode here — no native module,
 * not installed from Play, no network, Play Services missing — must leave the
 * app running normally rather than gate startup behind an unavailable API.
 */
export async function enforceAppUpdate(): Promise<void> {
  if (!inAppUpdatesSupported || !loaded) return;

  try {
    const InAppUpdates = loaded.default;
    // false = quiet; the library's debug logging is very chatty in release.
    const updates = new InAppUpdates(false);

    const result = await updates.checkNeedsUpdate();
    if (!result?.shouldUpdate) return;

    await updates.startUpdate({
      updateType: loaded.IAUUpdateKind.IMMEDIATE,
    });
  } catch (error) {
    // Expected on every build not installed from Play. Warn, don't rethrow.
    console.warn('[appUpdates] update check skipped:', error);
  }
}
