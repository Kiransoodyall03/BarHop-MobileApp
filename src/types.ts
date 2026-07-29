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
  // A single Foursquare photo URL, fetched ONCE per venue by the refresh
  // function and cached in the snapshot (only new venues cost a Premium call).
  // Absent ⇒ the card shows the 🍸 fallback.
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
export type ConsumerTier = 'free' | 'pro' | 'elite';

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
  isActive: boolean;
  likes?: Record<string, string[]>; // venueId → uids who right-swiped
  // Squad capacity follows the HOST's consumer tier at creation time.
  // Absent (legacy squads) ⇒ treated as free.
  tier?: ConsumerTier;
  // Host-set deck filters, inherited live by every member so decks stay
  // identical (consensus requires everyone to see the same venues).
  filters?: VenueFilters;
  createdAt: FirestoreTimestamp | Date;
}

/**
 * A venue matches when every current member right-swiped it. The >= 2 guard
 * stops a lone host in the lobby from instantly "matching" everything.
 */
export function isVenueMatched(squad: Squad, venueId: string): boolean {
  const likes = squad.likes?.[venueId] ?? [];
  return squad.members.length >= 2 && likes.length >= squad.members.length;
}
