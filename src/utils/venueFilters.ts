import { haversineKm } from './geo';
import { resolveVenueCoords } from './venueCoords';
import { EMPTY_FILTERS, type StoredLocation, type VenueFilters, type VenueWithId } from '../types';

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
        .filter(Boolean)
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

    return true;
  });
}

/** Number of active filter dimensions — drives the header badge. */
export function countActiveFilters(filters: VenueFilters | null | undefined): number {
  if (!filters) return 0;
  let count = 0;
  if (filters.maxDistanceKm != null) count += 1;
  if (filters.genres.length > 0) count += 1;
  if (filters.dressCode) count += 1;
  if (filters.maxCover != null) count += 1;
  return count;
}

export function normalizeFilters(filters: VenueFilters | null | undefined): VenueFilters {
  return filters ?? EMPTY_FILTERS;
}
