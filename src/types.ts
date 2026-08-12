// Shared domain types for the BarHop consumer app.
// The Venue-related interfaces are copied verbatim from the B2B Creator
// webapp's types.ts — the two apps read/write the same Firestore documents,
// so these must stay in sync with that file.

// Represents Firestore Timestamps
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

// B2B SaaS subscription tiers ('trial' is seeded on venue creation)
export type SubscriptionTier = 'trial' | 'starter' | 'pro' | 'enterprise';

export interface DailyHours {
  open: string; // e.g., "06:00"
  close: string; // e.g., "21:00"
  closed: boolean;
}

export interface OperatingHours {
  monday: DailyHours;
  tuesday: DailyHours;
  wednesday: DailyHours;
  thursday: DailyHours;
  friday: DailyHours;
  saturday: DailyHours;
  sunday: DailyHours;
}

export interface SocialLinks {
  facebook: string;
  instagram: string;
  tiktok: string;
}

export interface Venue {
  placeId: string;
  ownerId: string;
  name: string;
  address: string;
  description: string;
  // Primary category (first of categories); kept for consumer-app compatibility.
  // OPTIONAL by contract: a venue whose source tags map to nothing in
  // VENUE_CATEGORIES must arrive with no category at all rather than a guessed
  // one. applyProFilters treats an untagged venue leniently (kept in the deck);
  // a wrong tag excludes it from the right filters and matches it into the
  // wrong ones, which is strictly worse than no tag.
  category?: string;
  categories?: string[]; // Up to 3 categories shown as chips on the swipe card
  tagline: string;
  images: string[]; // URLs from Firebase Storage / Cloudinary
  video: string | null;
  hours: OperatingHours;
  offers: any[];
  phone: string;
  website: string;
  socialLinks: SocialLinks;
  useCustomCard: boolean;
  published: boolean;
  subscriptionTier?: SubscriptionTier;
  cardBorderStyle?: 'default' | 'neon-glow' | 'gold-trim'; // Pro+: premium swipe-card border
  whatsappIntegrationActive?: boolean; // Pro+: 2-way WhatsApp CRM messaging
  posIntegrationType?: 'pilot' | 'gaap' | 'none'; // Enterprise: POS revenue sync
  createdAt: FirestoreTimestamp | Date;
  updatedAt: FirestoreTimestamp | Date;
  verified: boolean;

  // Future B2B fields: the Creator webapp will store venue coordinates
  // (from Foursquare/Places data). Read when present — tier 1 of the
  // itinerary coordinate resolver.
  latitude?: number;
  longitude?: number;

  // Pro-tier filter/telemetry fields — written by the Creator webapp when
  // that side ships them; sample venues carry them meanwhile. Venues missing
  // a field are treated leniently by filters (kept, not excluded).
  musicGenres?: string[];
  dressCode?: 'casual' | 'smart-casual' | 'formal';
  coverCharge?: number; // ZAR; 0 = free entry
  currentBusyness?: 'quiet' | 'lively' | 'at-capacity'; // live "Vibe Check"
  // Written by the Creator dashboard alongside every currentBusyness update.
  // The reading is manual and nothing clears it at close, so VibeCheckBadge
  // treats anything older than 4h as absent rather than showing a stale vibe.
  busynessUpdatedAt?: FirestoreTimestamp | Date;
  // Dietary options the venue caters to (halal/vegan/…), lowercase. Written by
  // the Creator webapp / sourced from Foursquare attributes. Matched against
  // VenueFilters.dietary; venues without it are treated leniently (kept).
  dietaryOptions?: string[];
}

// A venue as fetched from Firestore: document data + the document ID, which
// is what the B2B dashboard keys analytics on (venues/{id}/analytics).
export interface VenueWithId extends Venue {
  id: string;
  // True for auto-created stubs from the district cache — venues NOBODY owns
  // yet (see DistrictSnapshot). There is no venues/{id} document behind these,
  // so analytics writes must be skipped and the card shows an "unclaimed"
  // affordance. Absent/false ⇒ a real owner-created venue document.
  autoCreated?: boolean;
}

export type SwipeDirection = 'left' | 'right';

