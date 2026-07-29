# BarHop — Cross-Repo Contract Reconciliation

**From:** BarHop-MobileApp
**To:** barhop-creator-webapp (shared Firebase project `barhop-creator-webapp-ee9a8`)
**Date:** 2026-07-27
**Status:** proposed — no code changed in either repo yet

Three changes to the shared contract, in dependency order. Each is small on its
own; together they unblock four consumer features that are currently built but
inert, and they close two defects that are live in production today.

Written against the webapp's own Feature Inventory (§ references below point at
that document) and verified against the mobile source at the line references
given.

| # | Change | Repo(s) | Blocking |
|---|---|---|---|
| 1 | Add 8 fields to `venues/{venueId}` (§6.1) | webapp | distance, distance filter, Pro filters, Vibe Check, offers |
| 2 | Reconcile the category vocabulary (§6.6) | both + functions | genre filter correctness — **defect, live now** |
| 3 | Widen the analytics rules (§6.2) | webapp | 2 of 4 owner dashboard KPIs — **defect, live now** |

Two prerequisites sit outside this document and should land first, because
neither depends on anything here:

- **Deploy `revenueCatWebhook`** (§5, §8). It is written but undeployed, so
  `users/{uid}.consumerTier` is never written. Consumers who pay get Pro from
  the local RevenueCat entitlement mirror only
  (`src/services/purchasesModule.ts:42`); it does not survive a reinstall or a
  device change, and §6.3's `tierUnchanged()` pin means no client can repair it.
  Needs `REVENUECAT_WEBHOOK_SECRET` set. While it is unset, *every* deploy from
  the functions codebase fails.
- **Decide the `elite` tier.** `src/types.ts:184` declares
  `ConsumerTier = 'free' | 'pro' | 'elite'` and `useConsumerSubscription.ts:26`
  grants `elite` unlimited squads/members/itinerary stops. §4 says the consumer
  namespace is `free → pro` only, and no writer can produce `elite`. Either
  spec it (rules pin + `revenueCatWebhook` mapping, per §7 row 4) or delete it
  from mobile. Leaving it is an unreachable privilege path.

---

## Change 1 — `venues/{venueId}` field additions

### 1.1 Why

§6.1's field list is the complete set the webapp writes. Mobile reads eight
fields that are not in it. Because `applyProFilters`
(`src/utils/venueFilters.ts:23`) is deliberately **lenient toward missing
data** — a venue with no value for a filtered field is kept, not excluded —
none of these produce an error. They produce silence:

- **`latitude` / `longitude`** — absent, so `resolveVenueCoords`
  (`src/utils/venueCoords.ts:16`) falls through to its tier-3 fallback:
  *deterministic dummy coordinates scattered ~3 km around the JHB CBD*. Every
  owner-created venue — that is, every venue belonging to a paying customer —
  is mapped to a fictional location. `maxDistanceKm`, the one free-tier filter,
  is filtering on that fiction today.
- **`dressCode` / `coverCharge` / `musicGenres` / `dietaryOptions`** — absent
  from every venue, so all four Pro filters pass everything. **Pro "advanced
  filters" is a paid feature that cannot currently narrow a deck.**
- **`currentBusyness`** — the `hasVibeCheck` Pro flag has no data source at all.
- **`offers`** — mobile declares `offers: any[]` (`src/types.ts:49`) and
  `VenueDetailsSheet.tsx:161` tells unclaimed owners they can add "offers" as
  part of the claim pitch. The wizard never captures one.

The district cache already gets this right for coordinates — `toStubVenue`
treats them as non-negotiable and drops any place without them
(`cloud-functions/refreshDistrictVenues.js:207`). Owner venues, which cost real
money, are held to a lower standard than free auto-generated stubs.

### 1.2 Fields to add to §6.1

Types are given as they already exist in `src/types.ts:37-80`. Mobile needs no
change for any of these — it reads them all today.

