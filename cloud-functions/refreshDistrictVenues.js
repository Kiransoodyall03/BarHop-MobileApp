// ─────────────────────────────────────────────────────────────────────────────
// refreshDistrictVenues — the ONLY thing in the system that calls Foursquare.
//
// ⚠️  THIS FILE DOES NOT DEPLOY FROM THIS REPO. It is staged here because the
//     mobile app defines the Firestore contract it writes. Copy it into the
//     Creator webapp repo's functions/ directory (where the existing Foursquare
//     proxy and Paystack handlers live) and export it from that index.js.
//
//     Deploy SCOPED:
//         firebase deploy --only functions:refreshDistrictVenues
//
//     An unscoped `--only functions` from either repo DELETES every function
//     the other repo owns — both deploy into the same Firebase project.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//11
// Calling a places API per user does not scale: 1 000 people in one district
// would mean 1 000 identical calls (~$7 000/month at Foursquare's Pro rate).
// Caching in the app does not fix it either — app memory is per-device, so
// 1 000 devices still make 1 000 calls. The cache has to be SHARED.
//
// So the call happens exactly once per district per day, here, and the result
// is fanned out through Firestore. Cost is a function of DISTRICT COUNT and is
// completely independent of how many users the app has:
//
//     20 districts × 1/day × 30 days = 600 calls/month ≈ $1.50
//     (first 500 Pro calls are free; ≤16 districts is free outright)
//
// ── Pricing: this function runs at PREMIUM rate, deliberately ───────────────
//
// Foursquare bills Search at PRO rate while it requests only default fields
// (10 000 free calls/month, then $15.00 CPM). Naming ANY premium field in
// `fields` — photos, tips, hours, ratings — reprices the call to PREMIUM
// ($18.75 CPM, billed from the first call, no free allowance).
//
// We accept that, because a deck of photo-less cards does not work. Note the
// cost depends entirely on WHICH approach you take, and the difference is three
// orders of magnitude:
//
//   THIS approach — photos inline via `fields` on the district search.
//   Still ONE call per district per day; only the rate changes.
//       11 districts × 30 days = 330 calls ≈ $6.19/month
//
//   The trap — a separate Place Photos call per venue.
//       20 districts × 50 venues × 30 days = 30 000 calls ≈ $562/month
//
// So: never fetch photos per venue. Fetching them per DISTRICT is cheap, and is
// what the `fields` list below does.
//
// Hours and ratings are still NOT requested. They are premium too, but unlike
// photos they change fast enough that a daily snapshot would be misleading —
// the card handles their absence ("Hours TBD"). Adding them costs nothing extra
// now that the call is already Premium, but only add them if the staleness is
// acceptable.
// ─────────────────────────────────────────────────────────────────────────────

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const FOURSQUARE_API_KEY = defineSecret('FOURSQUARE_API_KEY');

const PLACES_SEARCH_URL = 'https://places-api.foursquare.com/places/search';
const PLACES_API_VERSION = '2025-06-17';

// TODO(verify): confirm against the CURRENT Foursquare taxonomy before the
// first production run — the v3 category IDs did not all carry over to the
// new places-api host. Wrong IDs here silently return coffee shops instead of
// bars, which is worse than an empty deck. Cross-check with the category IDs
// the Creator webapp's existing Foursquare proxy already uses.
const NIGHTLIFE_CATEGORY_IDS = ['4d4b7105d754a06376d81259']; // Nightlife Spot (root)

// Hard ceiling on calls per run. A district registry that grows by accident
// (or a bad import) must not silently escalate the bill — better to skip the
// tail and log loudly.
const MAX_DISTRICTS_PER_RUN = 40;

// Keep snapshots comfortably inside Firestore's 1 MiB document limit. A photo
// URL adds ~120 bytes per venue, so 60 venues ≈ 7 KB — nowhere near the ceiling.
const MAX_VENUES_PER_DISTRICT = 60;