// What the swipe deck actually renders: venues interleaved with native ad
// slots (free tier). Ad items are dismiss-only — swiping one records nothing
// and never consumes a swipe.
export type DeckItem =
  | { kind: 'venue'; id: string; venue: VenueWithId }
  | { kind: 'ad'; id: string };

// Document shape written to users/{uid}/swipedVenues/{venueId}
export interface SwipeRecord {
  venueId: string;
  direction: SwipeDirection;
  swipedAt: FirestoreTimestamp | Date;
}

// ── District venue cache (auto-created cards) ────────────────────────────────
//
// The deck is empty in any area where no owner has built a card yet. A daily
// Cloud Function (refreshDistrictVenues, in the Creator webapp repo) calls
// Foursquare ONCE per curated district and writes the result here, so every
// user in that district reads one shared document instead of making their own
// API call. 1 000 users in a district ⇒ 1 API call, not 1 000.
//
// Only Foursquare PRO (default) fields are stored. Photos/tips/hours/ratings
// are Premium — billed from the first call with no free allowance — so stubs
// deliberately carry no images and no hours. The card already handles that
// state (🍸 fallback + "Hours TBD"). Media arrives when an owner claims the
// venue in the Creator webapp, which is the incentive to claim.

// A lean auto-created venue. Deliberately NOT a full Venue: snapshots hold
// dozens of these and must stay well inside Firestore's 1 MiB document limit.
export interface StubVenue {
  placeId: string; // Foursquare fsq_place_id — the dedupe key against owner venues
  name: string;
  address: string;
  // Optional for the same reason as Venue.category — refreshDistrictVenues must
  // not guess a category for a place whose Foursquare tags map to nothing.
  category?: string;
  categories?: string[];
  latitude: number;
  longitude: number;
  // One ready-to-render Foursquare photo URL, already assembled server-side
  // (Foursquare returns prefix/suffix halves; the app never sees that format)
  // and capped at 800px for mobile data cost. Absent when the place has no
  // photo ⇒ the card shows the 🍸 fallback rather than a broken image.
  photoUrl?: string;
}

// districtVenues/{districtId} — the shared cache document.
export interface DistrictSnapshot {
  districtId: string;
  name: string;
  center: { latitude: number; longitude: number };
  radiusM: number;
  venues: StubVenue[];
  source: 'foursquare';
  fetchedAt: FirestoreTimestamp | Date;
  expiresAt: FirestoreTimestamp | Date;
}

// One entry in districtIndex/current. Districts are hand-curated rather than
// dynamic geohash cells: the launch market has a small known set of nightlife
// areas, and curating them bounds API spend exactly.
export interface DistrictRef {
  id: string;
  name: string;
  center: { latitude: number; longitude: number };
  radiusM: number;
}

// districtIndex/current — a single small document listing every active
// district, so locating the user costs ONE read regardless of district count.
export interface DistrictIndex {
  districts: DistrictRef[];
  updatedAt: FirestoreTimestamp | Date;
}

// ── Consumer profile ─────────────────────────────────────────────────────────

export type Gender = 'male' | 'female' | 'non-binary' | 'prefer-not-to-say';

export interface StoredLocation {
  latitude: number;
  longitude: number;
  updatedAt: FirestoreTimestamp | Date;
}

export type LocationPermissionState = 'granted' | 'denied' | 'skipped';

// Consumer subscription tiers. Deliberately a SEPARATE field from the B2B
// `subscriptionTier` (trial/starter/pro/enterprise) that venue owners carry
// on the same users/{uid} documents — the two billing systems must not
// collide. Absent field ⇒ 'free'.
// Consumer billing tiers. Written ONLY by the revenueCatWebhook Cloud Function.
//
// Adding a tier here is a THREE-repo change, not a one-line one: it also needs a
// RevenueCat product/entitlement, a mapping in revenueCatWebhook, and an arm in
// squadMemberCap() in firestore.rules — which fails unrecognised tiers closed to
// the free cap of 3. An 'elite' tier previously sat here granting unlimited
// squads, members and itinerary stops with nothing able to write it; it was
// removed rather than specced.
export type ConsumerTier = 'free' | 'pro';

