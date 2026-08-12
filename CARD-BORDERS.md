# Border art — draw it, check it, publish it

Premium frames for **venue swipe cards** and **profile pictures**.

**The short version:** draw a PNG → drag it into Admin → Border Studio → fix whatever the checks flag → Publish. Both apps pick it up on next launch. **No deploy, no app-store release.**

---

## 1. How it works

```
   your PNG
      │
      ▼
┌──────────────────┐   checks run on the decoded pixels
│  Border Studio   │   (same module as the CLI)
│  (Admin console) │
└────────┬─────────┘
         │ publish
         ├──────────────► Cloudinary            (the artwork)
         └──────────────► borderCatalog/current (the entry: key, colours, slice)
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
       Creator webapp                    Consumer app
       (owner's picker + preview)        (the real card / avatar)
```

`borderCatalog/current` is **one Firestore document** holding every border. One document = one read per launch no matter how many borders exist, and it stays tiny because only the Cloudinary *URL* is stored, never the image.

**Three layers guarantee something always renders**, in order: bundled built-in registry → cached catalog (survives an offline launch) → live catalog. A border that fails to load falls back to its flat ring, then to the plain card. Nothing blocks the deck.

---

## 2. Drawing the art

### 2.1 Card frames — nine-slice

The frame is cut into 9 regions by a `slice` inset from each edge:

```
        slice           slice
      ├───────┤        ├──────┤
   ┌──────────┬────────┬─────────┐  ─┐
   │  corner  │  edge  │  corner │   │ slice
   │  PINNED  │STRETCH↔│  PINNED │   │
   ├──────────┼────────┼─────────┤  ─┘
   │   edge   │ centre │   edge  │
   │STRETCH ↕ │DROPPED │STRETCH↕ │
   ├──────────┼────────┼─────────┤
   │  corner  │  edge  │  corner │
   │  PINNED  │STRETCH↔│  PINNED │
   └──────────┴────────┴─────────┘
```

| Region | Behaviour | What to draw there |
|--------|-----------|--------------------|
| **Corners** | Never distort | All your detail — ornament, crest, neon bend |
| **Edges** | Stretch along their run (up to ~5×) | A *uniform* run: plain stroke, smooth gradient, constant-width tube |
| **Centre** | Discarded | Nothing |

**The four rules:**

1. **Square canvas** — 512×512 recommended, 1024 for very fine detail. Non-square is rejected.
2. **Bleed to the edge** — no transparent margin, or you get a gap between frame and card.
3. **Corner art ends at the slice line** — cross it and the corner melts when stretched.
4. **No motif in the edge bands** — it smears into a streak.

### 2.2 Avatar frames — overlay

Circular, so there's no nine-slice and no `slice` value. The whole square scales over the photo.

- **Square canvas**, same sizes.
- **Inner 72% must be transparent** — that's where the photo shows through.
- **Draw in the ring** between that hole and the canvas edge.
- **Keep it rotationally balanced** — these render at 40px, where a lopsided ring reads as a glitch.
- Art may overlap the photo's rim; that's what makes laurels and chains read as jewellery rather than a plain ring.

### 2.3 Export

| Property | Value |
|----------|-------|
| Format | **PNG-24 with alpha**, sRGB, non-interlaced |
| Canvas | Square, 256–2048px (512 recommended) |
| Background | Fully transparent |
| Size | **< 60 KB** ideal, 250 KB hard ceiling — run through pngquant/TinyPNG |

---

## 3. Publishing (Admin → Border Studio)

1. **Drop the PNG.** The key is pre-filled from the filename; the slice is inferred.
2. **Set the slice** with the slider. Cyan guides overlay the art showing exactly which pixels are pinned and which stretch — drag until the lines sit just inside your corner ornament.
3. **Read the checks.** Red blocks publishing; amber is a judgement call you can override.
4. **Fill in the metadata** — key, name, description, "Applies to" (venue card / profile picture), minimum tier, frame thickness, fallback ring colour, glow.
5. **Watch the live preview** — the frame at three aspect ratios (swipe card, tall, wide). This is the check your eye does that the pixel checks can't: a frame that looks right on a square source can still smear on a tall card.
6. **Publish.** Art uploads to Cloudinary, the entry lands in the catalog, both apps see it on next launch.

**Retire, never delete.** Retiring hides a border from the pickers but keeps it rendering for venues that already chose it. Deleting the entry silently downgrades them to the plain card.

**`key` is permanent.** It's stored on every venue that picked the border. Renaming it is the same as deleting it.

---

## 4. Checking art from the command line

Same checks, no browser:

