import type { StopCoords, Venue } from '../types';

/**
 * Coordinate resolution chain for venues (the "blended" location feature):
 *
 * 1. Coordinates stored ON the venue document — written by the Creator
 *    webapp (Foursquare/Places data) for owner-created venues.
 * 2. TODO(blended-places): for venues WITHOUT an owner-created card, fetch
 *    from the Google Places API server-side, with an area-keyed cache /
 *    hashmap over highly-searched zones to keep API costs down. Planned as a
 *    Cloud Function follow-up — this seam is where its result plugs in.
 * 3. Deterministic dummy coordinates so maps/routing work TODAY: the venueId
 *    hash spreads venues over a ~6 km blob around the Johannesburg CBD.
 *    Stable across renders/devices (same venue → same pin).
 */
export function resolveVenueCoords(venue: Venue & { id?: string }): StopCoords {
  if (typeof venue.latitude === 'number' && typeof venue.longitude === 'number') {
    return { latitude: venue.latitude, longitude: venue.longitude, source: 'venue' };
  }

  // TODO(blended-places): Places API + cache lookup goes here.

  const seedSource = venue.placeId || venue.id || venue.name;
  const seed = hashString(seedSource);
  const JHB_CBD = { latitude: -26.2041, longitude: 28.0473 };
  // Two independent offsets in roughly ±0.03° (~±3 km).
  const latOffset = (((seed % 1000) / 1000) - 0.5) * 0.06;
  const lngOffset = ((((seed >> 10) % 1000) / 1000) - 0.5) * 0.06;
  return {
    latitude: JHB_CBD.latitude + latOffset,
    longitude: JHB_CBD.longitude + lngOffset,
    source: 'dummy',
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}