// Consumer-side shape of users/{uid}. The same collection also holds B2B
// venue owners (see the webapp's User type) — consumer writes always merge
// and never remove owner fields.
export interface ConsumerProfile {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  photoURL: string | null;
  // Border catalog key of kind 'avatar' — the premium frame drawn around this
  // user's profile picture. Absent (the common case) renders a plain avatar.
  // Resolved live from borderCatalog/current, so new frames need no release.
  avatarBorderStyle?: string;
  provider?: string;
  emailVerified?: boolean;
  accountType?: 'consumer';
  dateOfBirth?: string; // ISO 'YYYY-MM-DD'; 18+ enforced in the UI
  gender?: Gender;
  favoriteCategories?: string[];
  // Dietary needs (halal/vegan/…) chosen at onboarding or in profile editing.
  // Pre-fills the discovery dietary filter (editable per session).
  dietaryPreferences?: string[];
  location?: StoredLocation;
  locationPermission?: LocationPermissionState;
  profileCompleted?: boolean;
  // Short shareable code others type to send a friend request. Generated
  // lazily on first use — see ensureFriendCode. The reverse lookup lives in
  // friendCodes/{code}, because users/{uid} is not readable by anyone else.
  friendCode?: string;
  // OPT-IN gate for cross-friend matching. Nothing is ever written to
  // userLikes/{uid} while this is false/absent: sharing which venues you
  // right-swiped is a deliberate choice, not a default.
  socialDiscoveryEnabled?: boolean;
  // Expo push token, refreshed on sign-in. Denormalized onto friendship docs
  // so a friend's client can notify them of a match.
  expoPushToken?: string | null;
  // Paid subscription tier — written ONLY by the revenueCatWebhook Cloud
  // Function after Google Play confirms a purchase. Absent = free.
  consumerTier?: ConsumerTier;

  // Time-boxed Pro from a redeemed voucher code, written ONLY by the
  // redeemVoucher Cloud Function. Deliberately a SEPARATE field from
  // consumerTier so the two grant systems can never clobber each other: a
  // voucher lapsing must not revoke a paid subscription, and a cancelled
  // subscription must not swallow voucher time. A user is Pro if EITHER says so.
  proGrantExpiresAt?: FirestoreTimestamp | Date;
  proGrantCode?: string; // which voucher granted it (support/audit)
  createdAt?: FirestoreTimestamp | Date;
  updatedAt?: FirestoreTimestamp | Date;
}

// ⚠️ SHARED CONTRACT — this list must match, value for value:
//   1. VENUE_CATEGORIES in the Creator webapp's CreateVenue.js (what owners pick)
//   2. the output values of CATEGORY_ALIASES in refreshDistrictVenues.js
//      (what auto-created stubs are tagged with)
//
// Drift here does not fail loudly — it silently hides venues. applyProFilters
// is lenient only toward venues with NO tags at all, so a value that exists in
// one list but not another reads as a deliberate non-match and the venue is
// excluded from every filtered deck.
export const VENUE_CATEGORIES = [
  'bar',
  'club',
  'lounge',
  'pub',
  'cocktail bar',
  'wine bar',
  'rooftop',
  'live music',
  'restaurant',
  'sports bar',
  'adult entertainment',
] as const;

export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

// Preference chips shown during onboarding / profile editing. A SUBSET of the
// canonical vocabulary, not a second vocabulary: 'adult entertainment' is
// excluded because a "favourite categories" picker is the wrong surface to ask
// that on. It stays in VENUE_CATEGORIES so venues carrying it still match, and
// in FILTER_GENRE_OPTIONS so a user can seek or avoid it deliberately in the
// deck filters.
export const ONBOARDING_CATEGORY_CHIPS: readonly VenueCategory[] = VENUE_CATEGORIES.filter(
  (category) => category !== 'adult entertainment'
);

// Dietary needs — set on the profile and used as a discovery filter. Values are
// lowercase for matching against venue.dietaryOptions; labels are display copy.
export const DIETARY_OPTIONS: { value: string; label: string }[] = [
  { value: 'halal', label: 'Halal' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'pescatarian', label: 'Pescatarian' },
];

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

// ── Venue discovery filters ──────────────────────────────────────────────────

