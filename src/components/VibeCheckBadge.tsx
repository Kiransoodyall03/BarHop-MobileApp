import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { BUSYNESS_META, type Venue } from '../types';

/**
 * "Vibe Check" — live venue busyness fed from the B2B side
 * (venues/{venueId}.currentBusyness). Pro/Elite see the real status; free
 * users see a locked teaser. Hidden entirely when the venue has no data.
 * Reads the tier itself via useConsumerSubscription — no prop drilling
 * through the swipe deck.
 */
export default function VibeCheckBadge({ venue }: { venue: Venue }) {
  const { hasVibeCheck } = useConsumerSubscription();
  const busyness = venue.currentBusyness;
  if (!busyness || !BUSYNESS_META[busyness]) return null;

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