| Field | Type | Source | Notes |
|---|---|---|---|
| `latitude` | `number` | Foursquare lookup, step 1 | See 1.3 |
| `longitude` | `number` | Foursquare lookup, step 1 | See 1.3 |
| `dressCode` | `'casual' \| 'smart-casual' \| 'formal'` | new wizard step | Optional |
| `coverCharge` | `number` (ZAR; `0` = free entry) | new wizard step | Optional |
| `musicGenres` | `string[]` | new wizard step | Vocabulary in 1.5 |
| `dietaryOptions` | `string[]` (lowercase) | new wizard step | Vocabulary in 1.5 |
| `currentBusyness` | `'quiet' \| 'lively' \| 'at-capacity'` | dashboard control | See 1.6 |
| `offers` | `Offer[]` | new wizard step | Shape in 1.7 |

### 1.3 Coordinates — smallest change, largest unblock

`CreateVenue.js` step 1 already calls `searchFoursquarePlaces` and stamps
`venues/{id}.placeId` from `fsq_place_id`. The same response object carries the
geometry. Persist it in the same write:

```js
// CreateVenue.js — step 1, where placeId is currently stamped
const lat = place.latitude ?? place.geocodes?.main?.latitude;
const lng = place.longitude ?? place.geocodes?.main?.longitude;

setVenueData((prev) => ({
  ...prev,
  placeId: place.fsq_place_id ?? place.fsq_id,
  ...(typeof lat === 'number' && typeof lng === 'number'
    ? { latitude: lat, longitude: lng }
    : {}),
}));
```

The `??` chain mirrors `toStubVenue` at
`cloud-functions/refreshDistrictVenues.js:201-202` — the Places API returns
geometry at either path depending on endpoint. Keep the two in sync.

`createVenue()` must then include `latitude`/`longitude` in its allowed write
set, and `firestore.rules` must permit them on the venue document.

**Backfill:** existing venues have a `placeId` but no coordinates. A one-off
admin script resolving `placeId → geometry` via the existing Foursquare proxy
is worth writing; without it, every venue created before this change keeps its
dummy pin. Budget one Foursquare call per existing venue against the 500/month
free Pro allowance (§3 admin console shows the current count).

**Do not ship the mobile distance label before this lands.** Mobile has
`haversineKm` (`src/utils/geo.ts:15`), the user's stored location
(`src/services/profileService.ts:82`), and a placeholder at
`src/components/VenueCard.tsx:133` — the label is ~20 lines. Shipping it first
would print confident, wrong distances for exactly the venues that pay.

### 1.4 Wizard placement

Current wizard: **Identity → Category → Images → Operations**.

Recommended: extend **Operations** rather than adding a fifth step. It already
holds hours, socials and border style; `dressCode`, `coverCharge`,
`musicGenres`, `dietaryOptions` and `offers` are the same kind of data, and a
fifth step measurably worsens wizard completion.

All five are optional. Mobile's leniency means a blank field costs the owner
nothing except reach — which is the argument the UI should make: *"venues that
set these appear in filtered searches."*

### 1.5 Vocabularies that must match mobile exactly

**`musicGenres`** — mobile matches these against the same chip list as
categories (`FILTER_GENRE_OPTIONS`, `src/types.ts:281`), lowercase:

```
amapiano, techno, house, rnb, hip-hop, jazz
```

**`dietaryOptions`** — `DIETARY_OPTIONS`, `src/types.ts:239`, stored lowercase:

```
halal, vegetarian, vegan, gluten-free, kosher, pescatarian
```

**`dressCode`** — `DRESS_CODE_OPTIONS`, `src/types.ts:291`:

```
casual, smart-casual, formal
```

**`coverCharge`** — free-form ZAR integer. Mobile filters against ceilings of
0 / 50 / 100 / 150 (`MAX_COVER_OPTIONS`, `src/types.ts:297`), so any value
works; `0` explicitly means free entry, not "unset".

Matching is `toLowerCase()` on both sides for genres and dietary. `dressCode`
is compared with strict equality (`src/utils/venueFilters.ts:39`) — a
capitalised or space-separated value silently never matches.

