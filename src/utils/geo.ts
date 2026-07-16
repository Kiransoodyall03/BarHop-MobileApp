// Distance + travel-time estimation between itinerary stops.
//
// MVP estimates are haversine-based (straight-line distance with an urban
// wiggle factor). Upgrading to real routes/times = Google Directions API via
// react-native-maps-directions (requires a billed API key) — swap inside
// estimateTravel and the ItineraryScreen polyline when that lands.

interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface TravelEstimate {
  mode: 'walk' | 'drive';
  minutes: number;
  label: string; // e.g. "🚶 8 min walk" / "🚗 12 min drive"
}

// Streets aren't straight lines — pad the crow-flies distance.
const ROUTE_WIGGLE = 1.3;
const WALK_KM_PER_H = 4.8;
const DRIVE_KM_PER_H = 28; // urban nightlife traffic
const MAX_WALK_KM = 1.4;

export function estimateTravel(a: LatLng, b: LatLng): TravelEstimate {
  const km = haversineKm(a, b) * ROUTE_WIGGLE;
  if (km <= MAX_WALK_KM) {
    const minutes = Math.max(1, Math.round((km / WALK_KM_PER_H) * 60));
    return { mode: 'walk', minutes, label: `🚶 ${minutes} min walk` };
  }
  const minutes = Math.max(3, Math.round((km / DRIVE_KM_PER_H) * 60) + 3);
  return { mode: 'drive', minutes, label: `🚗 ${minutes} min drive` };
}
