import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  fetchDistrictStubs,
  fetchStubsForDistricts,
  isStubVenueId,
  lookupStubs,
} from './districtService';
import type { StoredLocation, Venue, VenueWithId } from '../types';

// Dev sample venues (src/dev/sampleVenues.ts) are seeded with this placeId
// prefix. They can end up in the production `venues` collection if seeded from
// a dev build pointed at prod, so they're filtered out here — the single read
// path for both solo and squad decks — as a permanent safeguard. Real
// Foursquare / owner place IDs never carry this prefix.
const SAMPLE_VENUE_PREFIX = 'sample-';

/** All venues the B2B webapp has published to the consumer app. */
export async function fetchPublishedVenues(): Promise<VenueWithId[]> {
  const q = query(collection(db, 'venues'), where('published', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => ({ id: d.id, ...(d.data() as Venue) }))
    .filter((v) => !(v.placeId ?? '').startsWith(SAMPLE_VENUE_PREFIX));
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
 *
 * `manualDistrictIds` is the Pro area picker's override: when present it
 * REPLACES location-based district resolution entirely, so a user can swipe in
 * an area they aren't standing in. It reuses fetchStubsForDistricts, which
 * already exists because squad decks needed the same "districts from somewhere
 * other than this viewer's GPS" capability.
 */
export async function fetchDeckVenues(
  location?: StoredLocation | null,
  manualDistrictIds?: string[] | null
): Promise<VenueWithId[]> {
  const owned = await fetchPublishedVenues();
  const useManual = !!manualDistrictIds?.length;
  if (!useManual && !location) return owned;

  // A stub failure must never take the deck down with it — owner venues are
  // the baseline experience and the cache is an enhancement.
  let stubs: VenueWithId[] = [];
  try {
    stubs = useManual
      ? await fetchStubsForDistricts(manualDistrictIds!)
      : await fetchDistrictStubs(location!);
  } catch (error) {
    console.warn('[venueService] district stub fetch failed:', error);
    return owned;
  }

  return mergeOwnedWithStubs(owned, stubs);
}

/**
 * The SQUAD deck: published venues plus stubs from the union of every member's
 * districts, which is stored on the squad document.
 *
 * Read from the squad doc rather than each viewer's own location on purpose.
 * Consensus matching requires every member to right-swipe the same venue
 * (isVenueMatched in types.ts), so a card one member never saw can never match
 * — resolving districts per-viewer would silently break matching for squads
 * spread across the city. One shared list means one shared deck.
 *
 * An empty list degrades to published venues only, which is what pre-existing
 * squad documents (created before this field) get until they self-heal.
 */
export async function fetchSquadDeckVenues(districtIds: string[]): Promise<VenueWithId[]> {
  const owned = await fetchPublishedVenues();
  if (!districtIds.length) return owned;

  let stubs: VenueWithId[] = [];
  try {
    stubs = await fetchStubsForDistricts(districtIds);
  } catch (error) {
    console.warn('[venueService] squad stub fetch failed:', error);
    return owned;
  }

  return mergeOwnedWithStubs(owned, stubs);
}

/**
 * Owner venues first, then any stub whose place isn't already claimed. Both
 * sides key on Foursquare place IDs, so a claimed venue and its stub collide on
 * exactly that key — and the owner's real card (images, tagline, hours) must
 * win over the bare stub.
 */
function mergeOwnedWithStubs(owned: VenueWithId[], stubs: VenueWithId[]): VenueWithId[] {
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
