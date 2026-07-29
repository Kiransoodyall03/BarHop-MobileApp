# BarHop Mobile — Deployment Readiness & Firestore Contract

**Date:** 2026-07-29
**Mobile repo:** `BarHop-MobileApp` @ working tree (uncommitted)
**Webapp repo:** `BarHop-Creator-WebApp/barhop-creator-webapp` @ `72c48a7` (2026-07-27)

Every claim below was verified by reading **both** repos, not from either side's
documentation. Where I could not verify something it says so explicitly.

---

## Part 1 — This session's work

`npx tsc --noEmit` passes clean. Changes, all production-ready:

| Change | Files | Status |
|---|---|---|
| Canonical 11-value category vocabulary + `ONBOARDING_CATEGORY_CHIPS` split | `types.ts`, `PreferencesScreen`, `EditProfileScreen` | ✅ **Unblocks the webapp** — see §4.1 |
| `Venue.category` / `StubVenue.category` made optional | `types.ts` | ✅ Matches webapp's shipped `toStubVenue` |
| Type-predicate filters (`.filter(Boolean)` didn't narrow) | `venueFilters.ts`, `VenueCard.tsx` | ✅ Was a latent crash once category went optional |
| Verified badge on the card front | `VenueCard.tsx` | ✅ See §4.6 for a semantics caveat |
| Trial length/eligibility derived from Play, not hardcoded | `purchasesModule.ts`, `PaywallScreen.tsx` | ✅ |
| Google button themed in dark mode | `AuthScreen.tsx` | ✅ |
| Logo lockup on auth + discovery | `BarHopLogo.tsx`, `assets/logo-on-*.png` | ✅ Derived assets — see note |
| Service-account key patterns gitignored | `.gitignore` | ✅ |

**Note on the logo assets:** `logo-on-light.png` / `logo-on-dark.png` are derived
from `icon.png` by script, not exported from a design source. They're correct,
but a real vector export would have cleaner edges. Swapping the files needs no
code change.

---

## Part 2 — Mobile feature inventory

| Area | Features | Tier gating |
|---|---|---|
| **Auth** | Email/password, Google Sign-In, 18+ DOB enforcement | — |
| **Onboarding** | About You, Preferences (categories + dietary), Location permission | — |
| **Discovery** | Swipe deck, stories-style media, open/closed status, verified badge, unclaimed/claim CTA, ad injection between cards | Ads free-tier only |
| **Venue details** | Full sheet, hours, socials, website/phone deep links, claim funnel | — |
| **Filters** | Distance (free), dietary (free), genre / dress code / cover charge (Pro) | Pro |
| **Squads** | Create/join by 6-char PIN, live member lobby, consensus matching, host-set shared filters, match modal | Size + count by tier |
| **Itinerary** | Solo or squad, stop ordering, map view, haversine travel estimates | Stop count by tier |
| **Monetisation** | RevenueCat paywall (monthly/annual), free trial, restore, voucher redemption | — |
| **Pro gates** | Unlimited swipes, rewind, Vibe Check, advanced filters, larger squads/itineraries, no ads | Pro |
| **Platform** | Light/dark theme, Sentry, AdMob native + rewarded |  — |

---

## Part 3 — Firestore write contract (mobile side)

Mobile touches six collections. **It writes to four**; `districtVenues` and
`districtIndex` are server-written and read-only to the app.

### 3.1 `users/{uid}` — client-owned except six pinned fields

| Field | Type | Writer |
|---|---|---|
| `uid` | `string` | mobile (`authService`) |
| `email` | `string` | mobile |
| `displayName` | `string` | mobile |
| `photoURL` | `string \| null` | mobile |
| `provider` | `string` | mobile |
| `emailVerified` | `boolean` | mobile |
| `accountType` | `'consumer'` | mobile |
| `dateOfBirth` | `string` ISO `YYYY-MM-DD` | mobile |
| `gender` | `'male' \| 'female' \| 'non-binary' \| 'prefer-not-to-say'` | mobile |
| `favoriteCategories` | `string[]` | mobile |
| `dietaryPreferences` | `string[]` lowercase | mobile |
| `location` | `{ latitude: number; longitude: number; … }` | mobile |
| `locationPermission` | `LocationPermissionState` | mobile |
| `profileCompleted` | `boolean` | mobile |
| `createdAt` / `updatedAt` | `Timestamp` | mobile |
| 🔒 `consumerTier` | `'free' \| 'pro' \| 'elite'` | **`revenueCatWebhook` only** |
| 🔒 `consumerTierUpdatedAt` | `Timestamp` | webhook |
| 🔒 `consumerTierSource` | `string` e.g. `revenuecat:RENEWAL` | webhook |
| 🔒 `proGrantExpiresAt` | `Timestamp` | **`redeemVoucher` only** |
| 🔒 `proGrantCode` | `string` | `redeemVoucher` |
| 🔒 `subscriptionTier` | B2B namespace — never written by mobile | Paystack webhook |

🔒 = pinned by `tierUnchanged()` in `firestore.rules`; no client can write them.

### 3.2 `users/{uid}/swipedVenues/{venueId}`

| Field | Type |
|---|---|
| `venueId` | `string` |
| `direction` | `'left' \| 'right'` |
| `swipedAt` | `serverTimestamp()` |

Deleted by Pro Rewind (`undoSwipeRecord`).

### 3.3 `venues/{venueId}/analytics/{YYYY-MM-DD}` — the B2B feed

Upsert with `increment()`, doc ID is a **device-local** day key (SAST).
Stub venues are skipped (`skipAnalytics`).

| Field | Type | Writer | Status |
|---|---|---|---|
| `date` | `Timestamp` (local midnight) | mobile | ✅ |
| `swipedRight` | `int` increment | mobile | ✅ |
| `swipedLeft` | `int` increment | mobile | ✅ |
| `clickThroughs` | `int` increment | mobile | ❌ **rules allow it, no writer exists** |
| `groupMatches` | `int` increment | **`onSquadMatch` (server)** | ✅ correctly excluded from client rules |

### 3.4 `squads/{squadId}`

| Field | Type | Notes |
|---|---|---|
| `pin` | `string` 6-char | invite mechanism |
| `hostId` | `string` uid | |
| `members` | `string[]` uids | consensus denominator |
| `memberNames` | `Record<uid, string>` | denormalised; rules block reading others' profiles |
| `isActive` | `boolean` | host leaving sets false |
| `likes` | `Record<venueId, uid[]>` | drives matching |
| `tier` | `'free' \| 'pro' \| 'elite'` | host's tier at creation; server caps on this |
| `filters` | `VenueFilters` | host-set, inherited live |
| `createdAt` | `serverTimestamp()` | |

`VenueFilters` = `{ maxDistanceKm: number \| null; genres: string[]; dressCode: string \| null; maxCover: number \| null; dietary: string[] }`

### 3.5 `itineraries/{uid | squadId}`

| Field | Type |
|---|---|
| `type` | `'solo' \| 'squad'` |
| `stops` | `ItineraryStop[]` |
| `createdAt` / `updatedAt` | `serverTimestamp()` |

`ItineraryStop` = `{ venueId, name, address, category, imageUrl: string\|null, coords: { latitude, longitude, source: 'venue'\|'places'\|'dummy' } \| null, addedBy, addedAt }`

> `addedAt` is a client `Date`, **not** `serverTimestamp()` — that's required, not
> a bug: `serverTimestamp()` is invalid inside an array element.

### 3.6 `venues/{venueId}` — read-only to mobile

Mobile reads `published == true`. Fields consumed, with the verified webapp writer:

| Field | Type | Webapp writes it? |
|---|---|---|
| `placeId`, `ownerId`, `name`, `address`, `description` | `string` | ✅ |
| `category` | `string?` **optional** | ✅ omitted when unmapped |
| `categories` | `string[]?` | ✅ |
| `images` | `string[]` | ✅ |
| `video` | `string \| null` | ⚠️ no uploader exists |
| `hours` | `OperatingHours` | ✅ |
| `socialLinks` | `{instagram,facebook,tiktok}` | ✅ |
| `latitude` / `longitude` | `number?` | ✅ **now written** |
| `dressCode` | `'casual'\|'smart-casual'\|'formal'` | ✅ |
| `coverCharge` | `number?` ZAR, `0` = free | ✅ omitted when unset |
| `musicGenres` | `string[]` | ✅ |
| `dietaryOptions` | `string[]` | ✅ |
| `offers` | `Offer[]` | ✅ |
| `currentBusyness` | `'quiet'\|'lively'\|'at-capacity'` | ✅ Dashboard control |
| `busynessUpdatedAt` | `Timestamp` | ✅ **mobile doesn't read it yet** |
| `verified` | `boolean` | ✅ hardcoded `true` at creation |
| `published`, `subscriptionTier`, `cardBorderStyle` | | ✅ |

---

## Part 4 — Cross-repo sync status

### 4.1 🔴 `sports bar` — webapp is waiting on a flag mobile just shipped

`functions/refreshDistrictVenues.js:322` has:

```js
// ⚠️ BLOCKED ON MOBILE — do NOT change to "sports bar" yet.
"sports bar": "bar",
```

The comment says to flip it "in the same release as the mobile 11-value list."
**That list shipped this session.** Mobile's `VENUE_CATEGORIES` now carries all
11 values, so the block is lifted.

**Action (webapp):** change to `"sports bar": "sports bar"` and redeploy
`refreshDistrictVenues` scoped. Do it in the same release as the mobile build,
not before — the ordering hazard runs in the other direction now.

### 4.2 🔴 `clickThroughs` — mobile owes the writer

Rules permit it, the Dashboard's Profile Expansions card reads it, and **nothing
writes it**. This was a webapp blocker in the reconciliation; the webapp side is
now done and it's mobile's.

Needs an increment when `VenueDetailsSheet` opens, mirroring `recordSwipe`'s
upsert shape and reusing `skipAnalytics()`. Debounce per venue per session or
reopening a sheet inflates it.

### 4.3 🟡 Squad tier caps — mobile is stricter than the server

| | free | pro | elite |
|---|---|---|---|
| Mobile `TIER_LIMITS` | 3 | 7 | ∞ |
| Live `firestore.rules` | 3 | **uncapped** | uncapped |

Server is *more permissive*, so no writes fail — but the Pro 7-member cap is
advisory only and a modified client could exceed it. Mobile's
`firestore.rules.example` carries the stricter version; the webapp's rules
header explicitly flags it as "NOT yet live" and a separate decision.

Not a launch blocker. Worth deciding before Pro has real subscribers.

### 4.4 🟡 `elite` still unreachable

`revenueCatWebhook` writes only `'pro'` or `'free'`; `redeemVoucher` writes
neither. Nothing can produce `elite`, yet `TIER_LIMITS.elite` grants unlimited
everything. Unreachable privilege path — spec it or delete it.

### 4.5 🟢 Distance label — now unblocked

`latitude`/`longitude` are written for new owner venues, so
`resolveVenueCoords` tier 1 resolves for real. `VenueCard.tsx:133` still renders
the `— km away` placeholder.

**Caveat:** venues created *before* that change still have no coordinates and
fall through to the JHB-CBD dummy. Confirm the backfill has run before shipping
the label, or early venues will display confident wrong distances.

### 4.6 🟡 `verified` means "owner-created", not "vetted"

`createVenue` hardcodes `verified: true` for every venue. So the badge I added
distinguishes claimed venues from auto-created stubs — which is useful and
matches the claim-funnel intent, but it is **not** a trust signal about the
venue itself. Fine as-is; just don't build copy that implies vetting.

### 4.7 ✅ Resolved since the reconciliation

- Category vocabulary — 11 values on both sides
- `restaurant` alias added (no stub could carry it before)
- `?? "bar"` fallback removed; unmapped places now genuinely untagged
- X18 places excluded from the stub cache (`isAdultVenue`) — compliance gate
- Coordinates, `dressCode`, `coverCharge`, `musicGenres`, `dietaryOptions`, `offers` all written
- `currentBusyness` + `busynessUpdatedAt` with staleness handling
- `groupMatches` written server-side by `onSquadMatch`, correctly kept out of client rules
- `normalizeCode` parity for vouchers

---

## Part 5 — Deployment blockers

**Hard blockers:**

1. **`revenueCatWebhook` undeployed** — `REVENUECAT_WEBHOOK_SECRET` unset. Paid
   Pro never persists past a reinstall, and no other function can deploy.
2. **`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` unset** — `purchasesSupported` is
   false, so nobody can purchase at all. Vouchers are currently the only working
   route to Pro.
3. **Play Console subscription not created** — payments profile, `barhop_pro`,
   two base plans, `trial-7d` offers.

**Should fix before release:**

4. `clickThroughs` writer (§4.2) — half the owner dashboard reads zero
5. `sports bar` alias flip (§4.1) — coordinate the two deploys
6. Distance label + backfill verification (§4.5)
7. `elite` decision (§4.4)

**Known-accepted:**

8. Squad Pro cap advisory only (§4.3)
9. `video` in the card checklist with no uploader (webapp §8)
10. Stub demand telemetry not built — decide before seeding remaining districts

---

## Deploy order

1. Set `REVENUECAT_WEBHOOK_SECRET`; deploy `revenueCatWebhook` scoped
2. Mobile: `clickThroughs` writer + distance label
3. Webapp: flip `sports bar`; deploy `refreshDistrictVenues` scoped
4. Coordinate backfill; verify before the distance label reaches users
5. Play Console + RevenueCat; rebuild with the SDK key; test on the closed track

Every functions deploy must be scoped — both repos share one project.