// Explicit field list. ⚠️ Passing `fields` at all turns OFF the defaults, so
// every field the stub needs must be named here — omit `name` and every venue
// comes back nameless. `photos` is the one premium entry and the reason this
// call bills at Premium rate (see the header).
const PLACE_FIELDS = [
  'fsq_place_id',
  'name',
  'location',
  'categories',
  'latitude',
  'longitude',
  'photos',
].join(',');

// Foursquare photo URLs are assembled as `${prefix}${size}${suffix}`. A bounded
// size rather than `original`: South African mobile data is among the most
// expensive on the continent, and an image-heavy swipe deck pulling 2000px
// originals is a real uninstall driver. 800px covers a full-bleed card on a 3x
// phone without paying for detail nobody sees.
const PHOTO_SIZE = '800x800';

const SNAPSHOT_TTL_HOURS = 36; // > the 24h refresh, so a skipped run isn't fatal

exports.refreshDistrictVenues = onSchedule(
  {
    // Daily, not hourly. Venue EXISTENCE changes over weeks — a bar does not
    // open or close within six hours — and every genuinely fast-moving field
    // (hours, ratings, photos) is premium and deliberately not fetched. A
    // faster cadence would multiply cost while changing nothing.
    schedule: 'every day 04:00',
    timeZone: 'Africa/Johannesburg',
    secrets: [FOURSQUARE_API_KEY],
    retryCount: 1,
  },
  async () => {
    const db = admin.firestore();

    const districtsSnap = await db
      .collection('districts')
      .where('active', '==', true)
      .get();

    if (districtsSnap.empty) {
      logger.warn('refreshDistrictVenues: no active districts configured; nothing to do');
      return;
    }

    const districts = districtsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (districts.length > MAX_DISTRICTS_PER_RUN) {
      logger.error(
        `refreshDistrictVenues: ${districts.length} active districts exceeds the ` +
          `${MAX_DISTRICTS_PER_RUN} ceiling — truncating. Raise MAX_DISTRICTS_PER_RUN ` +
          'deliberately if this growth is intended.'
      );
    }
    const batchOfDistricts = districts.slice(0, MAX_DISTRICTS_PER_RUN);

    const apiKey = FOURSQUARE_API_KEY.value();
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + SNAPSHOT_TTL_HOURS * 60 * 60 * 1000
    );

    let succeeded = 0;

    // Sequential on purpose: a handful of districts a day needs no concurrency,
    // and serial calls stay far clear of Foursquare's rate limits.
    for (const district of batchOfDistricts) {
      try {
        const venues = await searchDistrict(district, apiKey);

        await db.collection('districtVenues').doc(district.id).set({
          districtId: district.id,
          name: district.name,
          center: district.center,
          radiusM: district.radiusM,
          venues,
          source: 'foursquare',
          fetchedAt: now,
          expiresAt,
        });

        succeeded += 1;
        logger.info(`refreshDistrictVenues: ${district.id} → ${venues.length} venues`);
      } catch (error) {
        // One bad district must not abort the rest — the others' snapshots are
        // still worth refreshing, and a stale snapshot beats no snapshot.
        logger.error(`refreshDistrictVenues: ${district.id} failed`, error);
      }
    }

    // Rewrite the client-facing index LAST, from the districts that exist —
    // one small document so locating a user costs a single read no matter how
    // many districts there are.
    await db
      .collection('districtIndex')
      .doc('current')
      .set({
        districts: batchOfDistricts.map((d) => ({
          id: d.id,
          name: d.name,
          center: d.center,
          radiusM: d.radiusM,
        })),
        updatedAt: now,
      });

    logger.info(
      `refreshDistrictVenues: ${succeeded}/${batchOfDistricts.length} districts refreshed ` +
        `(${succeeded} Foursquare Pro calls billed)`
    );
  }
);

