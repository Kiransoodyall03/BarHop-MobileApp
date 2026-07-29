import { useAuth } from '../context/AuthContext';
import { haversineKm } from '../utils/geo';
import { resolveVenueCoords } from '../utils/venueCoords';
import type { VenueWithId } from '../types';

/**
 * "2.4 km away" for a venue, or null when it can't be stated honestly.
 *
 * Returns null in two cases, both deliberate:
 *
 *  1. No stored user location (permission declined or onboarding skipped).
 *  2. The venue's coordinates came from resolveVenueCoords' `dummy` fallback —
 *     a deterministic pin scattered around the JHB CBD for venues with no real
 *     geodata. Owner venues have carried coordinates since the Creator webapp
 *     started writing them, and district stubs are dropped outright without
 *     them, so this should not occur in practice. The guard stays because a
 *     confidently wrong distance is worse than no distance: it is the single
 *     metric people use to decide whether a venue is worth the trip.
 */
export function useDistanceLabel(venue: VenueWithId): string | null {
  const { profile } = useAuth();
  const userLocation = profile?.location;
  if (!userLocation) return null;

  const coords = resolveVenueCoords(venue);
  if (coords.source === 'dummy') return null;

  const km = haversineKm(userLocation, coords);
  // Sub-kilometre reads as metres — "0.3 km away" is how far, "300 m away" is
  // whether to walk.
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m away`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}
