import { haversineKm } from './geo';
import { resolveVenueCoords } from './venueCoords';
import {
  EMPTY_FILTERS,
  FREE_GENRE_OPTIONS,
  type StoredLocation,
  type VenueFilters,
  type VenueWithId,
} from '../types';

/**
 * Applies deck filters to a local venue array (before ad injection).
 *
 * Semantics:
 * - Genres: at-least-one overlap with the union of venue.categories and
 *   venue.musicGenres (user decision — "must have at least 1").
 * - LENIENT on missing data: a venue with NO value for a filtered field is
 *   kept, not excluded — the B2B webapp doesn't write dressCode/coverCharge/
 *   musicGenres yet, and filters should narrow the deck, not empty it.
 * - Distance needs the user's stored location; skipped without one.
 */
export function applyProFilters(
  venues: VenueWithId[],
  filters: VenueFilters | null | undefined,
  userLocation?: StoredLocation | null
): VenueWithId[] {
  if (!filters) return venues;

  return venues.filter((venue) => {
    if (filters.maxDistanceKm != null && userLocation) {
      const coords = resolveVenueCoords(venue);
      if (haversineKm(userLocation, coords) > filters.maxDistanceKm) return false;
    }

    if (filters.genres.length > 0) {
      const venueTags = [...(venue.categories ?? []), venue.category, ...(venue.musicGenres ?? [])]
        .filter((tag): tag is string => Boolean(tag))
        .map((tag) => tag.toLowerCase());
      // Lenient: venues with no tag data at all pass through.
      if (venueTags.length > 0 && !filters.genres.some((g) => venueTags.includes(g.toLowerCase()))) {
        return false;
      }
    }

    if (filters.dressCode && venue.dressCode && venue.dressCode !== filters.dressCode) {
      return false;
    }

    if (
      filters.maxCover != null &&
      typeof venue.coverCharge === 'number' &&
      venue.coverCharge > filters.maxCover
    ) {
      return false;
    }

    if (filters.dietary.length > 0) {
      const venueDietary = (venue.dietaryOptions ?? []).map((d) => d.toLowerCase());
      // Lenient (like genres): venues with no dietary data pass. Once a venue
      // DOES declare options, require at least one overlap with the filter.
      if (
        venueDietary.length > 0 &&
        !filters.dietary.some((d) => venueDietary.includes(d.toLowerCase()))
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Strips filter dimensions the given tier isn't entitled to.
 *
 * Needed because entitlement can be lost after filters were set — a lapsed Pro
 * subscriber, or a free member inheriting a Pro host's squad filters — and
 * applyProFilters itself has no notion of tier.
 *
 * ⚠️ Apply this to SOLO filters only, never to a squad's. Every member of a
 * squad must apply the identical host-set filters: sanitizing per-member would
 * hand a free member a different deck from a Pro member, and a venue one of
 * them never saw can never reach consensus (see isVenueMatched).
 */
export function sanitizeFiltersForTier(
  filters: VenueFilters,
  hasAdvancedFilters: boolean
): VenueFilters {
  if (hasAdvancedFilters) return filters;
  return {
    ...filters,
    genres: filters.genres.filter((genre) => FREE_GENRE_OPTIONS.includes(genre)),
    dressCode: null,
    maxCover: null,
  };
}

/** Number of active filter dimensions — drives the header badge. */
export function countActiveFilters(filters: VenueFilters | null | undefined): number {
  if (!filters) return 0;
  let count = 0;
  if (filters.maxDistanceKm != null) count += 1;
  if (filters.genres.length > 0) count += 1;
  if (filters.dressCode) count += 1;
  if (filters.maxCover != null) count += 1;
  if (filters.dietary.length > 0) count += 1;
  return count;
}

/**
 * Backfills any missing keys from EMPTY_FILTERS — squad filters stored in
 * Firestore before a field (e.g. `dietary`) existed would otherwise arrive
 * without it and crash `filters.dietary.length`.
 */
export function normalizeFilters(filters: VenueFilters | null | undefined): VenueFilters {
  return { ...EMPTY_FILTERS, ...(filters ?? {}) };
}
