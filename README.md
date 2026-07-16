# BarHop — Consumer Mobile App (MVP)

Tinder-style nightlife discovery app built with **Expo SDK 57 / React Native / TypeScript**.
Consumers swipe on venue cards published by the [BarHop Creator webapp](https://github.com/) —
every swipe writes the daily analytics the venue owner's B2B dashboard reads
(**the dependency loop**).

## Project structure

```
App.tsx                        Providers (SafeArea, Auth) + navigator
src/
  types.ts                     Venue schema (mirrors the webapp's types.ts) + swipe types
  theme/colors.ts              Dark nightlife palette
  firebase/config.ts           Firebase init (env-driven, RN auth persistence)
  context/AuthContext.tsx      onAuthStateChanged → { user, initializing }
  navigation/AppNavigator.tsx  Native stack, auth-gated (Auth ⇄ Swipe)
  screens/AuthScreen.tsx       Email/password + Google sign-in, dark UI
  screens/SwipeScreen.tsx      Deck swiper, gradient cards, LIKE/NOPE stamps
  services/authService.ts      Auth flows + consumer user-doc bootstrap
  services/venueService.ts     fetchPublishedVenues, fetchSwipedVenueIds
  services/swipeService.ts     recordSwipe(): atomic writeBatch → history + analytics
firestore.rules.example        Rules the shared Firebase project MUST include
.env.example                   Template for required environment variables
```

## Setup

### 1. Environment variables

```bash
cp .env.example .env
```

Fill in the **Firebase web config of the SAME project the Creator webapp uses**
(Firebase console → Project settings → General → Your apps → Web app). Restart
`npx expo start` after changing `.env` — `EXPO_PUBLIC_*` values are inlined at
bundle time.

### 2. Firestore security rules (critical)

Merge [`firestore.rules.example`](./firestore.rules.example) into the Firebase
project's rules (Firebase console → Firestore Database → Rules). Without this,
consumers cannot read venues, and **every swipe fails `permission-denied`** —
the B2B dashboard would never receive analytics.

### 3. Enable auth providers

Firebase console → Authentication → Sign-in method → enable **Email/Password**
(and **Google**, when you're ready for it).

### 4. Run

```bash
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS).

## The dependency loop (how analytics reach the B2B dashboard)

`src/services/swipeService.ts` commits one atomic `writeBatch` per swipe:

| Write | Path | Purpose |
| --- | --- | --- |
| Swipe history | `users/{uid}/swipedVenues/{venueId}` | Deck filter — a card is never shown twice |
| Daily analytics | `venues/{venueId}/analytics/{YYYY-MM-DD}` | Read by the webapp's `analyticsService.getVenueAnalytics` |

The analytics doc shape matches the dashboard's read contract exactly:

```js
{ date: Timestamp,  swipedRight: increment,  swipedLeft: increment }
```

- `date` is a **Timestamp** (the dashboard calls `.toDate()` and orders by it).
- **No `impressions` field** — the dashboard derives impressions as
  `swipedRight + swipedLeft`, so every swipe raises impressions by 1 implicitly.
- Day-keyed doc IDs + `set(…, { merge: true })` + `increment()` make concurrent
  swipes from many users safe (no read-modify-write races).

## Google Sign-In

The button is fully wired (`expo-auth-session` → Firebase `signInWithCredential`)
but **cannot run inside Expo Go**: Google rejects `exp://` redirect URIs since
Expo removed its auth proxy. To activate it:

1. Create OAuth client IDs (Google Cloud console → Credentials): **Web**
   (Firebase usually created one when you enabled the Google provider), **iOS**
   (bundle ID), **Android** (package name + SHA-1).
2. Put them in `.env` (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`).
3. Make a development build: `npx expo run:android` / `npx expo run:ios`
   (or EAS: `eas build --profile development`).

Until then the button shows a friendly "not configured" message and
email/password handles all sign-ins. Note: Expo SDK 57's docs now recommend
[`@react-native-google-signin/google-signin`](https://docs.expo.dev/guides/google-authentication/)
(native, also dev-build-only) — a worthwhile swap when Google auth becomes a
priority.

## Consumer tiers (Free / Pro / Elite)

Tier lives at `users/{uid}.consumerTier` (`'free' | 'pro' | 'elite'`, absent =
free) — deliberately separate from the B2B `subscriptionTier` field that venue
owners carry on the same documents. All gates read it live through
[useConsumerSubscription](./src/hooks/useConsumerSubscription.ts)
(`TIER_LIMITS` + feature flags are the single source of truth):

| Feature | Free | Pro | Elite |
| --- | --- | --- | --- |
| Deck ads | every 8 cards | none | none |
| Swipes per session | 15 (+15 per rewarded ad) | unlimited | unlimited |
| Active squads | 3 | 7 | ∞ |
| Members per squad | 3 | 7 | ∞ |
| Itinerary stops | 3 | 5 | ∞ |
| Venue filters | distance only | + genre / dress code / cover | same |
| Vibe Check (live busyness) | locked teaser | ✅ | ✅ |
| Rewind last swipe | locked | ✅ | ✅ |

Notes:
- **Squad filters are host-set** and stored on `squads/{id}.filters`; every
  member's deck inherits them live (identical decks keep consensus matching
  sound). Genre filtering is *at-least-one overlap* against
  `categories ∪ musicGenres`; venues missing filter data are kept, not
  dropped (the B2B webapp doesn't write those fields yet — sample venues do).
- **Rewind undoes side-effects**: deletes the `swipedVenues` history doc
  (solo) or removes the like from the squad doc (right-swipes) so no phantom
  matches; venue analytics keep both interactions.
- Blocked operations throw `SquadLimitError` / `ItineraryLimitError` (the
  write never happens) and the UI raises `ProUpsellModal` — never a crash.
  Squad member caps are also enforced server-side per tier (rules).
- To test tiers, set `consumerTier: "pro"` (or `"elite"`) on your user doc in
  the Firestore console — every gate updates live, no restart.

## Itinerary Planner (map tab)

The **Itinerary** tab plans the night: matched (squad) or right-swiped (solo)
venues on a map with numbered pins, a dashed route polyline, estimated travel
times between stops, and Uber / Maps deep links.

- **One-itinerary rule** — the Firestore doc ID *is* the rule:
  `itineraries/{uid}` for solo, `itineraries/{squadId}` for squads (live-synced
  to all members). Apply the `itineraries` block from
  [`firestore.rules.example`](./firestore.rules.example) or writes fail.
- **Coordinates (blended resolution)** — [src/utils/venueCoords.ts](./src/utils/venueCoords.ts):
  1. lat/lng stored on the venue doc (Creator webapp, when available);
  2. *future*: Google Places API lookup with an area-keyed cache for venues
     without an owner card (`TODO(blended-places)` seam, server-side);
  3. deterministic dummy coordinates near the JHB CBD so the map works today.
  Device geocoding is used only for the **user's** blue dot (permission is
  checked, never prompted, on this tab). Sample venues carry real coords.
- **Travel times** are haversine estimates (walk ≤ 1.4 km, else drive).
  Real routing = Google Directions API + `react-native-maps-directions`
  (billed key) — swap points are marked in [src/utils/geo.ts](./src/utils/geo.ts).
- **Maps runtime**: `react-native-maps` works in **Expo Go** on both platforms
  with no key. Dev/standalone **Android** builds need a Google Maps API key:
  `app.json → android.config.googleMaps.apiKey`.
- **Free tier**: max 3 stops (`useConsumerSubscription` stub) — the Add Stop
  button locks and `ProUpsellModal` pitches Pro.

## Monetization (AdMob)

Free-tier monetization lives in [src/ads/](./src/ads/):

- **Native ad cards in the deck** — `injectAdCards` inserts one ad slot after
  every 8 venues. `NativeAdCard` renders it with a Sponsored badge and a
  "Learn More" CTA.
- **15 swipes per session** — venue swipes (solo + squad) decrement the
  budget; ad dismissals don't. At 0 the deck freezes and `OutOfSwipesModal`
  offers "Upgrade to Pro" (coming-soon) or a rewarded video that grants +15
  on the `EARNED_REWARD` event only.

### Where ads run

| Environment | Behavior |
| --- | --- |
| **Expo Go** | Ads SDK can't load → no ad cards injected; rewarded flow is **simulated** so the modal UX is still testable |
| **Dev build** (`npx expo run:android`) | Google **test** ads (test App IDs in app.json, `TestIds.*` fallbacks for unit IDs) |
| **Release** | Set real unit IDs in `.env` (`EXPO_PUBLIC_ADMOB_*`), replace the test App IDs in app.json, publish `app-ads.txt` on your domain |

The native module is only ever touched through the guarded loader
[src/ads/adsModule.ts](./src/ads/adsModule.ts) — never import
`react-native-google-mobile-ads` directly.

### Click-compliance design (AdMob invalid traffic policy)

- Swipes are consumed by our own reanimated pan gesture and can never reach
  the ad SDK — dismissing an ad card is not a click.
- Only two views are registered as ad assets (headline + CTA); they are the
  sole legitimate tap targets. There are **no programmatic clicks** anywhere.
- Nothing overlays ad content: LIKE/NOPE stamps and swipe-up are disabled on
  ad cards; the Sponsored badge is our own chrome outside the ad assets.
- Never click real ads in your own app once live unit IDs are configured —
  use test IDs for all development.

## Verifying the MVP end-to-end

1. Publish at least one venue from the Creator webapp (`published == true`).
2. `npx expo start` → register with email/password → you land on the swipe deck.
3. Swipe right on one venue, left on another.
4. Firebase console → Firestore:
   - `users/{uid}/swipedVenues/…` contains both venues with `direction`.
   - `venues/{venueId}/analytics/{today}` shows `swipedRight` / `swipedLeft` = 1
     and a valid `date` timestamp.
5. Open the Creator dashboard → Impressions / Right Swipes / Left Swipes
   reflect the swipes. **Loop closed.**
6. Reload the app — swiped venues never reappear.
