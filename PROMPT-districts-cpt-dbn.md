# Prompt: research + seed 11 new districts (Cape Town ×6, Durban ×5)

> Copy everything below into a fresh research-capable session (web search
> required). The output is seed data for `districts/*` in the shared Firebase
> project — it gets committed/run from `BarHop-Creator-WebApp`, not the mobile
> repo.

---

You are researching **nightlife districts** for BarHop, a South African
venue-discovery app. 11 Johannesburg districts are already live and seeded. Your
job is to produce the next 11: **6 in Cape Town** and **5 on the Durban north
coast corridor**, as ready-to-write Firestore seed data.

A "district" here is not an administrative suburb boundary. It is a **circle** —
a centre point plus a search radius — that a places API is queried inside, once
per day. Choosing it well is the entire task: the circle is what determines
whether users in that area get a full swipe deck or an empty one.

## How the data is consumed (these are hard constraints, not preferences)

Each district you produce becomes one `districts/{id}` document:

```js
{
  name: 'Sea Point',                                    // shown in the area picker
  center: { latitude: -33.91234, longitude: 18.38765 }, // circle centre
  radiusM: 1200,                                        // SEARCH radius in metres
  active: true,
  // categoryIds: [...]  // optional; omit to inherit the default Nightlife root
}
```

A scheduled Cloud Function (`refreshDistrictVenues`) issues **exactly one
Foursquare Places Search per district per day**, using `ll = center` and
`radius = radiusM`, and writes the results to a shared cache the app reads.
Consequences you must design around:

1. **Foursquare returns at most 50 places per call.** There is no pagination in
   this system. If your circle contains 250 nightlife venues, users see an
   arbitrary 50 of them and the rest are invisible forever. **Size each radius so
   the realistic count of bars/clubs/restaurants inside it is roughly 30–60.**
   Dense walkable strips → 700–1200 m. Spread-out suburban centres → 1500–2500 m.
   Never exceed 3000 m.
2. **Cost scales with district count only, never user count.** Each call bills at
   Foursquare Premium ($18.75 CPM, no free tier). 11 districts ≈ $6.19/month
   today; the 22 you'll leave behind ≈ $12.40/month. That is the accepted budget
   — do **not** propose 15 Cape Town districts "for coverage". Exactly 6 and 5.
   The function also hard-caps at 40 active districts per run.
3. **Districts within 10 km of the user are merged into one deck**, nearest
   first. So adjacent districts are fine and expected — the user in Green Point
   sees CBD + De Waterkant + Sea Point together. But overlapping *circles* waste
   spend: the same venue found twice is deduped, so the second call bought
   nothing. **Keep centre-to-centre distance ≥ the sum of the two radii** wherever
   possible, and state the distance whenever two of your districts sit closer
   than that.
4. **A user more than 50 km from every centre gets an empty deck.** Your 11
   circles are the entire footprint for these two metros.
5. **Adult-entertainment venues are deliberately excluded from the deck.** The
   function drops anything Foursquare tags as adult / strip club / gentlemen's
   club / sex shop, for FPB distributor-licence reasons. Use the presence of adult
   venues as a *signal that an area is a real late-night entertainment zone* when
   you rank candidates — but understand that those specific places will never
   appear as cards, so never pick a district whose density comes **only** from
   them.

## Selection criteria

Rank candidate areas on, in priority order:

1. **Venue density within one walkable circle** — count of bars, cocktail bars,
   pubs, nightclubs, live-music venues, restaurants with late trade, breweries,
   hotel/rooftop bars. A strip of 40 venues in 900 m beats a suburb with 40
   venues spread over 6 km, every time.
2. **Actual footfall** — where people go out on a Friday and Saturday night, not
   where the census says they sleep. Weight tourist and student volume, precinct
   marketing, "best bars in X" listicles, and nightlife guides.
3. **Residential density** — a resident base means weekday demand, not just
   weekend.
4. **Distinctness** — each of the 6/5 should serve a genuinely different crowd or
   catchment. Two circles over the same crowd is one wasted district.

### Cape Town — 6 districts

No constraint beyond the criteria above: pick the 6 highest-density, highest-
footfall nightlife precincts in the Cape Town metro. Consider (do not treat as a
shortlist, and do not assume any of these survive your own research) the CBD /
Long–Bree strip, Kloof Street & Gardens, De Waterkant, V&A Waterfront, Green
Point, Sea Point, Camps Bay, Woodstock, Observatory, Claremont, Newlands,
Muizenberg, Stellenbosch and Bellville. Note explicitly which contenders you
rejected and why — the rejected list is as useful to us as the chosen one.

### Durban — 5 districts, north-coast weighted

**Focus on Umhlanga, Ballito and La Lucia.** These three areas must account for
at least 4 of the 5. Note that they form a ~25 km coastal corridor, so they
cannot be covered by one or two circles — Umhlanga Village and Umhlanga Ridge
(Gateway) alone are distinct catchments with distinct venue sets, and Ballito
splits between the Lifestyle Centre area and Salt Rock. Spend the remaining slot
on whichever single area outside those three has the strongest case (Florida Road
/ Morningside and Durban North are the obvious contenders) — or on a fifth
north-coast circle if your research says the corridor genuinely needs it. Justify
whichever way you go.

## What to return

**A. One table** — the 11 districts, in the order they should be seeded:

| id | name | lat | lon | radiusM | est. venue count in circle | why this circle |
|----|------|-----|-----|---------|---------------------------|-----------------|

- `id`: lowercase kebab-case, city-prefixed — `cpt-sea-point`, `dbn-umhlanga-village`.
  **Before finalising, read `districtIndex/current` in Firestore and match the
  existing 11 JHB IDs' convention** if it differs from this.
- `lat`/`lon`: 5 decimal places, and they must land on the actual centre of
  gravity of the venues — the middle of the busy strip, not the geographic
  centroid of the suburb or the pin the map app drops on the suburb name.
- `est. venue count`: your researched estimate of qualifying venues inside the
  circle. Flag anything you estimate above 80 as "will be truncated to 50".

**B. A ready-to-run seed snippet** — the 11 documents as a JS array literal in
the exact `districts/{id}` shape shown above, `active: true` on all of them,
suitable for pasting into an admin script that uses `firebase-admin`.

**C. A short verification section:**
- Centre-to-centre distance matrix for districts closer than radius-sum, with a
  note on whether the overlap is acceptable.
- The rejected candidates for each city, one line of reasoning each.
- Sources: cite specific pages for the density and footfall claims (nightlife
  guides, precinct/CID sites, tourism boards, recent "best bars" roundups).
  Prefer sources from the last ~2 years — several well-known South African
  nightlife strips have shifted materially since 2020, so a 2016 listicle is a
  liability, not evidence.
- Any area you believe is genuinely dense but that you could **not** verify
  coordinates or venue counts for, listed separately as needing a manual check.

## Ground rules

- **Verify, don't recall.** Every coordinate and every density claim must trace
  to something you actually looked up in this session. A plausible-looking
  latitude that is 3 km off puts the circle over a residential street and returns
  a deck of nothing — this failure is silent and we will not notice it for weeks.
- Do not write, modify, or deploy any code. Research and seed data only.
- If a constraint above makes a district you want impossible (e.g. the area needs
  a 5 km radius to be worth including), say so and propose the tradeoff rather
  than quietly breaking the constraint.
