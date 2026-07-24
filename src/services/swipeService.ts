import {
  deleteDoc,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { isStubVenueId } from './districtService';
import type { SwipeDirection } from '../types';

/**
 * Records a swipe atomically — one writeBatch, two documents:
 *
 * 1. users/{userId}/swipedVenues/{venueId} — the user's swipe history, read
 *    on app launch so the same venue card is never shown twice.
 *
 * 2. venues/{venueId}/analytics/{YYYY-MM-DD} — the daily log the B2B Creator
 *    dashboard reads. Its analyticsService queries this subcollection with
 *    orderBy('date' desc) and aggregates `swipedRight` / `swipedLeft`
 *    (impressions are DERIVED there as swipedRight + swipedLeft, so no
 *    impressions field is stored). `date` must be a Firestore Timestamp —
 *    the dashboard calls .toDate() on it. The deterministic day-keyed doc ID
 *    plus set(..., { merge: true }) with increment() makes the write an
 *    upsert that is safe under concurrent swipes from many users.
 *
 * Auto-created stubs skip step 2 — see skipAnalytics below. Personal swipe
 * history is still recorded, so a stub is never shown twice.
 */
export async function recordSwipe(
  userId: string,
  venueId: string,
  direction: SwipeDirection
): Promise<void> {
  const now = new Date();
  const dayKey = localDayKey(now);
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const batch = writeBatch(db);

  batch.set(doc(db, 'users', userId, 'swipedVenues', venueId), {
    venueId,
    direction,
    swipedAt: serverTimestamp(),
  });

  if (!skipAnalytics(venueId)) {
    batch.set(
      doc(db, 'venues', venueId, 'analytics', dayKey),
      {
        date: Timestamp.fromDate(localMidnight),
        swipedRight: increment(direction === 'right' ? 1 : 0),
        swipedLeft: increment(direction === 'left' ? 1 : 0),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

/**
 * Auto-created stubs have no venues/{id} document and no owner, so there is no
 * B2B dashboard to report to.
 *
 * This guard is load-bearing, not cosmetic: Firestore happily creates a
 * subcollection under a MISSING parent document, and the analytics `create`
 * rule intentionally doesn't check venue ownership (any signed-in consumer may
 * log a swipe). An unguarded write would therefore SUCCEED and litter the
 * venues collection with phantom venues/{stubId}/analytics paths that no
 * dashboard ever reads. Analytics start when an owner claims the venue.
 */
function skipAnalytics(venueId: string): boolean {
  return isStubVenueId(venueId);
}

/**
 * Analytics-only swipe write for SQUAD mode: increments the same daily log the
 * B2B dashboard reads, but records nothing under users/{uid}/swipedVenues —
 * squad sessions must not pollute personal history (the squad deck is shared
 * and unfiltered). Squad likes themselves live on the squad doc.
 */
export async function recordSquadSwipeActivity(
  venueId: string,
  direction: SwipeDirection
): Promise<void> {
  if (skipAnalytics(venueId)) return;
  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  await setDoc(
    doc(db, 'venues', venueId, 'analytics', localDayKey(now)),
    {
      date: Timestamp.fromDate(localMidnight),
      swipedRight: increment(direction === 'right' ? 1 : 0),
      swipedLeft: increment(direction === 'left' ? 1 : 0),
    },
    { merge: true }
  );
}

/**
 * Pro Rewind: deletes the personal history record for a rewound swipe so the
 * venue can be swiped on again (and reappears in future solo decks). Venue
 * analytics deliberately keep both interactions — owner metrics count
 * activity, which is standard for rewind features.
 */
export async function undoSwipeRecord(userId: string, venueId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'swipedVenues', venueId));
}

// Day bucket in the device's local timezone (SAST for the launch market).
function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
