# BarHop — Launch Handoff

Three work streams to reach deployment readiness. Part A goes to the webapp
repo, Part B is yours (dashboards and secrets — nobody else can do these),
Part C is the mobile work.

⚠️ **One caveat that shapes all of this:** I verified what exists in both
repos' source. I **cannot** see what is actually *deployed* to Firebase. Several
items below say "verify deployed" for that reason — the code being present is
not evidence it is live.

---

# Part A — Prompt for the webapp repo

> Copy everything in this block into a fresh session in `BarHop-Creator-WebApp`.

---

You are working in the **BarHop Creator WebApp** repo. It shares ONE Firebase
project (`barhop-creator-webapp-ee9a8`), ONE Firestore ruleset and ONE Cloud
Functions codebase with the consumer app in `BarHop-MobileApp`.

The mobile repo has just completed a cross-repo contract reconciliation and
shipped its half. Your job is to close the remaining webapp items so both apps
can ship together. Most of the code already exists here — the outstanding work
is mostly deployment and two small changes.

**Before anything: audit what is actually deployed.** Run
`firebase functions:list` and `firebase deploy --only firestore:rules --dry-run`
(or check the console) and report which of these are live, because the source
being present here does not mean it is deployed:
`refreshDistrictVenues`, `redeemVoucher`, `revenueCatWebhook`, `onSquadMatch`,
plus whether the current published ruleset matches `firestore.rules` in this
repo.

Then, in this order:

**1. Flip the `sports bar` alias — this is unblocked as of now.**
`functions/refreshDistrictVenues.js:322` reads `"sports bar": "bar"` with a
comment saying not to change it until the consumer app carries an 11-value
`VENUE_CATEGORIES`. **That shipped.** Mobile's `src/types.ts` now has all 11
values (`bar, club, lounge, pub, cocktail bar, wine bar, rooftop, live music,
restaurant, sports bar, adult entertainment`) plus a separate
`ONBOARDING_CATEGORY_CHIPS` subset that excludes `adult entertainment`.

Change it to `"sports bar": "sports bar"`, delete the blocking comment, and
deploy scoped. **Coordinate the timing:** deploy this in the same release window
as the mobile build, not before — the ordering hazard now runs the other way.

**2. Deploy `revenueCatWebhook`.** It is written but (as far as the mobile repo
can tell) not deployed, and `REVENUECAT_WEBHOOK_SECRET` is unset. While that
secret is unset, *every* function deploy from this codebase fails validation —
so this gates items 1 and 3 too. The repo owner is setting the secret
separately; once it exists, deploy scoped and report the function URL, which
they need for the RevenueCat dashboard.

**3. Run `functions/scripts/backfillVenueCoords.js`.** Venues created before
`latitude`/`longitude` were added still have none, and the consumer app falls
back to a deterministic dummy pin near the JHB CBD for those. Mobile is about to
ship a distance label — **it must not ship before this backfill completes**, or
early venues will display confident wrong distances. Dry-run first, report how
many venues need it and the projected Foursquare quota spend (the free Pro
allowance is 500/month and the district refresh already consumes from it), then
run with `--confirm`. Report the final count.

**4. Decide the squad tier caps.** Live rules cap only free squads at 3 members
and leave paid tiers uncapped. The mobile app enforces `free: 3, pro: 7,
elite: ∞` client-side, and `BarHop-MobileApp/firestore.rules.example` carries
the stricter server version, which this repo's rules header explicitly notes is
NOT live. Server being more permissive means no writes fail — the Pro cap is
simply advisory and a modified client could exceed it. Either port the stricter
caps into `firestore.rules` and deploy, or record the decision to leave it
advisory. Do not leave it undecided.

**5. Resolve the `elite` consumer tier.** Mobile declares
`ConsumerTier = 'free' | 'pro' | 'elite'` and grants `elite` unlimited squads,
members and itinerary stops — but `revenueCatWebhook` only ever writes `'pro'`
or `'free'`, and `redeemVoucher` writes neither. Nothing can produce `elite`, so
it is an unreachable privilege path. Either spec it properly (rules pin in
`tierUnchanged()`, a mapping in `revenueCatWebhook`, a product in RevenueCat) or
confirm it should be deleted from mobile. Report which.

