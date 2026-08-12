// ─────────────────────────────────────────────────────────────────────────────
// Premium swipe-card border registry — consumer-side mirror.
//
// TWIN FILE: BarHop-Creator-WebApp/src/data/cardBorders.js. That file is the
// canonical catalogue (it is where an owner picks a border); this one must
// carry the SAME keys with the SAME visual spec, because the owner's preview
// in the dashboard is a promise about what guests see here.
//
// ADDING A BORDER: see CARD-BORDERS.md at the repo root. Add one entry to both
// registries and neither renderer changes.
//
// ── Firestore contract ───────────────────────────────────────────────────────
// `key` is the persisted value of venues/{id}.cardBorderStyle. NEVER rename a
// shipped key: live venue documents carry it, and a renamed key resolves to the
// default, silently downgrading a paying venue. Unknown keys — which is what a
// venue configured by a NEWER webapp build looks like to an older app build —
// resolve to the default rather than crashing.
// ─────────────────────────────────────────────────────────────────────────────

import type { ImageSourcePropType } from 'react-native';

export interface BorderRing {
  /** Ring thickness in dp. 0 = no ring. */
  width: number;
  /** Hex `#RRGGBB`. Ignored when `gradient` is set, kept as the fallback. */
  color: string;
}

export interface BorderGlow {
  color: string;
  /** Blur radius in dp. */
  radius: number;
  /** 0–1. */
  opacity: number;
}

export interface BorderGradient {
  /** 2+ hex stops painted around the ring. */
  colors: string[];
  /** Degrees, 0 = left→right, 90 = top→bottom. */
  angle: number;
}

export interface BorderPulse {
  /** One full breath, ms. Keep >= 1600 — faster reads as a glitch. */
  durationMs: number;
  /** Trough opacity of the ring, 0–1. */
  minOpacity: number;
}

/**
 * Hand-drawn frame art, drawn as a NINE-SLICE: the four corners are pinned and
 * the four edges stretch to fill. `slice` is how far in from each side of the
 * SOURCE image the corner artwork ends — get it wrong and the corners smear.
 * See CARD-BORDERS.md for the art spec (canvas size, safe areas, export).
 */
export interface BorderArtwork {
  /**
   * Remote art published from the Border Studio (Cloudinary). Present on every
   * catalog-published border; absent on the built-ins, which ship bundled.
   * This is the field that makes new art possible WITHOUT an app release.
   */
  url?: string;
  /** Bundled asset basename — must have an entry in ART_SOURCES below. */
  slug?: string;
  /**
   * Source canvas edge length in px. The art spec requires a SQUARE canvas, so
   * one number covers both axes. Native nine-slicing needs this to compute its
   * sprite offsets; CSS `border-image` on the web derives it from the file.
   */
  size: number;
  /** Corner inset in SOURCE pixels, all four sides. */
  slice: number;
  /** Rendered frame thickness in dp. */
  width: number;
}

export interface CardBorder {
  key: string;
  name: string;
  description: string;
  /** Which surface it frames. Avatar frames are overlays, not nine-slices. */
  kind: 'card' | 'avatar';
  /** B2B tier that unlocks it. Enforced webapp-side at authoring time. */
  minTier: 'starter' | 'pro' | 'enterprise';
  /** Flat fallback. Always required — it renders if artwork is unavailable. */
  ring: BorderRing;
  glow: BorderGlow | null;
  gradient: BorderGradient | null;
  pulse: BorderPulse | null;
  /** Wins over ring/gradient when set. */
  artwork: BorderArtwork | null;
  retired?: boolean;
}

/**
 * Frame art, bundled rather than fetched: the deck must never show a card whose
 * frame pops in a beat late.
 *
 * Metro resolves `require` statically, so every asset has to be named here as a
 * literal — a computed path silently yields undefined at runtime. Adding art is
 * therefore a two-line change: the file, and its line in this map.
 */
export const ART_SOURCES: Record<string, number> = {
  // 'art-baroque': require('../../assets/card-borders/art-baroque.png'),
};

/**
 * The bundled asset for a border's frame art, or null when the border has no
 * artwork OR its slug was never registered above. Null is the signal to fall
 * back to the flat ring — a missing asset must degrade, never crash.
 */