### 1.6 `currentBusyness` — dashboard control, not wizard

This is a *tonight* value, not a card property. It belongs on `/dashboard` as a
three-state toggle the owner flips on the night, ideally auto-clearing at close
(a scheduled function reading `hours{}`, or a `busynessUpdatedAt` timestamp
mobile can treat as stale after ~4h).

Mobile gates it behind Pro (`hasVibeCheck`), so a stale value is worse than
none — a Pro subscriber seeing "lively" on a venue that closed two nights ago
is a support ticket. Recommend shipping the staleness rule with the field.

Manual owner updates alone will produce sparse data. The mobile roadmap has a
crowdsourced alternative (dwell-detect → prompt), but it needs background
geolocation and user density, so owner-entry is the correct first version.

### 1.7 `offers` — shape

Mobile's `offers: any[]` is deliberately untyped pending this decision.
Proposed, and mobile will type against it:

```ts
interface Offer {
  id: string;
  title: string;        // "2-for-1 cocktails" — max ~40 chars, shown on the card
  description?: string; // shown in VenueDetailsSheet only
  validFrom?: Timestamp;
  validUntil?: Timestamp;
  daysOfWeek?: number[]; // 0=Sun … 6=Sat; absent = every day
  active: boolean;
}
```

Time-boxing matters: an expired offer on a swipe card is worse than no offer.
Mobile will filter on `active && (validUntil ?? ∞) > now && daysOfWeek ∋ today`
client-side, so no scheduled function is needed for correctness.

Gating suggestion: offers are a strong Starter→Pro upgrade lever, and they are
the most concrete thing the claim funnel can promise. Worth deciding
deliberately rather than defaulting to ungated.

### 1.8 Follow-through per §7 row 1

For each new field rendered on the card, §7 requires four things. Status:

| Step | Fields affected |
|---|---|
| `CreateVenue` captures it | dressCode, coverCharge, musicGenres, dietaryOptions, offers (+ latitude/longitude silently) |
| `createVenue()` writes it | all 8 |
| `toPreviewData()` maps it | offers, dressCode, coverCharge (the card-visible ones) |
| `CardChecklist` row | offers — recommended; it is the clearest "your card is incomplete" nudge |

Note §8's existing checklist defect: `video` is a checklist row with no
uploader, so that row can never be completed. Adding an `offers` row without an
editor would repeat it.

---

## Change 2 — category vocabulary

### 2.1 The drift is three-way, not two-way

§6.6 names two places that must agree. There are three, and all three differ:

| Value | Webapp `VENUE_CATEGORIES` | Mobile `VENUE_CATEGORIES` (`src/types.ts:225`) | `CATEGORY_ALIASES` output (`refreshDistrictVenues.js:232`) |
|---|:---:|:---:|:---:|
| `bar` | ✅ | ✅ | ✅ |
| `club` | ✅ | ✅ | ✅ |
| `lounge` | ✅ | ✅ | ✅ |
| `rooftop` | ✅ | ✅ | ✅ |
| `restaurant` | ✅ | ✅ | ❌ **no alias** |
| `pub` | ❌ | ✅ | ✅ |
| `cocktail bar` | ❌ | ✅ | ✅ |
| `wine bar` | ❌ | ✅ | ✅ |
| `live music` | ❌ | ✅ | ✅ |
| `sports bar` | ✅ | ❌ | ❌ **collapsed → `bar`** |
| `adult entertainment` | ✅ | ❌ | ❌ |

`CATEGORY_ALIASES` targets the **mobile** vocabulary, not the webapp's.

### 2.2 What breaks, precisely

`applyProFilters` (`src/utils/venueFilters.ts:29-37`) is lenient **only** when a
venue has zero tags. Owner venues and stubs both always carry at least one, so
every mismatch is an exclusion:

1. **Selecting `pub`, `cocktail bar`, `wine bar` or `live music` excludes every
   owner-created venue.** Stubs match (aliases emit these values); owner venues
   cannot hold them, so they fail the overlap test. The filter hides exactly the
   venues whose owners pay — the inverse of what the business wants.
