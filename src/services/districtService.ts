// Auto-created venue cards, served from a SHARED district cache.
//
// The problem this solves: calling a places API per user does not scale. A
// thousand people in one district would mean a thousand identical API calls
// (~$7 000/month at Foursquare's Pro rate). A hashmap inside the app does NOT
// fix that — app memory is per-device, so a thousand devices still make a
// thousand calls. The cache has to be SHARED, which means server-side.
//
// So the API call happens exactly once per district per day, in the
// refreshDistrictVenues Cloud Function (Creator webapp repo), which writes the
// result to Firestore. Everything below reads that shared result through three
// local tiers:
//
//   L1  in-memory Map      — session; re-entering the Swipe tab costs nothing
//   L2  AsyncStorage       — survives restarts; avoids repeat Firestore reads
//   L3  Firestore snapshot — the shared cache itself (2 reads per session)
//
// Provider cost is therefore a function of DISTRICT COUNT, never user count.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { haversineKm } from '../utils/geo';
import type {
  DailyHours,
  DistrictIndex,
  DistrictRef,
  DistrictSnapshot,
  OperatingHours,
  StubVenue,
  VenueWithId,
} from '../types';

// Auto-created venues have no venues/{id} document behind them, so their deck
// IDs are namespaced. Anything holding a venue ID can therefore tell a stub
// from a real venue without a lookup — swipe analytics and the itinerary
// resolver both depend on this.
const STUB_ID_PREFIX = 'stub:';

export function stubVenueId(placeId: string): string {
  return `${STUB_ID_PREFIX}${placeId}`;
}

export function isStubVenueId(id: string): boolean {
  return id.startsWith(STUB_ID_PREFIX);
}

// L2 lifetime. The server refreshes daily, so anything under a day is safe;
// 6h keeps the deck reasonably fresh while collapsing most Firestore reads.
const L2_TTL_MS = 6 * 60 * 60 * 1000;

const INDEX_KEY = 'barhop.districtIndex.v1';
const SNAPSHOT_KEY = (districtId: string) => `barhop.districtVenues.v1.${districtId}`;
const DIRECTORY_KEY = 'barhop.stubDirectory.v1';

// Cap on the local stub directory (see rememberStubs) — bounds AsyncStorage.
const DIRECTORY_LIMIT = 500;

interface Cached<T> {
  value: T;
  storedAt: number;
}

// ── L1 ───────────────────────────────────────────────────────────────────────
// Module-level, so it lives for the JS session and dies with the app. This is
// the "hashmap" tier: correct as a layer OVER a shared cache, useless as a
// replacement for one.
const memoryIndex = new Map<string, DistrictIndex>();
const memorySnapshots = new Map<string, DistrictSnapshot>();

/** Clears L1 + L2. Exposed for the dev tools and for sign-out. */
export async function clearDistrictCache(): Promise<void> {
  memoryIndex.clear();
  memorySnapshots.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(
      (k) => k.startsWith('barhop.districtVenues.v1.') || k === INDEX_KEY
    );
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Best-effort: a cache we cannot clear is not a failure worth surfacing.
  }
}

// ── L2 helpers ───────────────────────────────────────────────────────────────
// Every AsyncStorage touch is best-effort. The cache is an optimisation; if it
// misbehaves we fall through to Firestore rather than failing the deck.

async function readL2<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Cached<T>;
    if (Date.now() - cached.storedAt > L2_TTL_MS) return null;
    return cached.value;
  } catch {
    return null;
  }
}