export function cardBorderArtSource(
  border: CardBorder
): ImageSourcePropType | null {
  const artwork = border.artwork;
  if (!artwork) return null;
  // Remote art published from the Border Studio wins — that is the path that
  // needs no app release.
  if (artwork.url) return { uri: artwork.url };
  if (artwork.slug) return ART_SOURCES[artwork.slug] ?? null;
  return null;
}

// ── Catalog normalization ────────────────────────────────────────────────────

const TIERS: CardBorder['minTier'][] = ['starter', 'pro', 'enterprise'];
const KINDS: CardBorder['kind'][] = ['card', 'avatar'];

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const hex = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)
    ? value
    : fallback;

/**
 * Coerces one untrusted catalog entry into a renderable border, or null if it
 * is unusable.
 *
 * MUST mirror normalizeBorder in the webapp's src/data/cardBorders.js. This
 * runs on data fetched from Firestore, which the renderers treat as trusted
 * style input — a malformed number reaching a style object yields a blank or
 * broken card rather than an exception, which is the harder bug to find. Bad
 * entries are dropped here so the built-in of the same key renders instead.
 */
export function normalizeBorder(raw: any): CardBorder | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.key !== 'string' || raw.key.length === 0) return null;

  const artwork: BorderArtwork | null =
    raw.artwork && (raw.artwork.url || raw.artwork.slug)
      ? {
          ...(raw.artwork.url ? { url: String(raw.artwork.url) } : {}),
          ...(raw.artwork.slug ? { slug: String(raw.artwork.slug) } : {}),
          size: num(raw.artwork.size, 512),
          slice: num(raw.artwork.slice, 96),
          width: num(raw.artwork.width, 20),
        }
      : null;

  // A slice at or past half the canvas leaves no band to stretch and would
  // render the frame inside out, so the entry is refused rather than drawn.
  if (artwork && artwork.slice >= artwork.size / 2) return null;

  return {
    key: raw.key,
    name: typeof raw.name === 'string' ? raw.name : raw.key,
    description: typeof raw.description === 'string' ? raw.description : '',
    kind: KINDS.includes(raw.kind) ? raw.kind : 'card',
    minTier: TIERS.includes(raw.minTier) ? raw.minTier : 'enterprise',
    ring: {
      width: num(raw.ring?.width, 2),
      color: hex(raw.ring?.color, '#FFFFFF'),
    },
    glow: raw.glow
      ? {
          color: hex(raw.glow.color, '#FFFFFF'),
          radius: num(raw.glow.radius, 18),
          opacity: Math.min(1, Math.max(0, num(raw.glow.opacity, 0.5))),
        }
      : null,
    gradient:
      Array.isArray(raw.gradient?.colors) && raw.gradient.colors.length >= 2
        ? {
            colors: raw.gradient.colors.map((c: unknown) => hex(c, '#FFFFFF')),
            angle: num(raw.gradient.angle, 135),
          }
        : null,
    pulse: raw.pulse
      ? {
          // The floor is enforced here rather than trusted from the document:
          // anything faster reads as a flicker, not a feature.
          durationMs: Math.max(1600, num(raw.pulse.durationMs, 2400)),
          minOpacity: Math.min(1, Math.max(0, num(raw.pulse.minOpacity, 0.4))),
        }
      : null,
    artwork,
    ...(raw.retired ? { retired: true } : {}),
  };
}

export const DEFAULT_BORDER_KEY = 'default';