**6. Known gap — `video`.** It is in `toPreviewData` and the card checklist, but
`CreateVenue` has no uploader, so that checklist row can never be completed.
Either add the uploader or remove the row. Owner-facing polish, not a blocker.

**Deploy rules that apply throughout:**
- Every functions deploy MUST be scoped (`--only functions:<name>`). An unscoped
  `--only functions` deletes the functions the mobile repo owns.
- A rules deploy REPLACES the entire published ruleset. `firestore.rules` here
  must be the complete live set before every deploy.

**When done, report back:** what is now deployed, the `revenueCatWebhook` URL,
the backfill count, and your decisions on items 4 and 5.

---

# Part B — Your steps

These need a human with dashboard and billing access. Nobody else can do them,
and item 1 gates the most.

### 1. Verify South Africa payout eligibility — do this first
Google separates *merchant registration* from *payout*. SA has been merchant-
eligible since 2017, but historically payouts could not go to an SA bank
account. Check both columns for South Africa in
[Supported locations for developer and merchant registration](https://support.google.com/googleplay/android-developer/table/3539140).

This is first because it is the only item that could invalidate the plan.
Play Billing is mandatory for in-app digital subscriptions, so if payouts are
constrained you need to know now, not after wiring everything.

### 2. Set the webhook secret
```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET
```
Generate a long random string and keep it — you paste the same value into
RevenueCat later as `Bearer <secret>`. **This unblocks every function deploy in
Part A**, so do it early.

### 3. Payments profile
Play Console → Settings → Developer account → Payments profile. Identity, tax
and bank details. Verification takes days and can bounce back asking for
documents — this is the long pole, start it today.

### 4. Create the subscription
Monetize with Play → Subscriptions. IDs are **permanent**, no reuse after
deletion:

| Thing | ID |
|---|---|
| Subscription | `barhop_pro` |
| Base plan (monthly) | `pro-monthly` |
| Base plan (annual) | `pro-annual` |
| Trial offer (on each plan) | `trial-7d` |

Prices: **R49.99/month, R499/year** (recommended — same "2 months free" framing
as your B2B tiers, reads as ~17% on the paywall, and sits in the same
under-R50 bracket as R40 while returning 25% more per subscriber). Activate both
base plans — a draft plan is invisible to RevenueCat.

Add a **7-day free trial offer** on each base plan, eligibility = new customer
acquisition. The paywall now derives trial length and eligibility from Play, so
whatever you configure is what users see — and a returning user who already used
their trial correctly stops being shown one.

### 5. Service account → RevenueCat
Already in progress. Remaining: confirm **Account permissions** (not App
permissions) has *View financial data, orders and cancellation survey responses*
and *Manage orders and subscriptions*. Then wait out Google's propagation, up to
36 hours.

### 6. RevenueCat dashboard
- Import products `barhop_pro:pro-monthly` and `barhop_pro:pro-annual`
- Entitlement identifier exactly **`pro`**, both products attached
- Offering marked **Current**, using the built-in **Monthly** and **Annual**
  package types
- Copy the Android **public** SDK key (`goog_`)
- Webhooks → the function URL from Part A item 2, Authorization header
  `Bearer <your secret>`, send all events

### 7. Env + rebuild
```bash
# .env
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxxxxx

eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_xxxxxxxx
eas env:create --environment preview    --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_xxxxxxxx
```
The value is inlined at build time — you must rebuild, restarting the dev server
does nothing.

### 8. Test on the closed track
Play Console → Setup → **License testing**, add your test accounts (separate
from the closed track's tester list — an account needs both). License testers
get free purchases and accelerated renewals: a monthly sub renews about every 5
minutes, up to 6 times, then expires. That is the only practical way to verify
the webhook's full `INITIAL_PURCHASE → RENEWAL → EXPIRATION` path in under an
hour instead of a month.

Verify: buy → paywall closes → `users/{uid}.consumerTier === 'pro'` in
Firestore → force-quit and reinstall → still Pro.

---

# Part C — Prompt for me (mobile repo)

> Paste into a fresh session in `BarHop-MobileApp`.

---

Continue the BarHop mobile deployment-readiness work. Context is in
`DEPLOYMENT-READINESS.md` and `CONTRACT-RECONCILIATION.md` in this repo. Read
both first. `tsc --noEmit` currently passes — keep it that way.

**1. Add the `clickThroughs` analytics writer.** This is mobile's outstanding
debt: `firestore.rules` now permits `clickThroughs` on
`venues/{id}/analytics/{day}`, and the webapp Dashboard's "Profile Expansions"
KPI reads it, but nothing writes it, so it renders zero forever. Increment it
when `VenueDetailsSheet` opens. Mirror `recordSwipe`'s existing upsert shape in
`src/services/swipeService.ts` — deterministic day-keyed doc ID, `increment()`,
`set(..., { merge: true })` — and reuse the `skipAnalytics()` guard so district
stubs are excluded. **Debounce per venue per session**, or reopening a sheet
inflates the count. Do NOT write `groupMatches`; it is written server-side by
the webapp's `onSquadMatch` trigger precisely because every squad member's
device observes the same match independently.

**2. Ship the distance label — but only after confirming the backfill ran.**
`src/components/VenueCard.tsx:133` renders a `— km away` placeholder.
Everything needed exists: `haversineKm` in `src/utils/geo.ts`,
`resolveVenueCoords` in `src/utils/venueCoords.ts`, and the user's stored
location from `profileService`. Before shipping, confirm the webapp has run
`backfillVenueCoords.js` — venues without coordinates fall through to a
deterministic dummy pin near the JHB CBD, and the label would display confident
wrong distances for them. If the backfill has not run, implement it behind the
`coords.source === 'venue'` check so dummy-pinned venues show no distance rather
than a wrong one.

**3. Add `busynessUpdatedAt` staleness handling.** The webapp now writes
`currentBusyness` alongside `busynessUpdatedAt: Timestamp`. Mobile reads
`currentBusyness` in `VibeCheckBadge` but ignores the timestamp. Treat anything
older than ~4 hours as stale and render nothing — Vibe Check is Pro-gated, and a
Pro subscriber seeing "lively" on a venue that closed two nights ago is a
support ticket. Add `busynessUpdatedAt` to the `Venue` type.

**4. Type `offers` properly.** `src/types.ts` has `offers: any[]`. The webapp now
writes a real shape from `CreateVenue.js` — read that file to get the exact
fields as implemented, then type against it. Then surface offers on the venue
card and details sheet, filtering client-side on
`active && (validUntil ?? ∞) > now && daysOfWeek ∋ today`. Check what tier the
webapp gates offers behind, and if it is Pro-only, fix the claim-funnel copy in
`VenueDetailsSheet.tsx` — it currently promises unclaimed owners they can add
"photos, trading hours, offers and a custom card", which overpromises to anyone
who converts at Starter.

**5. Resolve `elite`.** `ConsumerTier` includes it and `TIER_LIMITS` grants it
unlimited everything, but no writer can produce it. The webapp is reporting back
on whether to spec or delete it — apply whichever they decide. Do not leave an
unreachable privilege path in the type.

Verify with `npx tsc --noEmit` after each item. Do not ship items 2 or 4 without
first confirming the corresponding webapp state, since both depend on data the
webapp writes.

---

## Critical path

```
You: set REVENUECAT_WEBHOOK_SECRET
  └─> Webapp: deploy revenueCatWebhook, refreshDistrictVenues, rules
        └─> Webapp: run backfillVenueCoords
              └─> Me: distance label
  └─> You: payments profile -> subscription -> RevenueCat -> rebuild
        └─> You: test purchase on closed track

Me: clickThroughs writer          (independent, start now)
Me: busynessUpdatedAt staleness   (independent, start now)
Webapp: sports bar flip           (coordinate with mobile release)
```

The secret is the single highest-leverage unblock: it gates every function
deploy, which gates the backfill, which gates the distance label.
