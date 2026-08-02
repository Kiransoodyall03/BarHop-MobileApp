# Release Notes

> ⚠️ **Version numbering needs reconciling.** `app.json` currently reads
> `1.0.5`, but the entry below is headed `v1.1.0`. The 1.0.x line is what
> actually shipped. Decide which scheme you're on and correct the headings
> before tagging this release — `versionCode` is handled by EAS, but the
> user-facing `version` in `app.json` is not.

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