2. **Selecting `restaurant` excludes every stub.** No alias maps to it, so no
   stub ever carries it.
3. **`sports bar` is unreachable and unfilterable.** Owners can select it;
   mobile has no chip for it; `CATEGORY_ALIASES` collapses Foursquare's
   `sports bar` to `bar`. An owner who picks it is excluded by *every* filter
   selection a user can make.
4. **`adult entertainment` is unfilterable in either direction** — a user can
   neither seek it nor avoid it, and any filter selection silently excludes it.

Mobile enforces 18+ at onboarding (`dateOfBirth`, `src/types.ts:199`), so the
age floor exists. But X18 venues currently reach the deck with none of the FPB
context §2.7 builds owner-side.

### 2.3 Recommendation — one canonical list of 11

Adopt the union. The four mobile-only values are genuine nightlife distinctions
worth filtering on, and the two webapp-only values are real venue types that
should not be silently collapsed.

```
bar, club, lounge, pub, cocktail bar, wine bar,
rooftop, live music, restaurant, sports bar, adult entertainment
```

**Webapp** — extend `VENUE_CATEGORIES` in `CreateVenue.js` with the four
missing values. Keep the 3-pick cap and the existing FPB branch on
`adult entertainment`.

**Mobile** — split the constant, because one list currently serves two
different jobs:

```ts
// src/types.ts — canonical matching vocabulary (11), mirrors the webapp
export const VENUE_CATEGORIES = [...] as const;

// Subset offered as onboarding preference chips. Excludes
// 'adult entertainment': a favourite-category chip is the wrong surface for
// it. It stays in VENUE_CATEGORIES so venues carrying it still match, and in
// FILTER_GENRE_OPTIONS so users can seek or avoid it deliberately.
export const ONBOARDING_CATEGORY_CHIPS = [...] as const;
```

`FILTER_GENRE_OPTIONS` (`src/types.ts:281`) continues to spread
`VENUE_CATEGORIES`, so all 11 become filterable. `PreferencesScreen` and
`EditProfileScreen` switch to `ONBOARDING_CATEGORY_CHIPS`.

**`CATEGORY_ALIASES`** — three edits:

```js
'sports bar': 'sports bar',   // was: 'bar' — stop collapsing a real category

// restaurant had no mapping at all, so no stub could ever carry it
restaurant: 'restaurant',
'gastro restaurant': 'restaurant',
```

Do **not** add `adult entertainment` aliases. Auto-created stubs bypass the FPB
X18 acceptance flow that §2.7 requires of owners, so X18 venues should enter the
deck only by being claimed. Leaving them unmapped means Foursquare X18 places
either map to nothing (dropped by the lenient path, staying in the deck as
untagged) or are excluded — verify which, and if they can appear untagged,
filter them out explicitly in `toStubVenue` and note it in Settings' compliance
tab.

### 2.4 Two related checks while in this file

- `NIGHTLIFE_CATEGORY_IDS` (`refreshDistrictVenues.js:57`) carries a
  `TODO(verify)`: the v3 category IDs did not all survive the move to
  `places-api.foursquare.com`. Wrong IDs return coffee shops instead of bars.
  Cross-check against the IDs the existing webapp Foursquare proxy already uses
  **before** the first production run.
- §5 states the mobile `cloud-functions/` copies are staging only. Confirm the
  **deployed** `refreshDistrictVenues` matches the staged file before editing —
  if it has drifted, this table describes the staged copy, not production.

---

## Change 3 — analytics rules delta (§6.2)

### 3.1 Why

The dashboard (§2.4) renders four KPI cards. Two of them cannot ever show a
non-zero number:

- **Profile Expansions** reads `clickThroughs`
- **Group Matches** reads `matchRate`