// Deck filters. Solo: personal/local. Squad: set by the HOST, stored on the
// squad doc, inherited live by every member (decks must stay identical for
// consensus matching). Distance is free-tier; the rest are Pro.
export interface VenueFilters {
  maxDistanceKm: number | null;
  // ≥1-overlap match against the union of venue.categories + venue.musicGenres.
  genres: string[];
  dressCode: string | null;
  maxCover: number | null; // ZAR ceiling; 0 = free entry only
  // ≥1-overlap match against venue.dietaryOptions. Free-tier (a need, not a
  // premium nicety); pre-filled from the user's profile dietaryPreferences.
  dietary: string[];
}

export const EMPTY_FILTERS: VenueFilters = {
  maxDistanceKm: null,
  genres: [],
  dressCode: null,
  maxCover: null,
  dietary: [],
};

// One chip list spanning venue categories AND music genres — a venue passes
// with at least one overlap.
export const FILTER_GENRE_OPTIONS = [
  ...VENUE_CATEGORIES,
  'amapiano',
  'techno',
  'house',
  'rnb',
  'hip-hop',
  'jazz',
] as const;

// Genre chips a FREE user can select. A strict subset of FILTER_GENRE_OPTIONS —
// a taste of the filter, with the remaining ~13 values, dress code and cover
// charge behind Pro. Derive the locked remainder from this rather than keeping a
// second hand-written list, or the two drift the moment a category is added.
export const FREE_GENRE_OPTIONS: string[] = ['bar', 'club', 'cocktail bar', 'restaurant'];

export const DRESS_CODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'smart-casual', label: 'Smart Casual' },
  { value: 'formal', label: 'Formal' },
];

export const MAX_COVER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Free entry' },
  { value: 50, label: '≤ R50' },
  { value: 100, label: '≤ R100' },
  { value: 150, label: '≤ R150' },
];

export const DISTANCE_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
  { value: 25, label: '25 km' },
  { value: 50, label: '50 km' },
];

export const BUSYNESS_META: Record<
  NonNullable<Venue['currentBusyness']>,
  { label: string; emoji: string }
> = {
  quiet: { label: 'Quiet', emoji: '🟢' },
  lively: { label: 'Lively', emoji: '🔥' },
  'at-capacity': { label: 'At Capacity', emoji: '⛔' },
};

// ── Itinerary planner ────────────────────────────────────────────────────────

// Where a stop's coordinates came from: 'venue' = stored on the venue doc by
// the B2B webapp; 'places' = future Google Places API blend (cached); 'dummy'
// = deterministic placeholder until real data lands.
export interface StopCoords {
  latitude: number;
  longitude: number;
  source: 'venue' | 'places' | 'dummy';
}

// Denormalized venue snapshot inside itineraries/{key}.stops — avoids N venue
// reads on load and survives a venue being unpublished mid-plan.
export interface ItineraryStop {
  venueId: string;
  name: string;
  address: string;
  category: string;
  imageUrl: string | null;
  coords: StopCoords | null;
  addedBy: string;
  addedAt: FirestoreTimestamp | Date;
}

// itineraries/{uid} (solo) or itineraries/{squadId} (squad) — the document ID
// IS the one-itinerary rule: one active plan per identity.
export interface Itinerary {
  type: 'solo' | 'squad';
  stops: ItineraryStop[];
  createdAt: FirestoreTimestamp | Date;
  updatedAt: FirestoreTimestamp | Date;
}

// ── Squads (group match engine) ──────────────────────────────────────────────

