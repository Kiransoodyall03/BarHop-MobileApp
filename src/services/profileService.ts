import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import * as Location from 'expo-location';
import { db } from '../firebase/config';
import type { ConsumerProfile, LocationPermissionState } from '../types';

/** Live subscription to the user's profile document. */
export function subscribeToProfile(
  uid: string,
  callback: (profile: ConsumerProfile | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as ConsumerProfile) : null);
    },
    (error) => {
      console.warn('[profileService] profile subscription error:', error);
      callback(null);
    }
  );
}

/**
 * Merge-writes profile fields. Merging is load-bearing: the same users/{uid}
 * document may belong to a B2B venue owner — consumer updates must never
 * clobber owner fields (businessProfile, Paystack ids, …).
 */
export async function updateProfile(
  uid: string,
  data: Partial<ConsumerProfile>
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    { ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export interface OnboardingData {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO 'YYYY-MM-DD'
  gender?: ConsumerProfile['gender'];
  favoriteCategories?: string[];
}

/** Final onboarding write — flips profileCompleted so the wizard never reruns. */
export async function completeOnboarding(uid: string, data: OnboardingData): Promise<void> {
  const displayName = `${data.firstName} ${data.lastName}`.trim();
  await updateProfile(uid, {
    ...data,
    displayName,
    profileCompleted: true,
  });
}

export interface CaptureLocationResult {
  status: LocationPermissionState;
  /** Set when the OS won't show the dialog again — user must use Settings. */
  canAskAgain?: boolean;
}

/**
 * Standard permission flow: request foreground ("while using the app")
 * permission, and on grant store the current position on the profile.
 */
export async function captureLocation(uid: string): Promise<CaptureLocationResult> {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();

  if (status !== Location.PermissionStatus.GRANTED) {
    await updateProfile(uid, { locationPermission: 'denied' });
    return { status: 'denied', canAskAgain };
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await updateProfile(uid, {
      locationPermission: 'granted',
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    // Permission granted but no fix (e.g. location services off) — still
    // record the permission so the UI reflects reality.
    console.warn('[profileService] could not get position:', error);
    await updateProfile(uid, { locationPermission: 'granted' });
  }
  return { status: 'granted' };
}

/** Age in whole years for an ISO 'YYYY-MM-DD' date of birth. */
export function ageFromDob(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}