export const CARD_BORDERS: CardBorder[] = [
  {
    key: 'default',
    name: 'Default',
    description: 'Clean dark card',
    kind: 'card',
    minTier: 'starter',
    // Matches the card's own hairline, so "default" is not a special case in
    // the renderer — it is simply a border with no glow.
    ring: { width: 1, color: '#362A3D' },
    glow: null,
    gradient: null,
    pulse: null,
    artwork: null,
  },
  {
    key: 'neon-glow',
    name: 'Neon Glow',
    description: 'Coral ring & glow',
    kind: 'card',
    minTier: 'pro',
    ring: { width: 2, color: '#FF4D6D' },
    glow: { color: '#FF4D6D', radius: 18, opacity: 0.55 },
    gradient: null,
    pulse: null,
    artwork: null,
  },
  {
    key: 'gold-trim',
    name: 'Gold Trim',
    description: 'Gold ring & glow',
    kind: 'card',
    minTier: 'pro',
    ring: { width: 2, color: '#FFB84D' },
    glow: { color: '#FFB84D', radius: 18, opacity: 0.55 },
    gradient: null,
    pulse: null,
    artwork: null,
  },
  {
    key: 'sunset-fade',
    name: 'Sunset Fade',
    description: 'Coral→gold gradient ring',
    kind: 'card',
    minTier: 'pro',
    ring: { width: 2, color: '#FF4D6D' },
    glow: { color: '#FF7A4D', radius: 20, opacity: 0.45 },
    gradient: { colors: ['#FF4D6D', '#FFB84D'], angle: 135 },
    pulse: null,
    artwork: null,
  },
  {
    key: 'pulse-electric',
    name: 'Electric Pulse',
    description: 'Breathing teal ring',
    kind: 'card',
    minTier: 'enterprise',
    ring: { width: 2, color: '#2DD4BF' },
    glow: { color: '#2DD4BF', radius: 22, opacity: 0.6 },
    gradient: null,
    pulse: { durationMs: 2400, minOpacity: 0.35 },
    artwork: null,
  },

  // ── TEMPLATE: hand-drawn frame art ─────────────────────────────────────────
  // Mirror of the template in the webapp registry. Uncomment BOTH together,
  // and register the slug in ART_SOURCES above. Full art spec in
  // CARD-BORDERS.md. Kept commented out because an entry whose asset is
  // missing from ART_SOURCES renders as its flat ring fallback, which looks
  // like a bug rather than a missing file.
  //
  // {
  //   key: 'art-baroque',
  //   name: 'Baroque',
  //   description: 'Hand-drawn gilded frame',
  //   minTier: 'enterprise',
  //   ring: { width: 2, color: '#C9A227' },
  //   glow: { color: '#C9A227', radius: 20, opacity: 0.4 },
  //   gradient: null,
  //   pulse: null,
  //   artwork: { slug: 'art-baroque', size: 512, slice: 96, width: 22 },
  // },
];

const BY_KEY: Record<string, CardBorder> = Object.fromEntries(
  CARD_BORDERS.map((b) => [b.key, b])
);

/** Always returns a spec — see the unknown-key note in the header. */
export function resolveCardBorder(key: string | undefined | null): CardBorder {
  return (key ? BY_KEY[key] : undefined) ?? BY_KEY[DEFAULT_BORDER_KEY];
}

/** True when this build knows how to render `key`. */
export function isCardBorderKey(key: unknown): key is string {
  return typeof key === 'string' && key in BY_KEY;
}

/**
 * `expo-linear-gradient` takes start/end unit points, not degrees. Converts the
 * registry's angle (0 = left→right, 90 = top→bottom, matching CSS) into the
 * pair of points that draws the same ramp.
 */
export function gradientPoints(angle: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const radians = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return {
    start: { x: 0.5 - dx, y: 0.5 - dy },
    end: { x: 0.5 + dx, y: 0.5 + dy },
  };
}

/**
 * Shadow props for the wrapper view that sits OUTSIDE the card.
 *
 * Two platform constraints drive this shape:
 *  • iOS clips a view's shadow when that same view sets `overflow: 'hidden'`,
 *    and the card must clip (rounded media). So the glow can only live on a
 *    wrapper, never on the card itself.
 *  • Android draws shadows from `elevation`, and only honours `shadowColor`
 *    for them from API 28. Below that the glow degrades to a neutral drop
 *    shadow — acceptable, because the RING (a plain border) is what actually
 *    identifies the tier, and that renders identically everywhere.
 */
export function cardBorderShadowStyle(border: CardBorder) {
  if (!border.glow) return null;
  return {
    shadowColor: border.glow.color,
    shadowOpacity: border.glow.opacity,
    shadowRadius: border.glow.radius,
    shadowOffset: { width: 0, height: 0 },
    elevation: Math.round(border.glow.radius / 2),
  } as const;
}
