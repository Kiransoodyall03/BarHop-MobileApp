# Release Notes

> ⚠️ **Version numbering is now genuinely ambiguous — resolve before tagging.**
> `app.json` reads `1.1.0`, and **three** entries in this file are headed
> `v1.1.0` (2026-08-02, 2026-07-30, 2026-07-29). They are three different
> releases sharing one version name, so a store listing, a crash report and a
> release note can no longer be matched to each other.
>
> The 2026-08-02 entry adds friends, matching, push notifications and a new Pro
> feature — by any reading that is a minor bump, not a re-release. **Recommend
> heading it `v1.2.0` and setting `app.json` to match.** EAS handles
> `versionCode`; the user-facing `version` is not automatic.

## v1.1.0 — "The I Finally Have Friends Update" — 2026-08-02

The app stops being single-player. Add friends by code and match on the places
you've both swiped right on, entirely outside squad mode. Plus profile
pictures, live squad locations on the map, push notifications, and a Pro area
picker that lets you swipe somewhere you aren't standing.

---

### Play Console — "What's new"

> Copy-paste. 386 characters, inside the 500 limit.

```
Friends are here.

• Add friends with your BarHop code — you'll match on places you both swiped right on
• Set a profile picture, and watch your squad move on the map in real time
• Get notified the second a friend matches with you
• PRO: pick exactly which areas to swipe in, straight off the map

Your solo likes stay private until you turn matching on — and squad swipes never count.
```

---

### Added

- **Friends, and cross-friend matching.** Add someone with a six-character
  friend code (or a `barhop://friend/CODE` link you can send over WhatsApp),
  and any venue you have *both* right-swiped in solo mode becomes a match. A
  new Friends tab lists your friends, pending requests, and every match, and
  each match can go straight onto tonight's plan.

  Squads are synchronous and consensus-based; this is the opposite by design —
  asynchronous, pairwise, and matched from swiping you'd have done anyway.

- **Profile pictures.** Pick one in Edit Profile and it appears on your
  profile, in your squad's lobby, and on the itinerary map. `photoURL` existed
  before but was only ever set at Google sign-up and never displayed — every
  avatar in the app was initials.

- **Live squad locations.** The itinerary map now shows you and your active
  squad as moving avatars rather than a generic blue dot.

- **Push notifications**, new to the app entirely. Currently used for one
  thing: telling you a friend just matched with you.

- **PRO — Area picker.** Tap a district on the map to see how many venues it
  holds, what it's known for, and how many places in it your friends have
  liked. Pick one or several and the deck rebuilds from exactly those areas,
  including areas you aren't anywhere near — which makes planning a night
  across town work properly for the first time.

### Changed

- **Location is now live, not a one-shot capture.** The Location row used to
  store a single fix when you tapped it. It now tracks continuously while the
  Profile or Itinerary screen is open.

  **Foreground only, by choice** — no background permission is requested, so
  tracking stops when the app is closed and a squadmate's pin simply goes
  stale. Writes are throttled twice over (a 10s/20m OS filter plus a 15s
  app-level floor) so continuous tracking costs about four writes a minute
  rather than one per GPS tick.

- **Distance filtering is skipped when you've picked areas manually**, the same
  way it already is in squad mode. Measuring from where you're standing would
  empty the deck the moment you picked a district across the city.

- **The area picker is hidden in squad mode.** A squad's deck is the union of
  its members' districts and has to stay identical for everyone; letting one
  member re-point it would break consensus matching.

### Privacy

- **Matching is opt-in and off by default.** Nothing is written to the document
  friends read until you turn on "Match with friends". Turning it back off
  **deletes** what was already shared rather than just halting new writes.
- **Left-swipes are never shared.** Friends read a right-swipes-only
  projection; your actual swipe history stays owner-only.
- **Squad swipes never count toward friend matching.** A group compromise isn't
  a statement of personal taste.
- **Live location never crosses into the friend graph.** It stays scoped to
  your active squad. "Friends liked places here" in the area picker is derived
  from shared likes, not anyone's position.
- Removing a friend revokes their read access immediately — the permission is
  derived live from the friendship document, so there's no cleanup pass to lag
  behind.

### Fixed

- **Rewinding a swipe left a phantom match.** Pro Rewind deleted the swipe
  record but not the shared like, so a match could survive a venue you'd taken
  back. Both are now one batched write.

### Security

- **A consent hole in the friendship rules, caught before deploy.** Nothing
  guarded the `status` transition, so the *requester* could flip their own
  pending request to `accepted` and befriend someone who never agreed — which
  would then have handed them read access to that person's likes. Accepting is
  now permitted only for the party who didn't send the request.
