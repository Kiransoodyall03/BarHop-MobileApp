# Release Notes

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
