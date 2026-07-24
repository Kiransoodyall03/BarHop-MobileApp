import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { fetchDistrictStubs, isStubVenueId, lookupStubs } from './districtService';
import type { StoredLocation, Venue, VenueWithId } from '../types';

/** All venues the B2B webapp has published to the consumer app. */
export async function fetchPublishedVenues(): Promise<VenueWithId[]> {
  const q = query(collection(db, 'venues'), where('published', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Venue) }));
}

/**
 * The full deck: owner-created venues PLUS auto-created stubs from the shared
 * district cache, so the deck isn't empty in areas no owner has claimed yet.
 *
 * Deduped on placeId with the OWNER version winning — both sides use
 * Foursquare place IDs (the Creator webapp sources venues from the same
 * provider), so a claimed venue and its stub collide on exactly that key. If
 * an owner has built a real card, their images/tagline/hours must not be
 * replaced by the bare stub.
 *
 * Without a stored location we return owner venues only; stubs are inherently
 * location-scoped.
 */
export async function fetchDeckVenues(
  location?: StoredLocation | null
): Promise<VenueWithId[]> {
  const owned = await fetchPublishedVenues();
  if (!location) return owned;

  // A stub failure must never take the deck down with it — owner venues are
  // the baseline experience and the cache is an enhancement.
  let stubs: VenueWithId[] = [];
  try {
    stubs = await fetchDistrictStubs(location);
  } catch (error) {
    console.warn('[venueService] district stub fetch failed:', error);
    return owned;
  }

  const claimed = new Set(owned.map((v) => v.placeId).filter(Boolean));
  return [...owned, ...stubs.filter((stub) => !claimed.has(stub.placeId))];
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

/**
 * Resolves venue docs by ID (parallel reads), dropping unpublished/deleted ones.
 *
 * Auto-created stub IDs are split out first: they have no venues/{id} document,
 * so a getDoc would always miss and a right-swiped stub would silently vanish
 * on its way into an itinerary. Those resolve from the local stub directory
 * instead (see districtService.lookupStubs).
 */
export async function fetchVenuesByIds(ids: string[]): Promise<VenueWithId[]> {
  const realIds = ids.filter((id) => !isStubVenueId(id));

  const [snapshots, stubs] = await Promise.all([
    Promise.all(realIds.map((id) => getDoc(doc(db, 'venues', id)))),
    lookupStubs(ids),
  ]);

  const owned = snapshots
    .filter((snap) => snap.exists() && (snap.data() as Venue).published)
    .map((snap) => ({ id: snap.id, ...(snap.data() as Venue) }));

  return [...owned, ...stubs];
}