- **Squad member photos and locations are scoped to their owner.** One member
  can no longer move another's pin or swap their photo (`onlyTouchesOwnKey`).
  The same guard covers friendship profile snapshots, which is what stops one
  side spoofing the other's push token.
- **`firestore.rules.example` was rebased onto the live console ruleset.** The
  repo's copy had drifted: it carried a squad member cap keyed on the
  client-written `tier` field on the squad document, which a modified client
  bypasses by simply claiming `pro`. The live rules derive it from the host's
  server-pinned `consumerTier` instead. That drift is gone, and the file now
  notes the console is authoritative.
- New `storage.rules.example` — avatars are readable by any signed-in user,
  writable only by their owner, capped at 5 MB and `image/*`.

### Internal

- New `Avatar` component and `avatarColor` util, replacing initials logic that
  had been copy-pasted byte-for-byte between `ProfileScreen` and `SquadScreen`.
- `Squad` gains `memberPhotos` / `memberLocations`; `ConsumerProfile` gains
  `friendCode`, `socialDiscoveryEnabled`, `expoPushToken`. All denormalized for
  the same reason `memberNames` already was — `users/{uid}` is owner-read-only.
- `fetchDeckVenues` takes an optional district override and delegates to the
  existing `fetchStubsForDistricts`, which already existed for squad decks. The
  area picker needed no new fetch path.
- `MainTabs`' icon selection was a four-deep nested ternary; now a lookup keyed
  on route name, so the fifth tab was a one-line change.
- New `FriendsContext` and `AreaSelectionContext`. Area selection is
  **deliberately session-only** — a pin left on a district in another city
  would silently poison the deck on next launch.
- Likes live in one `userLikes/{uid}` document rather than being copied into
  every friendship. The fan-out shape costs a write per friend per swipe, which
  turns a 15-swipe session with 50 friends into 750 writes; this is one,
  regardless of friend count.

---

### ⚠️ Requires a new native build

`expo-notifications` and `expo-image-picker` are native modules and this
project uses Expo CNG, so the existing dev client will not pick them up:

```bash
eas build --profile development --platform android   # dev
eas build --profile production  --platform android   # store
```

### Deploy notes

Four things must be done outside this repo, or features fail closed:

1. **Enable Firebase Storage** (console → Storage → Get started). It is not
   auto-provisioned like Firestore, and avatar uploads fail until it exists.
2. **Publish the Storage rules** from `storage.rules.example`.
3. **Publish the Firestore rules** — `friendCodes`, `friendships` and
   `userLikes` are new, and every friends feature is permission-denied without
   them. Deploy from the Creator webapp repo; a rules deploy **replaces** the
   whole ruleset, so publish the complete file.
4. **Configure Android FCM credentials** (`eas credentials`, or a
   `googleServicesFile` in `app.json`). Neither is set today, and Android push
   silently does nothing without it.

No Cloud Function changes are required for this release.

### Known limitations

- **Match notifications are sent client-side** to Expo's push service, because
  this repo has no deployable Cloud Functions of its own. A friend holding your
  push token could in principle spam you — bounded, since tokens only ever
  reach accepted friends and unfriending revokes access. The hardened form is a
  Firestore-triggered sender in the Creator repo.
- **Group matches are egocentric, not true cliques.** "You, Ben and Cara all
  liked this" means Ben and Cara each matched with *you* — not that they're
  friends with each other. Verifying that needs reading a friendship document
  you aren't part of, which the rules correctly forbid.
- **No area rating.** There is no rating, score or popularity field anywhere in
  the data model, so the picker shows venue count and category mix instead.
  A real rating would be net-new groundwork, not a display change.
- **Location stops when you leave the Profile or Itinerary screen**, not just
  when the app closes. A friend swiping in Discover isn't emitting updates, so
  their pin can be stale while they're demonstrably online.
- **Remote push does not work in Expo Go** (removed in SDK 53+). Testing needs
  a dev or EAS build.
- The friend-read permission check costs two document reads per friend, once
  per session when the listener opens. Fine at current scale; worth revisiting
  if anyone accumulates hundreds of friends.

---

## v1.1.0 — 2026-07-30

Squad mode is the theme: the squad deck was returning nothing, and squads you'd
joined were unreachable once you joined another. Plus a wider free filter and a
forced-update path for closed testing.

---

### Play Console — "What's new"

> Copy-paste. 421 characters, inside the 500 limit.

