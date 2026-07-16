import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeAd } from 'react-native-google-mobile-ads';
import { adsModule, NATIVE_AD_UNIT_ID } from './adsModule';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

/**
 * Native ad rendered as a deck card.
 *
 * ── AdMob invalid-traffic / custom-click COMPLIANCE ─────────────────────────
 * 1. Swipes never become ad clicks: the deck's pan gesture is handled by OUR
 *    reanimated view hierarchy and consumed before it can reach the SDK. The
 *    Google SDK only registers a click when the user taps a view wrapped in
 *    <NativeAsset> — swiping/dismissing this card touches none of them.
 * 2. Only the HEADLINE and the CALL_TO_ACTION button are registered assets —
 *    they are the sole legitimate tap targets. Nothing else is clickable and
 *    no programmatic/synthetic click events exist anywhere in the app.
 * 3. Nothing overlays the ad content: the deck suppresses LIKE/NOPE stamps
 *    and the swipe-up gesture for ad cards, and the Sponsored badge + skip
 *    hint sit in our own chrome outside the registered assets.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function NativeAdCard() {
  const styles = useThemedStyles(createStyles);
  const [ad, setAd] = useState<NativeAd | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!adsModule || !NATIVE_AD_UNIT_ID) {
      setFailed(true);
      return;
    }
    let disposed = false;
    let loadedAd: NativeAd | null = null;

    adsModule.NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID)
      .then((nativeAd) => {
        if (disposed) {
          nativeAd.destroy();
          return;
        }
        loadedAd = nativeAd;
        setAd(nativeAd);
      })
      .catch((error) => {
        console.warn('[NativeAdCard] ad failed to load:', error);
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      loadedAd?.destroy();
    };
  }, []);

  // No SDK, no unit ID, or a failed fill → a plain dismissible house card
  // with zero ad SDK surface.
  if (failed || !adsModule) {
    return (
      <View style={styles.card}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackEmoji}>🍻</Text>
          <Text style={styles.fallbackTitle}>BarHop is free thanks to ads</Text>
          <Text style={styles.fallbackText}>Swipe to keep discovering venues.</Text>
        </View>
      </View>
    );
  }

  if (!ad) {
    return (
      <View style={styles.card}>
        <View style={styles.fallback}>
          <ActivityIndicator size="large" />
          <Text style={styles.fallbackText}>Loading sponsored content…</Text>
        </View>
      </View>
    );
  }

  const { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } = adsModule;

  return (
    <View style={styles.card}>
      <NativeAdView nativeAd={ad} style={styles.flex}>
        <View style={styles.flex}>
          {/* Our chrome — NOT a registered asset, never clickable. */}
          <View style={styles.sponsoredBadge}>
            <Text style={styles.sponsoredText}>Sponsored</Text>
          </View>

          <NativeMediaView style={styles.media} />

          <View style={styles.info}>
            {/* Registered asset #1: headline. */}
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <Text style={styles.headline} numberOfLines={2}>
                {ad.headline}
              </Text>
            </NativeAsset>

            {ad.advertiser ? <Text style={styles.advertiser}>{ad.advertiser}</Text> : null}
            {ad.body ? (
              <Text style={styles.body} numberOfLines={2}>
                {ad.body}
              </Text>
            ) : null}

            {/* Registered asset #2: the ONLY call-to-action tap target. */}
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <Text style={styles.cta}>{ad.callToAction ?? 'Learn More'}</Text>
            </NativeAsset>

            <Text style={styles.skipHint}>Not interested? Swipe either way to skip.</Text>
          </View>
        </View>
      </NativeAdView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flex: 1,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    flex: { flex: 1 },

    sponsoredBadge: {
      position: 'absolute',
      top: 14,
      left: 14,
      zIndex: 5,
      backgroundColor: 'rgba(10, 5, 8, 0.7)',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    sponsoredText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },

    media: { flex: 1, backgroundColor: '#000000' },

    info: {
      padding: 20,
      backgroundColor: colors.surface,
    },
    headline: { color: colors.text, fontSize: 20, fontWeight: '800' },
    advertiser: { color: colors.textFaint, fontSize: 13, marginTop: 4 },
    body: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 8 },
    cta: {
      marginTop: 14,
      backgroundColor: colors.primary,
      color: colors.onPrimary,
      borderRadius: 14,
      paddingVertical: 14,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
      overflow: 'hidden',
    },
    skipHint: {
      color: colors.textFaint,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 12,
    },

    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
    fallbackEmoji: { fontSize: 52 },
    fallbackTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    fallbackText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  });
