import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { resolveVenueCoords } from '../utils/venueCoords';
import type { Itinerary, ItineraryStop, VenueWithId } from '../types';

/**
 * THE one-itinerary rule: the document ID is the squadId when the user is in
 * a squad, otherwise their uid. One identity → one active plan, and squad
 * plans are inherently shared by every member.
 */
export function itineraryKeyFor(userId: string, squadId?: string | null): string {
  return squadId ?? userId;
}

/**
 * Thrown when the free-tier stop cap blocks an add — the transaction aborts
 * with no write. Callers catch this to raise the ProUpsellModal.
 */
export class ItineraryLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItineraryLimitError';
  }
}

/** Live itinerary listener (null when no plan exists yet). */
export function listenToItinerary(
  key: string,
  callback: (itinerary: Itinerary | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'itineraries', key),
    (snapshot) => callback(snapshot.exists() ? (snapshot.data() as Itinerary) : null),
    (error) => {
      console.warn('[itineraryService] listener error:', error);
      callback(null);
    }
  );
}

/**
 * Appends a stop transactionally: creates the plan document on first use,
 * no-ops if the venue is already a stop, and enforces the tier's stop cap
 * INSIDE the transaction — so even two squad members adding simultaneously
 * can't push a free plan past its limit. Coordinates resolve through the
 * blended chain (stored venue coords → future Places API → dummy) and are
 * cached on the stop. NOTE: serverTimestamp() is invalid inside array
 * elements, hence Timestamp.now() for addedAt.
 */
export async function addStop(
  key: string,
  type: Itinerary['type'],
  venue: VenueWithId,
  userId: string,
  maxStops: number = Infinity
): Promise<void> {
  const ref = doc(db, 'itineraries', key);
  const stop: ItineraryStop = {
    venueId: venue.id,
    name: venue.name,
    address: venue.address ?? '',
    category: venue.category ?? '',
    imageUrl: venue.images?.[0] ?? null,
    coords: resolveVenueCoords(venue),
    addedBy: userId,
    addedAt: Timestamp.now(),
  };

  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) {
      if (maxStops < 1) {
        throw new ItineraryLimitError('Free plans are limited in stops.');
      }
      tx.set(ref, {
        type,
        stops: [stop],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const stops = (snapshot.data().stops ?? []) as ItineraryStop[];
    if (stops.some((existing) => existing.venueId === venue.id)) return;
    if (stops.length >= maxStops) {
      throw new ItineraryLimitError(`Free plans hold ${maxStops} stops.`);
    }
    tx.update(ref, { stops: [...stops, stop], updatedAt: serverTimestamp() });
  });
}

/** Removes a stop transactionally (no-op if the plan or stop is gone). */
export async function removeStop(key: string, venueId: string): Promise<void> {
  const ref = doc(db, 'itineraries', key);
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return;
    const stops = (snapshot.data().stops ?? []) as ItineraryStop[];
    tx.update(ref, {
      stops: stops.filter((stop) => stop.venueId !== venueId),
      updatedAt: serverTimestamp(),
    });
  });
}