Squads, properly.

• Squad decks now combine everyone's local spots — one shared stack the whole crew swipes together
• Switch between solo and any of your squads straight from the deck, without losing your place
• Your other squads are reachable again instead of disappearing when you join a new one
• More filters on the free tier: bar, club, cocktail bar and restaurant

Fixed: squad decks came up empty.

### Fixed

- Squad decks came up empty.

  Stubs were excluded from squad decks on purpose: they resolve from the
  *viewer's* location, so members in different districts would get different
  decks, and a card one member never saw can never reach consensus. The fix is a
  union rather than a per-viewer lookup — see below.


### Added

- **Squad decks are now the union of every member's districts.**

- **Solo ⇄ squad switcher.**

- **Forced in-app updates.**

### Changed

- **Free tier gets four genre filters** — `bar`, `club`, `cocktail bar`,
  `restaurant`.
  
  Squad filters are deliberately **never** sanitized — every member must apply
  the identical host-set filters or their decks diverge and matching breaks.

### Internal

- `fetchStubsForDistricts` split out of `fetchDistrictStubs`; both still call
  `rememberStubs`, which is load-bearing — stubs have no `venues/{id}` doc, so
  skipping it makes matched venues vanish from itineraries.
- `SquadContext` now runs one list listener and derives the active squad from
  it, replacing the single-doc listener. Self-healing falls out for free.
- `loadDeck` gained `squadId` + `deckDistrictsKey` deps (an A→B squad switch was
  reusing the stale deck) and a sequence guard so rapid switching can't paint an
  older response.
- `canCreateMoreSquads` finally has a caller.

---

### ⚠️ Requires a new native build

`sp-react-native-in-app-updates` is a native module and this project uses Expo
CNG, so the existing dev client will not pick it up:

```bash
eas build --profile development --platform android   # dev
eas build --profile production  --platform android   # store
```

### Deploy notes

- **No Firestore rules change.** The `squads` update rule constrains only `tier`
  and member count; `deckDistrictIds` is permitted as-is.
- **Depends on an existing composite index** (`members` array-contains +
  `isActive` ==). `countActiveSquads` already runs that exact query in
  production, so it should exist — and if it doesn't, the switcher degrades to a
  no-op rather than breaking squads.
- **`refreshDistrictVenues` is now a hard dependency of squad decks**, not just
  solo. If it stops running, squad decks degrade to published-venues-only.

### Testing the update flow

Local and sideloaded builds **cannot** exercise the Play API — it rejects, and
the code swallows that by design. Use Internal App Sharing: upload the current
AAB, install from the link, then upload a higher `versionCode` and reopen.

### Known limitations

- A member joining from a distant district enlarges the deck for everyone. That
  is intended, but a squad spanning Johannesburg and Cape Town gets a deck
  neither member can act on.
- Distance filtering stays disabled in squad mode — a union has no single origin
  to measure from.
- Members can hold district snapshots up to 6h apart (local cache TTL vs daily
  server refresh), so stub sets can differ slightly. The failure mode is a
  *missed* match, never a false one.

---

## v1.1.0 — 2026-07-29

First release since the cross-repo contract reconciliation with the Creator
webapp. Several features that were built but inert are now live, because the
webapp side started writing the data they depend on.

---

### Play Console — "What's new"

> Copy-paste. 397 characters, inside the 500 limit.

```
Your night, better mapped.

• See exactly how far each venue is before you swipe
• Verified badges on venues claimed by their owners
• New categories to filter by — sports bars, pubs, cocktail and wine bars
• Vibe Check now hides readings that have gone stale, so "lively" always means tonight
• Fresh BarHop look on sign-in and discovery

Plus fixes to filtering that were quietly hiding venues.
```

If the Pro subscription is live on this track, add:

```
• BarHop Pro — no ads, unlimited swipes and bigger squads, with a 7-day free trial
```

Leave that line out until the Play subscription is active. Advertising a trial
the store can't yet honour is a review risk.

---

### Features