```bash
npm run check:borders -- path/to/art.png            # one file
npm run check:borders -- path/to/art.png --slice=96 # pin the slice
npm run check:borders -- ./my-frames/               # whole folder
npm run check:borders -- avatar.png --avatar        # avatar rules
```

Exits non-zero if anything has errors, so it works as a pre-commit or CI step. Zero dependencies — it decodes PNG itself, and that decoder *is* the format check: it accepts exactly 8-bit RGBA non-interlaced PNG and names what it found otherwise.

Omit `--slice` and it infers one the same way the Studio pre-fills its slider.

---

## 5. What the checks mean

| Check | Level | Why |
|-------|-------|-----|
| `canvas.square` | error | The nine-slicer assumes one edge length |
| `canvas.size` | error | Under 256px, detail dies on the downscale |
| `alpha.present` | error | A fully opaque image covers the whole card |
| `slice.range` | error | `slice ≥ size/2` leaves no band to stretch — renders inside out |
| `slice.comfortable` | warn | Over 40%, edges look sparse on a tall card |
| `bleed.edges` | error | A transparent margin leaves a gap around the card |
| `centre.transparent` | error | Ink there is discarded — and means it was drawn as a card, not a frame |
| `corners.content` | error | An empty corner breaks the frame where the eye goes first |
| `edges.content` | error | The frame breaks between corners |
| `edges.uniform` | warn | A motif in an edge band smears when stretched |
| `avatar.hole` | error | Would cover the profile photo |
| `avatar.ring` | error | Nothing drawn in the visible ring |
| `avatar.balance` | warn | At 40px a lopsided ring reads as a glitch |
| `file.size` | warn / error | Every device downloads this |

---

## 6. Troubleshooting

| Symptom | Cause |
|---------|-------|
| Corners smeared / melting | `slice` too large, or corner art crosses the slice line |
| Edges streaked | A motif in an edge band — make it uniform |
| Gap between frame and card | Art doesn't bleed to the canvas edge |
| Frame too thin to read | Frame thickness too low, or detail drawn too fine for the scale-down |
| Plain ring instead of art | The Cloudinary URL 404'd — the ring is the deliberate fallback |
| New border missing in the app | Catalog loads after sign-in, once per launch — fully close and reopen |
| Nothing in the picker | Border is retired, or its `minTier` is above that venue's plan |

---

## 7. Where things live

| File | Role |
|------|------|
| `src/lib/borderArtValidation.js` | The checks. CommonJS so the CLI can `require` it |
| `scripts/validateBorderArt.js` | CLI + zero-dep PNG decoder |
| `src/components/admin/BorderStudioTab.js` | Upload, guides, preview, publish |
| `src/firebase/borderCatalogService.js` | Catalog read/write, Cloudinary upload, merge |
| `src/data/cardBorders.js` | Built-in registry, normalization, web renderer |
| `src/context/BorderCatalogContext.js` | Live catalog for the dashboard |
| **Mobile** `src/theme/cardBorders.ts` | Built-in registry mirror + normalization |
| **Mobile** `src/services/borderCatalogService.ts` | Catalog store, cache, art prefetch |
| **Mobile** `src/components/NineSliceFrame.tsx` | Native nine-slice renderer |
| **Mobile** `src/components/AvatarFrame.tsx` | Avatar overlay renderer |

### Still code, still needs a release

Only **generated** treatments (rings, glows, gradients, pulses with no artwork) live in the built-in registries, and those must be mirrored by hand in both files. Everything with artwork goes through the catalog and needs no release.

The two renderers are also code: a genuinely new *rendering mode* (say, an animated sprite sheet) is a code change in both repos. New **art** in an existing mode never is.

---

## 8. Renderer notes

**Web** uses CSS `border-image`, which *is* nine-slice natively. The flat `border-color` under it is the browser's own fallback if the asset 404s.

**Native** has no cross-platform nine-slice — `Image.capInsets` is iOS-only and Android's `.9.png` support doesn't reach Expo's asset pipeline. `NineSliceFrame.tsx` hand-rolls it: eight clipping views, each showing one region of a single scaled copy of the artwork.

**The glow always lives on a wrapper**, never on the card — iOS drops a view's shadow when that same view sets `overflow: 'hidden'`, and the card must clip to round its media.

**Gradients are padding, not strokes** — a gradient stroke following a corner radius isn't expressible as a border on either platform.

**Tailwind classes were abandoned for borders.** Tailwind compiles by scanning source text, so a border defined with a new colour would generate a class that doesn't exist and render nothing. Every treatment is built from its spec at runtime.

**Catalog data is normalized before it renders.** `normalizeBorder` (mirrored in both repos) coerces or drops anything malformed — a bad number reaching a style object yields a blank card rather than an exception, which is the harder bug to find.
