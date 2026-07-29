import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { BUSYNESS_META, type Venue } from '../types';

/**
 * A busyness reading older than this is treated as absent. The owner sets it by
 * hand from the Creator dashboard and there is nothing that clears it at close,
 * so without an expiry a Friday-night "lively" would still be showing on
 * Sunday. The Creator dashboard applies the same window to its own control.
 */
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

function isFresh(updatedAt: Venue['busynessUpdatedAt']): boolean {
  if (!updatedAt) return false; // written alongside every real update
  const ms =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : typeof updatedAt === 'object' && 'seconds' in updatedAt
        ? updatedAt.seconds * 1000
        : 0;
  return ms > 0 && Date.now() - ms < STALE_AFTER_MS;
}

/**
 * "Vibe Check" — live venue busyness fed from the B2B side
 * (venues/{venueId}.currentBusyness). Pro sees the real status; free users see
 * a locked teaser. Hidden entirely when the venue has no data, or when that
 * data is stale.
 *
 * Staleness is checked BEFORE the tier branch on purpose: a free user must not
 * be teased into paying for a reading that would turn out to be two days old.
 */
export default function VibeCheckBadge({ venue }: { venue: Venue }) {
  const { hasVibeCheck } = useConsumerSubscription();
  const busyness = venue.currentBusyness;
  if (!busyness || !BUSYNESS_META[busyness]) return null;
  if (!isFresh(venue.busynessUpdatedAt)) return null;

  if (!hasVibeCheck) {
    return (
      <View style={[styles.badge, styles.lockedBadge]}>
        <Text style={styles.lockedText}>🔒 Unlock Vibe Check</Text>
      </View>
    );
  }

  const meta = BUSYNESS_META[busyness];
  return (
    <View style={styles.badge}>
      <Text style={styles.liveText}>
        {meta.emoji} {meta.label}
      </Text>
    </View>
  );
}

// Overlays a photo in both themes — fixed dark chrome, white text.
const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(10, 5, 8, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  lockedBadge: { opacity: 0.85 },
  liveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  lockedText: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, fontWeight: '700' },
});
