import { useSyncExternalStore } from 'react';
import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  CARD_BORDERS,
  DEFAULT_BORDER_KEY,
  normalizeBorder,
  type CardBorder,
} from '../theme/cardBorders';

// ─────────────────────────────────────────────────────────────────────────────
// Border catalog — the live list of premium card & avatar frames.
//
// Reads borderCatalog/current, ONE document, ONCE per app launch. That is the
// same shape as districtIndex: a single small document costs one read no matter
// how many borders exist, and the artwork itself is not in it — only Cloudinary
// URLs are, so the document stays tiny.
//
// This is what lets new frame art ship WITHOUT an app release: an admin
// publishes in the Border Studio and the next launch picks it up.
//
// ── Why a plain store and not a Context ──────────────────────────────────────
// The only consumers are VenueCard (rendered inside a gesture-driven deck) and
// Avatar (rendered in lists). Threading a provider through App.tsx to reach
// them buys nothing over a module-level store, and `useSyncExternalStore` keeps
// the subscription correct without one.
//
// ── Failure posture ──────────────────────────────────────────────────────────
// Three layers, so a card ALWAYS renders: last-good catalog from AsyncStorage
// (instant, survives offline launches) → live document → the built-in registry
// compiled into the bundle. A catalog that cannot load degrades to plain cards,
// it never blocks the deck.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'barhop.borderCatalog.v1';

let borders: CardBorder[] = CARD_BORDERS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setBorders(next: CardBorder[]) {
  borders = next;
  loaded = true;
  emit();
  prefetchArtwork(next);
}

/**
 * Overlays a published catalog on the built-in registry. Built-ins are the
 * floor — they render before any fetch resolves and when the device is
 * offline; a catalog entry with the same key replaces its built-in, a new key
 * is appended, and `default` can never be dropped because every resolver falls
 * back to it.
 */
export function mergeCatalog(raw: unknown): CardBorder[] {
  if (!Array.isArray(raw) || raw.length === 0) return CARD_BORDERS;

  const merged = new Map(CARD_BORDERS.map((b) => [b.key, b]));
  for (const entry of raw) {
    const border = normalizeBorder(entry);
    if (border) merged.set(border.key, border);
  }
  if (!merged.has(DEFAULT_BORDER_KEY)) {
    const fallback = CARD_BORDERS.find((b) => b.key === DEFAULT_BORDER_KEY);
    if (fallback) merged.set(DEFAULT_BORDER_KEY, fallback);
  }
  return [...merged.values()];
}

/**
 * Warms the image cache for remote frame art. Without this the frame arrives a
 * beat after the card it belongs to, which reads as a rendering fault on a
 * deck the user is already swiping. Failures are ignored — the flat ring
 * fallback covers it.
 */
function prefetchArtwork(list: CardBorder[]) {
  for (const border of list) {
    const url = border.artwork?.url;
    if (url) Image.prefetch(url).catch(() => {});
  }
}

/**
 * Loads the catalog: cached copy first (so the first deck of an offline launch
 * still shows premium frames), then the live document.
 *
 * Safe to call more than once; call it on app start, after auth is ready — the
 * catalog document requires a signed-in reader.
 */
export async function loadBorderCatalog(): Promise<void> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached && !loaded) setBorders(mergeCatalog(JSON.parse(cached)));
  } catch {
    // A corrupt cache is not worth reporting — the live read replaces it.
  }

  try {
    const snap = await getDoc(doc(db, 'borderCatalog', 'current'));
    const raw = snap.exists() ? snap.data().borders : null;
    setBorders(mergeCatalog(raw));
    if (Array.isArray(raw)) {
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(raw)).catch(() => {});
    }
  } catch (error) {
    console.warn('[borderCatalog] load failed, using built-ins:', error);
    if (!loaded) setBorders(CARD_BORDERS);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => borders;

/** The current catalog. Re-renders its caller when a fresh one lands. */
export function useBorderCatalog(): CardBorder[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The border for a persisted key, from the live catalog. Always returns a
 * renderable spec — an unknown key (a venue styled with art this build has not
 * seen yet) resolves to the default rather than throwing.
 */
export function useCardBorder(key: string | undefined | null): CardBorder {
  const catalog = useBorderCatalog();
  return (
    catalog.find((b) => b.key === key) ??
    catalog.find((b) => b.key === DEFAULT_BORDER_KEY) ??
    CARD_BORDERS[0]
  );
}

/** Test seam — lets a test install a catalog without touching Firestore. */
export function __setBordersForTest(next: CardBorder[]) {
  setBorders(next);
}
