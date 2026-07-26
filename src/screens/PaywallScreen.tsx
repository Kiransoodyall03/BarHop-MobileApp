import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import RedeemCodeModal from '../components/RedeemCodeModal';
import {
  getProPackages,
  purchaseProPackage,
  purchasesSupported,
  restoreProPurchases,
  type PurchasesPackage,
} from '../services/purchasesModule';
import { TIER_LIMITS, useConsumerSubscription } from '../hooks/useConsumerSubscription';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

type BillingPeriod = 'annual' | 'monthly';

// Google Play requires these to be reachable from the purchase screen.
const TERMS_URL = 'https://barhopcreator.netlify.app/terms';
const PRIVACY_URL = 'https://barhopcreator.netlify.app/privacy';

const free = TIER_LIMITS.free;
const pro = TIER_LIMITS.pro;

// Ordered most-felt-first: the swipe cap and ads are what a free user actually
// bumps into. Limits come from TIER_LIMITS so the copy can't drift from the
// gates that enforce them.
const PRO_FEATURES: string[] = [
  'No ads, ever',
  'Unlimited swipes',
  'Filter by genre, dress code & cover',
  'Live Vibe Check on every venue',
  `Squads of ${pro.maxMembersPerSquad} (up from ${free.maxMembersPerSquad})`,
  `${pro.maxItineraryStops} itinerary stops (up from ${free.maxItineraryStops})`,
  'Rewind accidental swipes',
];

const FREE_FEATURES: string[] = [
  `${free.maxSquads} squads, ${free.maxMembersPerSquad} members each`,
  `${free.maxItineraryStops} itinerary stops`,
  'Distance filter',
  'Ads between cards',
];

