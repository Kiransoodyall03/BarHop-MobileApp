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
  category: string; // Primary category (first of categories); kept for consumer-app compatibility
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
}

// A venue as fetched from Firestore: document data + the document ID, which
// is what the B2B dashboard keys analytics on (venues/{id}/analytics).
export interface VenueWithId extends Venue {
  id: string;
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
  location?: StoredLocation;
  locationPermission?: LocationPermissionState;
  profileCompleted?: boolean;
  consumerTier?: ConsumerTier; // set by future consumer billing; absent = free
  createdAt?: FirestoreTimestamp | Date;
  updatedAt?: FirestoreTimestamp | Date;
}

// Preference chips shown during onboarding/editing — mirrors the category
// vocabulary venues use in the Creator webapp.
export const VENUE_CATEGORIES = [
  'bar',
  'club',
  'lounge',
  'pub',
  'cocktail bar',
  'wine bar',
  'rooftop',
  'live music',
] as const;

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
}

export const EMPTY_FILTERS: VenueFilters = {
  maxDistanceKm: null,
  genres: [],
  dressCode: null,
  maxCover: null,
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
