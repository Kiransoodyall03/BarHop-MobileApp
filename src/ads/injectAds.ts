import { adsSupported } from './adsModule';
import type { DeckItem, VenueWithId } from '../types';

/**
 * Interleaves native ad slots into the venue deck for free-tier users:
 * one ad after every `every` venues — never first, never consecutive, and
 * never trailing after the last venue. Returned ad-free where ads are
 * unsupported (Expo Go) or when `enabled` is false (Pro/Elite users).
 */
export function injectAdCards(
  venues: VenueWithId[],
  every = 8,
  enabled = true
): DeckItem[] {
  const items: DeckItem[] = venues.map((venue) => ({
    kind: 'venue' as const,
    id: venue.id,
    venue,
  }));
  if (!enabled || !adsSupported || every < 1) return items;

  const withAds: DeckItem[] = [];
  let adNumber = 0;
  items.forEach((item, index) => {
    withAds.push(item);
    const isLast = index === items.length - 1;
    if (!isLast && (index + 1) % every === 0) {
      adNumber += 1;
      withAds.push({ kind: 'ad', id: `ad-${adNumber}` });
    }
  });
  return withAds;
}
