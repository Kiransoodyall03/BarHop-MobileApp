import { Linking, Platform } from 'react-native';

/**
 * Opens Uber with the destination pre-filled (pickup = rider's location).
 * Tries the native uber:// scheme first, falls back to the universal web
 * link (which routes to the app/store/site as appropriate).
 */
export async function openInUber(
  latitude: number,
  longitude: number,
  nickname: string
): Promise<void> {
  const params =
    `action=setPickup&pickup=my_location` +
    `&dropoff[latitude]=${latitude}&dropoff[longitude]=${longitude}` +
    `&dropoff[nickname]=${encodeURIComponent(nickname)}`;
  const native = `uber://?${params}`;
  const web = `https://m.uber.com/ul/?${params}`;

  try {
    const canOpenNative = await Linking.canOpenURL(native);
    await Linking.openURL(canOpenNative ? native : web);
  } catch (error) {
    console.warn('[deepLinks] could not open Uber:', error);
    Linking.openURL(web).catch(() => {});
  }
}

/** Opens the platform's maps app pointed at the venue. */
export function openInMaps(latitude: number, longitude: number, label: string): void {
  const encoded = encodeURIComponent(label);
  const url =
    Platform.OS === 'ios'
      ? `maps:0,0?q=${encoded}@${latitude},${longitude}`
      : `geo:0,0?q=${latitude},${longitude}(${encoded})`;
  Linking.openURL(url).catch(() => {
    // Universal fallback — works everywhere, including simulators without maps.
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    ).catch((error) => console.warn('[deepLinks] could not open maps:', error));
  });
}