§8 confirms neither has a writer. The rules permit the owner to write them
(`allow read, write: if isVenueOwner(venueId)`), but the owner is not the party
that knows — mobile is, and the client rule caps writes to exactly
`date`, `swipedRight`, `swipedLeft` (`firestore.rules.example:110-128`). Mobile
therefore writes only those three (`src/services/swipeService.ts:50-58`).

**Half of the first dashboard a new paying owner sees is dead.** That is the
worst possible moment for it.

### 3.2 Field naming

Write **counters**, not rates. `matchRate` cannot be incremented atomically by
concurrent clients; a rate must be derived. Proposal:

- mobile writes `clickThroughs` (details sheet opened) and `groupMatches`
  (venue became a squad match)
- the dashboard derives `matchRate = groupMatches / swipedRight`, exactly as it
  already derives impressions as `swipedRight + swipedLeft`

This requires a small change in the webapp's `analyticsService` /
`aggregateAnalyticsSummary` to read `groupMatches` instead of `matchRate`.

### 3.3 Replacement rules block

Replaces `firestore.rules.example:101-129`. Structure and comment style follow
the existing block deliberately — the create/update duplication is kept rather
than factored into a helper, because `resource` is null on create and a shared
helper would need a null branch that reads worse than the repetition.

```
      // --- ANALYTICS SUBCOLLECTION (daily interaction logs) ---
      match /analytics/{analyticsId} {
        // Owner (B2B dashboard): full access — reads every field, writes any
        // server/owner-derived aggregate.
        allow read, write: if request.auth != null && isVenueOwner(venueId);

        // MOBILE APP: a signed-in consumer may record ONE interaction by
        // CREATING today's counter doc. Exactly one counter across the whole
        // set may be 1; everything else must be 0 or absent.
        //
        // Adding a name to this list makes it writable by ANY signed-in user.
        // Keep it to counters the dashboard treats as directional signal, never
        // as authoritative revenue or billing data.
        allow create: if request.auth != null
          && request.resource.data.keys().hasOnly(
               ['date', 'swipedRight', 'swipedLeft', 'clickThroughs', 'groupMatches'])
          && request.resource.data.date is timestamp
          && request.resource.data.get('swipedRight', 0) is int
          && request.resource.data.get('swipedLeft', 0) is int
          && request.resource.data.get('clickThroughs', 0) is int
          && request.resource.data.get('groupMatches', 0) is int
          && request.resource.data.get('swipedRight', 0) >= 0
          && request.resource.data.get('swipedLeft', 0) >= 0
          && request.resource.data.get('clickThroughs', 0) >= 0
          && request.resource.data.get('groupMatches', 0) >= 0
          && request.resource.data.get('swipedRight', 0)
             + request.resource.data.get('swipedLeft', 0)
             + request.resource.data.get('clickThroughs', 0)
             + request.resource.data.get('groupMatches', 0) == 1;

        // …or bumping the counters on an existing doc, one interaction at a
        //    time, without touching any owner-written field and never
        //    decreasing.
        allow update: if request.auth != null
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(
               ['date', 'swipedRight', 'swipedLeft', 'clickThroughs', 'groupMatches'])
          && request.resource.data.get('swipedRight', 0) >= resource.data.get('swipedRight', 0)
          && request.resource.data.get('swipedLeft', 0) >= resource.data.get('swipedLeft', 0)
          && request.resource.data.get('clickThroughs', 0) >= resource.data.get('clickThroughs', 0)
          && request.resource.data.get('groupMatches', 0) >= resource.data.get('groupMatches', 0)
          && (request.resource.data.get('swipedRight', 0) - resource.data.get('swipedRight', 0))
             + (request.resource.data.get('swipedLeft', 0) - resource.data.get('swipedLeft', 0))
             + (request.resource.data.get('clickThroughs', 0) - resource.data.get('clickThroughs', 0))
             + (request.resource.data.get('groupMatches', 0) - resource.data.get('groupMatches', 0)) == 1;
      }
```

⚠️ Per §6.5, **a rules deploy replaces the entire ruleset.** This block must be
merged into the webapp's complete `firestore.rules` — mobile's
`firestore.rules.example` is a reference copy and deploys nothing.