export default function PaywallScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { isPro } = useConsumerSubscription();

  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [busy, setBusy] = useState(false);
  const [redeemVisible, setRedeemVisible] = useState(false);

  useEffect(() => {
    let active = true;
    getProPackages().then((result) => {
      if (active) setPackages(result);
    });
    return () => {
      active = false;
    };
  }, []);

  // packageType is a string enum ('ANNUAL' | 'MONTHLY'), compared as a literal
  // so this screen never has to import from the native module.
  const annualPackage = packages?.find((p) => p.packageType === 'ANNUAL') ?? null;
  const monthlyPackage = packages?.find((p) => p.packageType === 'MONTHLY') ?? null;
  const selected = period === 'annual' ? annualPackage : monthlyPackage;

  // Savings are computed from the real prices rather than hardcoded, so they
  // stay correct whatever you set in Play Console.
  const savingsPercent =
    annualPackage && monthlyPackage
      ? Math.round(
          (1 - annualPackage.product.price / (monthlyPackage.product.price * 12)) * 100
        )
      : null;

  const handlePurchase = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    const outcome = await purchaseProPackage(selected);
    setBusy(false);

    if (outcome.status === 'purchased') {
      // The gates unlock instantly off the local entitlement; the webhook
      // mirrors it to consumerTier moments later.
      navigation.goBack();
      return;
    }
    // Backing out is the most common paywall outcome — never alert on it.
    if (outcome.status === 'cancelled') return;
    Alert.alert(
      'Purchase unavailable',
      outcome.status === 'unavailable'
        ? 'Subscriptions aren’t available on this device yet.'
        : outcome.message
    );
  }, [selected, busy, navigation]);

  const handleRestore = useCallback(async () => {
    setBusy(true);
    const restored = await restoreProPurchases();
    setBusy(false);
    Alert.alert(
      restored ? 'Pro restored 🥂' : 'Nothing to restore',
      restored
        ? 'Your BarHop Pro subscription is active again.'
        : 'We couldn’t find an active subscription on this account.'
    );
    if (restored) navigation.goBack();
  }, [navigation]);

  const loading = packages === null && purchasesSupported;
  const unavailable = !purchasesSupported || (packages !== null && packages.length === 0);

  return (
    // Presented as a native-stack modal, which renders in a separate native
    // container OUTSIDE the app-root GestureHandlerRootView. Without its own
    // wrapper here, gesture-handler swallows every touch — the screen renders
    // but nothing is tappable. Mirrors what VenueDetailsSheet does for its Modal.
    <GestureHandlerRootView style={styles.gradient}>
    <LinearGradient colors={colors.authGradient} style={styles.gradient}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.closeButton} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.heading}>BarHop Pro</Text>
        <Text style={styles.subheading}>Own the night. No ads, no limits.</Text>

        {/* Billing period toggle — annual first, it's the better deal. */}
        {!unavailable && (
          <View style={styles.toggleRow}>
            {(['annual', 'monthly'] as BillingPeriod[]).map((option) => {
              const active = period === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.togglePill, active && styles.togglePillActive]}
                  onPress={() => setPeriod(option)}
                >
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {option === 'annual' ? 'Annual' : 'Monthly'}
                  </Text>
                  {option === 'annual' && savingsPercent && savingsPercent > 0 ? (
                    <View style={styles.saveBadge}>
                      <Text style={styles.saveBadgeText}>SAVE {savingsPercent}%</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Pro card ── */}
        <View style={styles.proCard}>
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
          </View>

          <Text style={styles.planName}>Pro</Text>
          <Text style={styles.planTagline}>Everything unlocked.</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.priceLoader} />
          ) : unavailable ? (
            <Text style={styles.unavailableText}>
              Subscriptions aren’t available on this device yet. Please try again from the
              Play Store version of the app.
            </Text>
          ) : (
            <View style={styles.priceRow}>
              <Text style={styles.price}>{selected?.product.priceString ?? '—'}</Text>
              <Text style={styles.pricePeriod}>{period === 'annual' ? '/yr' : '/mo'}</Text>
            </View>
          )}

          <View style={styles.featureList}>
            {PRO_FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Ionicons name="sparkles" size={15} color={colors.accent} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {isPro ? (
            <View style={styles.currentPlanPill}>
              <Ionicons name="checkmark-circle" size={17} color={colors.like} />
              <Text style={styles.currentPlanText}>You’re on Pro</Text>
            </View>
          ) : unavailable ? null : ( // no billing configured — don't dangle a dead CTA
            <Pressable
              style={({ pressed }) => [styles.ctaButton, (pressed || busy) && styles.dim]}
              onPress={handlePurchase}
              disabled={busy || !selected}
            >
              <LinearGradient
                colors={colors.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaInner}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
                    <Text style={styles.ctaText}>Start 7-day free trial</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}

          {!isPro && !unavailable ? (
            <Text style={styles.trialNote}>
              7 days free, then {selected?.product.priceString ?? '—'}
              {period === 'annual' ? '/year' : '/month'}. Cancel anytime in Google Play.
            </Text>
          ) : null}
        </View>

        {/* ── Free card ── */}
        <View style={styles.freeCard}>
          <View style={styles.freeHeaderRow}>
            <Text style={styles.freePlanName}>Free</Text>
            {!isPro && (
              <View style={styles.currentChip}>
                <Text style={styles.currentChipText}>CURRENT</Text>
              </View>
            )}
          </View>
          <View style={styles.featureList}>
            {FREE_FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <Ionicons name="ellipse-outline" size={13} color={colors.textFaint} />
                <Text style={styles.freeFeatureText}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        {!isPro && (
          <Pressable onPress={() => setRedeemVisible(true)} hitSlop={8}>
            <Text style={styles.redeemLink}>Have a code? Redeem it</Text>
          </Pressable>
        )}

        <Pressable onPress={handleRestore} disabled={busy} hitSlop={8}>
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        <View style={styles.legalRow}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
            <Text style={styles.legalLink}>Terms</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
            <Text style={styles.legalLink}>Privacy</Text>
          </Pressable>
        </View>
      </ScrollView>

      <RedeemCodeModal
        visible={redeemVisible}
        onClose={() => setRedeemVisible(false)}
        // The grant arrives via the profile snapshot; close the paywall so the
        // user lands back where they were, now unlocked.
        onRedeemed={() => navigation.goBack()}
      />
    </LinearGradient>
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    gradient: { flex: 1 },
    content: { paddingHorizontal: 20 },

    closeButton: { alignSelf: 'flex-end', padding: 4 },

    heading: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 4 },
    subheading: { color: colors.textMuted, fontSize: 15, marginTop: 6, marginBottom: 22 },

    toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    togglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    togglePillActive: { backgroundColor: colors.chipActiveBg, borderColor: colors.primary },
    toggleText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
    toggleTextActive: { color: colors.primary },
    saveBadge: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    saveBadgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '800' },

    proCard: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: colors.accent,
      padding: 22,
      paddingTop: 26,
    },
    popularBadge: {
      position: 'absolute',
      top: -11,
      alignSelf: 'center',
      left: 0,
      right: 0,
      marginHorizontal: 'auto',
      backgroundColor: colors.accent,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 4,
      alignItems: 'center',
      width: 130,
    },
    popularBadgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '800' },

    planName: { color: colors.text, fontSize: 24, fontWeight: '800' },
    planTagline: { color: colors.textMuted, fontSize: 14, marginTop: 3 },

    priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 },
    price: { color: colors.text, fontSize: 38, fontWeight: '800' },
    pricePeriod: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginBottom: 7 },
    priceLoader: { marginVertical: 24, alignSelf: 'flex-start' },
    unavailableText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 14 },

    featureList: { marginTop: 18, gap: 11 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureText: { color: colors.text, fontSize: 14, flex: 1 },
    freeFeatureText: { color: colors.textMuted, fontSize: 14, flex: 1 },

    ctaButton: { alignSelf: 'stretch', borderRadius: 14, overflow: 'hidden', marginTop: 22 },
    ctaInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      paddingVertical: 15,
    },
    ctaText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
    dim: { opacity: 0.7 },
    trialNote: {
      color: colors.textFaint,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
      marginTop: 11,
    },

    currentPlanPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 22,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.surfaceLight,
    },
    currentPlanText: { color: colors.text, fontSize: 15, fontWeight: '700' },

    freeCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginTop: 18,
    },
    freeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    freePlanName: { color: colors.textMuted, fontSize: 19, fontWeight: '700' },
    currentChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 9,
      paddingVertical: 3,
    },
    currentChipText: { color: colors.textFaint, fontSize: 10, fontWeight: '800' },

    redeemLink: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 24,
    },
    restoreText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 16,
    },
    legalRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 14,
    },
    legalLink: { color: colors.textFaint, fontSize: 13 },
    legalDot: { color: colors.textFaint, fontSize: 13 },
  });