// squads/{squadId} document. Member display names are denormalized into the
// doc because Firestore rules (correctly) block reading other users' profiles.
export interface Squad {
  pin: string; // 6-char shareable code, unambiguous charset
  hostId: string;
  members: string[]; // uids — the consensus denominator
  memberNames: Record<string, string>; // uid → display name (lobby UI)
  // uid → avatar URL, denormalized for the same reason as memberNames.
  // Propagated to every squad the user belongs to on avatar change (Part 5
  // of the profile-picture feature) rather than snapshotted once at join.
  memberPhotos?: Record<string, string>;
  // uid → live location, ACTIVE-squad-only: only the squad a member is
  // currently swiping with receives their location ticks (see
  // useLiveLocationTracking). Absent/stale once they switch away or close
  // the app — there is no background tracking.
  memberLocations?: Record<string, StoredLocation>;
  isActive: boolean;
  likes?: Record<string, string[]>; // venueId → uids who right-swiped
  // Squad capacity follows the HOST's consumer tier at creation time.
  // Absent (legacy squads) ⇒ treated as free.
  tier?: ConsumerTier;
  // Host-set deck filters, inherited live by every member so decks stay
  // identical (consensus requires everyone to see the same venues).
  filters?: VenueFilters;
  // Union of every member's nearby district IDs — the squad deck is the
  // culmination of all members' solo stacks. Read by EVERY member off this
  // shared doc, never recomputed from the viewer's own location: consensus
  // matching needs identical decks, and a card one member never saw can never
  // match. Grows as members join and never shrinks — removing a district could
  // strand likes on venues that can no longer reach consensus.
  //
  // Absent on squads created before this field; they self-heal on first deck
  // load and show published venues only until then.
  deckDistrictIds?: string[];
  createdAt: FirestoreTimestamp | Date;
}

/** A squad document plus its ID — what the multi-squad picker renders. */
export interface SquadWithId extends Squad {
  id: string;
}

/**
 * A venue matches when every current member right-swiped it. The >= 2 guard
 * stops a lone host in the lobby from instantly "matching" everything.
 */
export function isVenueMatched(squad: Squad, venueId: string): boolean {
  const likes = squad.likes?.[venueId] ?? [];
  return squad.members.length >= 2 && likes.length >= squad.members.length;
}

// ── Friends (asynchronous solo-mode matching) ────────────────────────────────
//
// Deliberately NOT squads. A squad is a synchronous, ephemeral session with one
// shared deck and all-members consensus; a friendship is persistent, pairwise,
// and matches off each person's own solo swiping whenever it happened.

/** Denormalized snapshot of a friend, so the pair never reads users/{uid}. */
export interface FriendProfileSnapshot {
  displayName: string;
  photoURL: string | null;
  expoPushToken?: string | null;
}

export type FriendshipStatus = 'pending' | 'accepted';

/**
 * friendships/{pairId}, where pairId is the two uids sorted and joined with
 * '_'. The ID is derived rather than random on purpose: it makes a duplicate
 * request structurally impossible and lets either side address the document
 * without a query.
 */
export interface Friendship {
  users: string[]; // exactly two uids — array-contains drives the friends list
  status: FriendshipStatus;
  requestedBy: string; // uid that sent the request
  profiles: Record<string, FriendProfileSnapshot>;
  createdAt: FirestoreTimestamp | Date;
  updatedAt: FirestoreTimestamp | Date;
}

export interface FriendshipWithId extends Friendship {
  id: string;
}

/** friendCodes/{code} — the only way to resolve a code to a uid. */
export interface FriendCodeDoc {
  uid: string;
  createdAt: FirestoreTimestamp | Date;
}

/**
 * userLikes/{uid} — venue IDs this user right-swiped in SOLO mode, readable by
 * accepted friends only.
 *
 * One document per user rather than copying each like into every friendship:
 * fan-out would cost one write per friend per swipe, which at 50 friends turns
 * a 15-swipe session into 750 writes. Matching is a set intersection computed
 * on the client instead, so the write cost stays flat at one per swipe.
 */
export interface UserLikes {
  venueIds: string[];
  updatedAt: FirestoreTimestamp | Date;
}

/** Deterministic friendship document ID for a pair of uids. */
export function friendshipIdFor(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/** The other participant's uid. */
export function friendUidOf(friendship: Friendship, myUid: string): string {
  return friendship.users.find((uid) => uid !== myUid) ?? myUid;
}

/**
 * A venue you and this friend both right-swiped. Grouped EGOCENTRICALLY in the
 * UI: "you, Ben and Cara liked X" means each of them matched with YOU, not that
 * Ben and Cara are friends with each other — verifying that would mean reading
 * a friendship document you aren't part of, which the rules (correctly) forbid.
 */
export interface FriendMatch {
  venueId: string;
  friendUids: string[];
}