### 3.4 Mobile side, once the rules land

Two call sites, both mirroring `recordSwipe`'s existing upsert shape
(`src/services/swipeService.ts:50-58`) — deterministic day-keyed doc ID,
`increment()`, `set(..., { merge: true })`, and the same `skipAnalytics()` guard
so stubs are excluded:

| Counter | Trigger |
|---|---|
| `clickThroughs` | `VenueDetailsSheet` opens |
| `groupMatches` | `MatchModal` fires on a squad match |

Debounce `clickThroughs` per venue per session, or reopening a sheet inflates it.

### 3.5 Known limitation, unchanged by this delta

Any signed-in user can inflate any venue's counters — the analytics create rule
deliberately does not verify venue ownership or that a swipe actually occurred.
This is already true for `swipedRight`/`swipedLeft`; the delta widens the
surface but introduces no new class of abuse. If it ever matters, the fix is a
callable that validates against `users/{uid}/swipedVenues`, not a rules tweak.

---

## Change 4 — not in scope, but the gap worth naming

`skipAnalytics()` (`src/services/swipeService.ts:75`) correctly drops analytics
for district stubs: there is no `venues/{id}` parent, and Firestore would
happily create subcollections under a missing document, littering the venues
collection with phantom paths no dashboard reads.

The consequence is that **auto-created venues accumulate no evidence of
demand.** The claim funnel (`VenueDetailsSheet.tsx:148-162`) currently argues
aesthetics — *add photos, hours, offers.* The far stronger argument is numeric:
*"412 people swiped right on your venue last month."*

That needs a server-written collection keyed by `placeId` rather than
`venueId` (stub IDs are synthetic, and the whole point is that no venue
document exists yet), plus an admin surface. It is a genuine new feature, not a
reconciliation, so it is out of scope here — but it is the highest-leverage
thing the B2B side could build on top of the district cache, and it should be
decided before the cache is seeded across all 11 JHB districts.

---

## Deploy order

1. Set `REVENUECAT_WEBHOOK_SECRET`; deploy `revenueCatWebhook` scoped.
   *(Unblocks consumer revenue and unblocks every other functions deploy.)*
2. Merge Change 3 into the complete ruleset; deploy rules. *(Rules before
   writers — mobile writes fail closed, never open.)*
3. Change 2: webapp `VENUE_CATEGORIES`, mobile constants split,
   `CATEGORY_ALIASES` edits. Deploy `refreshDistrictVenues` scoped. Verify the
   next scheduled run before seeding more districts.
4. Change 1: wizard fields + `createVenue()` + `toPreviewData()` + venue rules.
   Backfill coordinates for existing venues.
5. Mobile picks up: distance label, verified badge, offers rendering,
   `clickThroughs`/`groupMatches` writers. None of these need further webapp
   work once 1–4 land.

**Every functions deploy must be scoped** (`--only functions:<name>`). An
unscoped `--only functions` from either repo deletes the other's functions —
both deploy into the same project (§5).

## Verification checklist

- [ ] A user who buys Pro, force-quits and reinstalls still has Pro
- [ ] Owner-created venue shows a real distance on the swipe card, not a JHB-CBD dummy
- [ ] `maxDistanceKm = 5` excludes a venue known to be 20 km away
- [ ] Selecting `cocktail bar` returns owner venues, not just stubs
- [ ] Selecting `restaurant` returns stubs, not just owner venues
- [ ] A `sports bar` venue survives at least one filter selection
- [ ] Setting `dressCode: 'formal'` on one venue makes the formal filter narrow the deck
- [ ] Opening a details sheet increments `clickThroughs`; dashboard Profile Expansions moves
- [ ] A squad match increments `groupMatches`; dashboard Group Matches moves
- [ ] Stub swipes still write **no** `venues/{stubId}/analytics` path
- [ ] Voucher redemption still works end-to-end (`normalizeCode` parity, §6.6 — verified in sync at `src/services/voucherService.ts:42`)
