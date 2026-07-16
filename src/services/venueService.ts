import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Venue, VenueWithId } from '../types';

/** All venues the B2B webapp has published to the consumer app. */
export async function fetchPublishedVenues(): Promise<VenueWithId[]> {
  const q = query(collection(db, 'venues'), where('published', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Venue) }));
}

/**
 * IDs of venues this user has already swiped on. Used to filter the deck
 * client-side so a card is never shown twice (Firestore has no scalable
 * NOT-IN query; at MVP scale the ID set is small).
 */
export async function fetchSwipedVenueIds(userId: string): Promise<Set<string>> {
  const snapshot = await getDocs(collection(db, 'users', userId, 'swipedVenues'));
  return new Set(snapshot.docs.map((d) => d.id));
}

/** IDs of venues the user right-swiped — solo itinerary candidates. */
export async function fetchLikedVenueIds(userId: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(collection(db, 'users', userId, 'swipedVenues'), where('direction', '==', 'right'))
  );
  return snapshot.docs.map((d) => d.id);
}

/** Resolves venue docs by ID (parallel reads), dropping unpublished/deleted ones. */
export async function fetchVenuesByIds(ids: string[]): Promise<VenueWithId[]> {
  const snapshots = await Promise.all(ids.map((id) => getDoc(doc(db, 'venues', id))));
  return snapshots
    .filter((snap) => snap.exists() && (snap.data() as Venue).published)
    .map((snap) => ({ id: snap.id, ...(snap.data() as Venue) }));
}