- **Distance on every venue card.** New `useDistanceLabel` hook; sub-kilometre
  renders as metres ("300 m away" answers *should I walk*, "0.3 km" doesn't).
  Returns nothing rather than a guess when the user has no stored location or a
  venue lacks real coordinates.
- **Verified badge** on the card front for owner-claimed venues.
- **BarHop logo lockup** on the auth and discovery screens, in theme-appropriate
  ink. New `BarHopLogo` component plus `logo-on-light.png` / `logo-on-dark.png`,
  derived from `icon.png` (which is opaque white with dark ink and could not be
  used directly on either surface).
- **Free-trial copy now derived from Play**, not hardcoded. `getFreeTrialDays()`
  reads `defaultOption.freePhase`, so the paywall states the real trial length —
  and correctly stops advertising one to a returning user who has already used
  theirs.
- **`clickThroughs` analytics.** Opening a venue's details sheet now increments
  the counter behind the Creator dashboard's "Profile Expansions" KPI, debounced
  once per venue per session.

### Fixes

- **Genre filter was hiding venues.** The category vocabulary had drifted three
  ways between this app, the Creator wizard, and the district-cache function.
  Selecting `pub`, `cocktail bar`, `wine bar` or `live music` excluded every
  owner-created venue; `restaurant` excluded every auto-created one; `sports bar`
  was unreachable from either side. All three vocabularies now carry the same 11
  values.
- **Stale Vibe Check.** Busyness is set by hand from the Creator dashboard and
  nothing clears it at close, so a Friday "lively" could still show on Sunday.
  Readings older than 4h are now hidden. Checked before the tier branch, so free
  users aren't teased into paying for stale data.
- **Latent crash in the deck filter.** `.filter(Boolean)` doesn't narrow types in
  TypeScript, so `applyProFilters` was calling `.toLowerCase()` on a value the
  compiler couldn't prove was a string. Harmless while `category` was always
  populated; would have become a runtime crash the moment the webapp stopped
  defaulting it — which it now has.
- **Google sign-in button** ignored the theme and rendered as a white slab on the
  dark gradient. Now uses the dark variant permitted by Google's branding
  guidelines.

### Contract & data model

- `Venue.category` / `StubVenue.category` are now **optional**. The district
  cache no longer guesses `"bar"` for places whose tags map to nothing, which had
  been mislabelling comedy clubs, casinos and hookah bars as bars and matching
  them into the `bar` filter.
- `VENUE_CATEGORIES` is the canonical 11-value vocabulary, shared with the
  Creator wizard and `CATEGORY_ALIASES`. New `ONBOARDING_CATEGORY_CHIPS` is the
  subset shown as preference chips, excluding `adult entertainment`.
- Added `Venue.busynessUpdatedAt`.
- **Removed the `elite` consumer tier.** Nothing could write it — no RevenueCat
  product, no webhook mapping — yet it granted unlimited squads, members and
  itinerary stops. An unreachable privilege path. Adding a tier is now documented
  as a three-repo change: this type, `revenueCatWebhook`, and `squadMemberCap()`
  in `firestore.rules`, which fails unrecognised tiers closed to the free cap.

### Security

- Service-account key patterns added to `.gitignore`. `*.json` was not ignored,
  and Google Cloud credential downloads land as JSON.

### Docs

`CONTRACT-RECONCILIATION.md`, `DEPLOYMENT-READINESS.md`, `LAUNCH-HANDOFF.md` —
the cross-repo contract, a full Firestore write schema, and the launch plan.

---

### Deploy coordination

This release is **paired with the Creator webapp release** of the same date.
Two ordering constraints:

1. **`sports bar` alias.** The webapp flipped `"sports bar": "bar"` to
   `"sports bar": "sports bar"` in `refreshDistrictVenues`. That is only safe
   because this build carries the 11-value vocabulary. Shipping the webapp's
   change against an older mobile build tags stubs with a value no filter can
   select — hiding them entirely.
2. **`refreshDistrictVenues` must run before this reaches users.** It was
   redeployed but hasn't executed since. The 11 existing `districtVenues`
   snapshots still carry pre-flip tags, so no stub carries `restaurant` and
   `sports bar` venues are still labelled `bar`. Force a run rather than waiting
   for the 04:00 schedule, or the new filter chips look broken to testers.

### Known limitations

- **Consumer Pro cannot persist yet** unless `revenueCatWebhook` is receiving
  events. Purchases unlock Pro locally via the RevenueCat entitlement mirror, but
  `users/{uid}.consumerTier` is only written by that webhook — so Pro is lost on
  reinstall until it's wired to RevenueCat with the `Bearer` secret.
- **Play Billing does not work in sideloaded builds.** Purchase testing requires
  the production build on a Play track with a license-tester account.
- `offers` is written by the webapp but not yet surfaced in the app.

### Notes

`app.json` still reads `"version": "1.0.0"`. Bump it to `1.1.0` before building
if you want the store listing to reflect this release — `versionCode` is handled
automatically by EAS (`appVersionSource: "remote"`, `autoIncrement` on the
production profile), but the user-facing version name is not.
