import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { updateProfile } from '../services/profileService';
import { updateSquadMemberLocation } from '../services/squadService';

// OS-level watch filter: at most one callback per 10s OR 20m of movement,
// whichever comes first.
const WATCH_TIME_INTERVAL_MS = 10_000;
const WATCH_DISTANCE_M = 20;
// App-level floor before any Firestore write is issued, independent of how
// often the OS actually calls back — caps writes to ~4/min even under
// continuous GPS churn while walking.
const MIN_WRITE_INTERVAL_MS = 15_000;

interface UseLiveLocationTrackingOptions {
  uid: string | null;
  /** The user's ACTIVE squad only — pass null when solo or viewing a non-active squad. */
  squadId: string | null;
  /** Caller gates this on screen focus (useIsFocused) AND granted permission. */
  enabled: boolean;
}

/**
 * Foreground-only continuous location tracking. Writes both the profile's
 * own location and (when in an active squad) that squad's denormalized
 * memberLocations entry, so squadmates can see a live pin on the map. Stops
 * tracking whenever the app backgrounds or the caller disables it — there is
 * no background location permission in this app by design.
 */
export function useLiveLocationTracking({
  uid,
  squadId,
  enabled,
}: UseLiveLocationTrackingOptions): void {
  const lastWriteAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !uid) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function start() {
      if (AppState.currentState !== 'active') return;
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: WATCH_TIME_INTERVAL_MS,
          distanceInterval: WATCH_DISTANCE_M,
        },
        (position) => {
          if (cancelled) return;
          const now = Date.now();
          if (now - lastWriteAtRef.current < MIN_WRITE_INTERVAL_MS) return;
          lastWriteAtRef.current = now;

          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            updatedAt: new Date(),
          };
          updateProfile(uid!, { location }).catch((error) => {
            console.warn('[useLiveLocationTracking] profile write failed:', error);
          });
          if (squadId) {
            updateSquadMemberLocation(squadId, uid!, location).catch((error) => {
              console.warn('[useLiveLocationTracking] squad write failed:', error);
            });
          }
        }
      );
    }

    start();

    // useIsFocused() alone doesn't change when the whole app backgrounds
    // (only the active screen would), so watch AppState directly too.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && subscription) {
        subscription.remove();
        subscription = null;
      } else if (state === 'active' && !subscription) {
        start();
      }
    });

    return () => {
      cancelled = true;
      subscription?.remove();
      appStateSubscription.remove();
    };
  }, [enabled, uid, squadId]);
}
