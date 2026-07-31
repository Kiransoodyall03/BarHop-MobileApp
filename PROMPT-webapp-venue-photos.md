# Prompt: add one photo per district-cache venue

> Copy everything below into a fresh session in `BarHop-Creator-WebApp`.

---

You are working in the **BarHop Creator WebApp** repo, which owns the deployable
`functions/` codebase for a Firebase project shared with the consumer app in
`BarHop-MobileApp`.

**Goal:** every auto-created district-cache venue gets exactly one photo, so the
consumer swipe deck stops showing the 🍸 fallback on every unclaimed card.

## Context

`functions/refreshDistrictVenues.js` currently requests **no** `fields`
parameter, so Foursquare returns default fields only and stubs carry no photo.
The consumer app is already fully wired for this and needs **no** change and no
new build — `StubVenue.photoUrl` is declared in
`BarHop-MobileApp/src/types.ts`, `inflateStub` maps it to `images[]`
(`districtService.ts:230`), and `VenueCard` renders `images` with a 🍸 fallback
when empty. The only missing piece is the function never populating it.

### ⚠️ Do NOT copy the mobile repo's staging file over yours

`BarHop-MobileApp/cloud-functions/refreshDistrictVenues.js` has the changes
below already applied, but **do not copy it wholesale**, for two reasons:

1. It uses single quotes; your `functions/` lints to Google style (double
   quotes, 80 cols). It would fail lint.
2. It had drifted *behind* your deployed version — it was missing `isAdultVenue`
   and both `restaurant` aliases. That has since been fixed, but treat your file
   as the source of truth and apply the diff by hand.

## The four changes

**1. Add a `PLACE_FIELDS` constant** near `MAX_VENUES_PER_DISTRICT`:

```js
const PLACE_FIELDS = [
  "fsq_place_id",
  "name",
  "location",
  "categories",
  "latitude",
  "longitude",
  "photos",
].join(",");
```

🔴 **This is the one that can silently break everything.** Passing `fields` at
all turns the defaults OFF — every field the stub needs must be named. Omit
`name` and every venue comes back nameless; omit `latitude` and `toStubVenue`
returns null for all of them and you get empty districts.

**2. Add a `PHOTO_SIZE` constant:**

```js
// Foursquare photo URLs assemble as `${prefix}${size}${suffix}`. Bounded rather
// than `original`: South African mobile data is among the most expensive on the
// continent, and a swipe deck pulling 2000px originals is a real uninstall
// driver. 800px covers a full-bleed card on a 3x phone.
const PHOTO_SIZE = "800x800";
```

**3. Pass the fields in `searchDistrict`**, replacing the "NO `fields` param"
comment:

```js
fields: PLACE_FIELDS,
```

**4. Extract one photo in `toStubVenue`** and add a helper:

```js
/**
 * Exactly ONE photo URL for a place, or null.
 *
 * Foursquare returns photos as `prefix` + `suffix` halves the caller joins
 * around a size. We take the first — Foursquare orders by its own quality
 * ranking — and store the assembled URL so the app never sees this format.
 *
 * @param {Array<object>} photos Raw photos array from the place payload.
 * @return {?string} Ready-to-render URL, or null when there is no usable photo.
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
```

In `toStubVenue`'s return, spread it conditionally so absent stays absent —
never write `null`, since the app tests presence:

```js
// Absent when the place has no photo — the card falls back to 🍸 rather than
// rendering a broken image.
...(photoUrl ? {photoUrl} : {}),
```

Keep the existing `isAdultVenue` gate and the conditional
`category`/`categories` spread exactly as they are.

## Two pricing corrections while you are in here

The file header is wrong on both counts, and it matters because it would talk a
future reader out of this change on false economics:

1. **"first 500 Pro calls are free" — it is 10 000/month.** Foursquare's free
   tier is 10 000 calls to Pro endpoints.
2. **The "~$560/month" figure is for a different approach.** That is the cost of
   a separate Place Photos call *per venue*. Requesting photos inline via
   `fields` on the district search stays **one call per district per day** and
   only changes the rate:

   | | Calls/month | Rate | Cost |
   |---|---|---|---|
   | Before (Pro, defaults) | 330 | 10 000 free | $0 |
   | After (Premium, +photos) | 330 | $18.75 CPM, no free tier | ≈$6.19 |

Rewrite the header to say this function now runs at Premium rate deliberately,
and keep the warning that a *per-venue* photo call is the thing to never do.

**Also check the admin console's Foursquare quota tile** — it was built against
the 500-call figure. If it renders a "500 free calls" bar, it is wrong and
should read 10 000, and Premium calls have no free allowance at all so they
should not count against it the same way.

## Deploy and verify

```bash
npm --prefix functions run lint
firebase deploy --only functions:refreshDistrictVenues
```

Scoped only — an unscoped `--only functions` deletes the functions the mobile
repo owns.

**You do NOT need to clear any collection first.** The function does
`.set()` without merge on `districtVenues/{districtId}`, a full document
replace, so a re-run overwrites each snapshot outright. The `venues` collection
is separately already empty.

Then **force a run** rather than waiting for the 04:00 schedule, and check the
logs for the per-district venue counts it already logs.

Verification, in order of what actually catches breakage:

1. **Venue counts per district must not drop.** Compare against the previous
   run. A drop to zero means a `fields` name is wrong — that is the failure mode
   this change risks, and it fails quietly rather than throwing.
2. Read one `districtVenues/{districtId}` doc and confirm venues carry
   `photoUrl`, `name`, `address`, `latitude`, `longitude`, and `category` where
   mappable. Report what fraction of venues got a photo.
3. Open one `photoUrl` in a browser and confirm it renders at roughly 800px.
4. Confirm the flipped `sports bar` and new `restaurant` aliases now appear in
   the re-tagged snapshots — this run is also what lands those, since the
   previous deploy never executed.

**Report back:** venue counts before/after per district, the photo hit rate, and
whether any district came back empty.