/** One Pro-tier Place Search for a district. Default fields only — see header. */
async function searchDistrict(district, apiKey) {
  const params = new URLSearchParams({
    ll: `${district.center.latitude},${district.center.longitude}`,
    radius: String(district.radiusM),
    limit: String(Math.min(MAX_VENUES_PER_DISTRICT, 50)), // Foursquare caps limit at 50
    fsq_category_ids: (district.categoryIds ?? NIGHTLIFE_CATEGORY_IDS).join(','),
    // Names `photos`, so this call bills at Premium rate — one call per
    // district, ~$6/month across 11 districts. See the header.
    fields: PLACE_FIELDS,
  });

  const response = await fetch(`${PLACES_SEARCH_URL}?${params}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Places-Api-Version': PLACES_API_VERSION,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Foursquare ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  return (body.results ?? [])
    .map(toStubVenue)
    .filter((v) => v !== null)
    .slice(0, MAX_VENUES_PER_DISTRICT);
}

/**
 * Foursquare place → the mobile app's StubVenue (src/types.ts).
 *
 * placeId MUST be the Foursquare place ID: the Creator webapp sources
 * owner-created venues from the same provider, so this is the key the mobile
 * app dedupes on. A venue an owner has already claimed is dropped from the
 * deck's stub list by that match — get this wrong and users see the same bar
 * twice, once bare and once with the owner's real card.
 */
function toStubVenue(place) {
  const placeId = place.fsq_place_id ?? place.fsq_id;
  const latitude = place.latitude ?? place.geocodes?.main?.latitude;
  const longitude = place.longitude ?? place.geocodes?.main?.longitude;

  // Coordinates are non-negotiable: without them the venue can't be distance
  // filtered or mapped, and resolveVenueCoords would fall back to its
  // deterministic JHB-CBD dummy — a pin in the wrong place is worse than no pin.
  if (!placeId || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  // COMPLIANCE: X18 places never enter the shared deck. An owner reaches the
  // deck only by claiming a venue in the Creator webapp, which puts the FPB
  // distributor-licence terms in front of them (Settings → Legal & Compliance);
  // an auto-created stub bypasses that entirely. Distinct from the taxonomy
  // question below — this is a licensing gate, not a vocabulary gap.
  if (isAdultVenue(place.categories)) return null;

  const categories = normalizeCategories(place.categories);

  const photoUrl = firstPhotoUrl(place.photos);

  return {
    placeId,
    name: place.name ?? 'Unnamed venue',
    address: place.location?.formatted_address ?? place.location?.address ?? '',
    // OMITTED, never defaulted, when nothing maps. A `category: 'bar'` fallback
    // used to sit here and silently mislabelled every unmapped nightlife place
    // — comedy clubs, casinos, hookah bars — as a bar, so all of them matched
    // the `bar` chip. It also made normalizeCategories' documented contract
    // unreachable: returning [] is meant to leave a venue untagged so the app's
    // lenient filter keeps it, but the app unions the singular `category` into
    // its tag list, so a defaulted value meant no stub was ever untagged.
    ...(categories.length ? { category: categories[0], categories } : {}),
    latitude,
    longitude,
    // Absent when the place has no photo — the card falls back to 🍸 rather
    // than rendering a broken image.
    ...(photoUrl ? { photoUrl } : {}),
  };
}

/**
 * Exactly ONE photo URL for a place, or null.
 *
 * Foursquare returns photos as `prefix` + `suffix` halves that the caller joins
 * around a size. We take the first — Foursquare orders them by its own quality
 * ranking, so the first is the best available without us scoring anything — and
 * store the assembled URL so the app never has to know this format.
 */
function firstPhotoUrl(photos) {
  if (!Array.isArray(photos)) return null;
  for (const photo of photos) {
    if (photo?.prefix && photo?.suffix) {
      return `${photo.prefix}${PHOTO_SIZE}${photo.suffix}`;
    }
  }
  return null;
}

// Foursquare labels that mean "adult entertainment". Matched as substrings
// against the raw taxonomy, before normalizeCategories drops anything it can't
// map — the point is to recognise these places, not to categorise them.
const ADULT_CATEGORY_MARKERS = [
  'adult',
  'strip club',
  'stripclub',
  "gentlemen's club",
  'gentlemens club',
  'sex shop',
  'brothel',
];

/** True when any raw Foursquare label marks this as an X18 venue. */
function isAdultVenue(rawCategories) {
  return (rawCategories ?? []).some((entry) => {
    const name = entry?.name?.trim().toLowerCase();
    if (!name) return false;
    return ADULT_CATEGORY_MARKERS.some((marker) => name.includes(marker));
  });
}

// Foursquare's taxonomy → the app's VENUE_CATEGORIES vocabulary (src/types.ts).
//
// This is load-bearing for the genre filter, not cosmetic. applyProFilters is
// lenient only toward venues with NO tags at all; a venue tagged "Nightclub"
// is judged against the user's chips and fails, because the app's chip says
// "club". Without this mapping every stub would silently disappear from the
// deck the moment anyone touched the genre filter — the feature would look
// broken exactly when it was being used.
const CATEGORY_ALIASES = {
  bar: 'bar',
  'beer bar': 'bar',
  'beer garden': 'bar',
  'sports bar': 'sports bar',
  'dive bar': 'bar',
  'hotel bar': 'bar',
  'karaoke bar': 'bar',
  nightclub: 'club',
  'night club': 'club',
  discotheque: 'club',
  club: 'club',
  lounge: 'lounge',
  'hookah lounge': 'lounge',
  pub: 'pub',
  gastropub: 'pub',
  'irish pub': 'pub',
  'cocktail bar': 'cocktail bar',
  speakeasy: 'cocktail bar',
  'whisky bar': 'cocktail bar',
  'wine bar': 'wine bar',
  winery: 'wine bar',
  'rooftop bar': 'rooftop',
  rooftop: 'rooftop',
  'music venue': 'live music',
  'jazz club': 'live music',
  'rock club': 'live music',
  'live music venue': 'live music',
  // `restaurant` is in BOTH vocabularies but had no alias at all, so no stub
  // could ever carry it — selecting the restaurant chip excluded every
  // auto-created venue.
  restaurant: 'restaurant',
  'gastro restaurant': 'restaurant',
  // NOTE: no `adult entertainment` alias, deliberately. Owners can pick that
  // category in the Creator wizard (it triggers the FPB X18 flow), but stubs
  // bypass that acceptance entirely — so X18 places are dropped outright by
  // isAdultVenue() rather than categorised.
};

const ALIASES_BY_SPECIFICITY = Object.entries(CATEGORY_ALIASES).sort(
  (a, b) => b[0].length - a[0].length
);

function normalizeCategories(rawCategories) {
  const mapped = new Set();
  for (const entry of rawCategories ?? []) {
    const name = entry?.name?.trim().toLowerCase();
    if (!name) continue;

    const exact = CATEGORY_ALIASES[name];
    if (exact) {
      mapped.add(exact);
      continue;
    }
    // Fall back to a substring hit so unseen Foursquare labels ("Cocktail Bar
    // & Grill") still land in the right bucket. LONGEST alias first — plain
    // "bar" is a substring of "cocktail bar", so naive key order would bucket
    // every cocktail bar as a generic bar.
    for (const [alias, canonical] of ALIASES_BY_SPECIFICITY) {
      if (name.includes(alias)) {
        mapped.add(canonical);
        break;
      }
    }
  }
  // Returning [] when nothing maps is intentional: an untagged venue hits
  // applyProFilters' lenient path and stays in the deck, rather than being
  // excluded by a vocabulary mismatch it had no say in.
  return [...mapped].slice(0, 3);
}