async function writeL2<T>(key: string, value: T): Promise<void> {
  try {
    const payload: Cached<T> = { value, storedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore — quota or serialisation problems must not break the deck.
  }
}

// ── District resolution ──────────────────────────────────────────────────────

/** districtIndex/current — one small doc listing every active district. */
async function fetchDistrictIndex(): Promise<DistrictIndex | null> {
  const l1 = memoryIndex.get(INDEX_KEY);
  if (l1) return l1;

  const l2 = await readL2<DistrictIndex>(INDEX_KEY);
  if (l2) {
    memoryIndex.set(INDEX_KEY, l2);
    return l2;
  }

  const snap = await getDoc(doc(db, 'districtIndex', 'current'));
  if (!snap.exists()) return null;
  const index = snap.data() as DistrictIndex;
  memoryIndex.set(INDEX_KEY, index);
  await writeL2(INDEX_KEY, index);
  return index;
}

// Radii are deliberately NOT district.radiusM: that value is the Foursquare
// SEARCH radius (~1–2 km — how far around the centre we look for venues), not
// how near a user must be to see them.

// Merge EVERY district within this radius. A user in a dense cluster of
// nightlife zones (e.g. Parkview, ringed by Melville / Greenside / Parkhurst /
// Rosebank) should see all of it, not just the single closest zone.
const DISTRICT_AGGREGATE_RADIUS_KM = 10;

// Fallback when nothing is within the aggregate radius: still serve the single
// nearest district up to here, so a user between clusters gets a deck rather
// than an empty one. Comfortably covers greater Johannesburg while excluding
// other cities.
const DISTRICT_MATCH_RADIUS_KM = 50;

/**
 * The districts relevant to this location, nearest first: every district within
 * DISTRICT_AGGREGATE_RADIUS_KM, or — if none are that close — the single nearest
 * within DISTRICT_MATCH_RADIUS_KM. Empty when the user is outside every covered
 * metro (a normal outcome; the deck falls back to owner venues only).
 * Deliberately does NOT trigger an API call — provider spend stays bounded to
 * the scheduled job.
 */
export async function resolveDistricts(location: {
  latitude: number;
  longitude: number;
}): Promise<DistrictRef[]> {
  const index = await fetchDistrictIndex();
  if (!index?.districts?.length) return [];

  const ranked = index.districts
    .map((district) => ({ district, km: haversineKm(location, district.center) }))
    .sort((a, b) => a.km - b.km);

  const nearby = ranked.filter((r) => r.km <= DISTRICT_AGGREGATE_RADIUS_KM);
  if (nearby.length) return nearby.map((r) => r.district);

  const nearest = ranked[0];
  return nearest && nearest.km <= DISTRICT_MATCH_RADIUS_KM ? [nearest.district] : [];
}

// ── Snapshot fetch ───────────────────────────────────────────────────────────

async function fetchSnapshot(districtId: string): Promise<DistrictSnapshot | null> {
  const l1 = memorySnapshots.get(districtId);
  if (l1) return l1;

  const key = SNAPSHOT_KEY(districtId);
  const l2 = await readL2<DistrictSnapshot>(key);
  if (l2) {
    memorySnapshots.set(districtId, l2);
    return l2;
  }

  const snap = await getDoc(doc(db, 'districtVenues', districtId));
  if (!snap.exists()) return null;
  const snapshot = snap.data() as DistrictSnapshot;
  memorySnapshots.set(districtId, snapshot);
  await writeL2(key, snapshot);
  return snapshot;
}

// ── Stub → VenueWithId ───────────────────────────────────────────────────────

// Foursquare Pro (default) fields carry no hours — hours are a Premium field,
// billed from the first call with no free allowance, so we never request them.
// Blank times make getOpenStatus return 'unknown', which the card renders as
// "Hours TBD" rather than a wrong Open/Closed badge.
const HOURS_UNKNOWN: DailyHours = { open: '', close: '', closed: false };
const NO_HOURS: OperatingHours = {
  monday: HOURS_UNKNOWN,
  tuesday: HOURS_UNKNOWN,
  wednesday: HOURS_UNKNOWN,
  thursday: HOURS_UNKNOWN,
  friday: HOURS_UNKNOWN,
  saturday: HOURS_UNKNOWN,
  sunday: HOURS_UNKNOWN,
};

/**
 * Inflates a lean cached stub into the VenueWithId the deck renders. Snapshots
 * store the lean shape so a district's whole venue list fits comfortably inside
 * Firestore's 1 MiB document limit.
 */
export function inflateStub(stub: StubVenue): VenueWithId {
  const now = new Date();
  return {
    id: stubVenueId(stub.placeId),
    placeId: stub.placeId,
    ownerId: '', // nobody has claimed this venue yet
    name: stub.name,
    address: stub.address,
    description: '',
    category: stub.category,
    categories: stub.categories,
    tagline: '',
    // One cached Foursquare photo when the refresh function captured one;
    // otherwise empty, and VenueCard shows the 🍸 fallback.
    images: stub.photoUrl ? [stub.photoUrl] : [],
    video: null,
    hours: NO_HOURS,
    offers: [],
    phone: '',
    website: '',
    socialLinks: { facebook: '', instagram: '', tiktok: '' },
    useCustomCard: false,
    published: true,
    createdAt: now,
    updatedAt: now,
    verified: false,
    latitude: stub.latitude,
    longitude: stub.longitude,
    autoCreated: true,
  };
}

/**
 * Auto-created venues for the user's district, or [] when they're outside
 * every covered district / the snapshot hasn't been generated yet.
 */
export async function fetchDistrictStubs(location: {
  latitude: number;
  longitude: number;
}): Promise<VenueWithId[]> {
  const districts = await resolveDistricts(location);
  if (!districts.length) return [];

  // Each snapshot is L1/L2-cached, so aggregating a handful of nearby districts
  // costs little. Fetch in parallel, preserving nearest-first district order.
  const snapshots = await Promise.all(districts.map((d) => fetchSnapshot(d.id)));

  // Merge across districts, deduping on placeId: a venue near a district border
  // is caught by both adjacent Foursquare searches and lands in two snapshots.
  // First (nearest district) wins, which also keeps nearer venues earlier in
  // the deck.
  const byPlaceId = new Map<string, VenueWithId>();
  for (const snapshot of snapshots) {
    if (!snapshot?.venues?.length) continue;
    for (const stub of snapshot.venues) {
      if (!byPlaceId.has(stub.placeId)) byPlaceId.set(stub.placeId, inflateStub(stub));
    }
  }

  const stubs = [...byPlaceId.values()];
  await rememberStubs(stubs);
  return stubs;
}

// ── Local stub directory ─────────────────────────────────────────────────────
//
// Stubs have no venues/{id} document, so fetchVenuesByIds cannot resolve one —
// a right-swiped stub would silently vanish when building an itinerary. Every
// stub the user is shown is recorded here so it can be resolved later, even if
// they've since moved to a different district. Costs zero Firestore reads.

async function rememberStubs(stubs: VenueWithId[]): Promise<void> {
  if (!stubs.length) return;
  try {
    const raw = await AsyncStorage.getItem(DIRECTORY_KEY);
    const directory: Record<string, VenueWithId> = raw ? JSON.parse(raw) : {};
    for (const stub of stubs) directory[stub.id] = stub;

    // Trim oldest-first if we've drifted past the cap. Object key order is
    // insertion order for string keys, so slicing the front drops the
    // least-recently-written entries.
    const keys = Object.keys(directory);
    if (keys.length > DIRECTORY_LIMIT) {
      for (const key of keys.slice(0, keys.length - DIRECTORY_LIMIT)) {
        delete directory[key];
      }
    }
    await AsyncStorage.setItem(DIRECTORY_KEY, JSON.stringify(directory));
  } catch {
    // Best-effort.
  }
}

/** Resolves previously-seen stub venues by deck ID. Unknown IDs are dropped. */
export async function lookupStubs(ids: string[]): Promise<VenueWithId[]> {
  const stubIds = ids.filter(isStubVenueId);
  if (!stubIds.length) return [];
  try {
    const raw = await AsyncStorage.getItem(DIRECTORY_KEY);
    if (!raw) return [];
    const directory = JSON.parse(raw) as Record<string, VenueWithId>;
    return stubIds.map((id) => directory[id]).filter((v): v is VenueWithId => v != null);
  } catch {
    return [];
  }
}
