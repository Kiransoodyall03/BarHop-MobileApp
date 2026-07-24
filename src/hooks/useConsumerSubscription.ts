// Consumer subscription state + tier limit/feature helpers.
//
// The tier is read LIVE from users/{uid}.consumerTier via AuthContext's
// profile subscription (onSnapshot) — when future consumer billing flips the
// field, every gate in the app updates in real time. NOTE: this is a
// deliberately different field from the B2B `subscriptionTier`
// (trial/starter/pro/enterprise) that venue owners carry on the same user
// documents — the two billing systems never touch each other's fields.

import { useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { getEntitlementSnapshot, subscribeToEntitlement } from '../services/purchasesModule';
import { isFuture } from '../utils/timestamps';
import type { ConsumerTier } from '../types';

export interface TierLimits {
  maxSquads: number;
  maxMembersPerSquad: number;
  maxItineraryStops: number;
}

// Free: 3/3/3 · Pro: 7/7/5 · Elite: unlimited.
export const TIER_LIMITS: Record<ConsumerTier, TierLimits> = {
  free: { maxSquads: 3, maxMembersPerSquad: 3, maxItineraryStops: 3 },
  pro: { maxSquads: 7, maxMembersPerSquad: 7, maxItineraryStops: 5 },
  elite: { maxSquads: Infinity, maxMembersPerSquad: Infinity, maxItineraryStops: Infinity },
};

export function limitsForTier(tier: ConsumerTier | undefined): TierLimits {
  return TIER_LIMITS[tier ?? 'free'] ?? TIER_LIMITS.free;
}

/** Human label for limit-error copy ("Free accounts…" / "Pro accounts…"). */
export function tierLabel(tier: ConsumerTier | undefined): string {
  const t = tier ?? 'free';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface ConsumerSubscription extends TierLimits {
  tier: ConsumerTier;
  isPro: boolean; // pro OR elite
  isElite: boolean;
  // Pro feature flags
  showAds: boolean; // false for pro/elite — deck skips ad injection
  hasUnlimitedSwipes: boolean;
  hasAdvancedFilters: boolean;
  canRewind: boolean;
  hasVibeCheck: boolean;
  /** CTA copy for upsells: free users get pitched Pro, Pro users Elite. */
  upgradeCtaLabel: string;
  // Usage comparators — pass the caller's current counts.
  canCreateMoreSquads: (activeSquadCount: number) => boolean;
  canAddMoreMembers: (memberCount: number) => boolean;
  canAddMoreItineraryStops: (stopCount: number) => boolean;
}

export function useConsumerSubscription(): ConsumerSubscription {
  const { profile } = useAuth();

  // users/{uid}.consumerTier is the authoritative tier — written ONLY by the
  // RevenueCat webhook (clients can't set it; see firestore.rules). But that
  // write lands a beat after payment, so a live local entitlement promotes a
  // 'free' profile to Pro immediately. Deliberately one-directional: it can
  // upgrade, never downgrade, so it can't strip access from an 'elite' user or
  // fight the server's view.
  const storedTier: ConsumerTier = profile?.consumerTier ?? 'free';
  const hasLocalPro = useSyncExternalStore(subscribeToEntitlement, getEntitlementSnapshot);

  // A redeemed voucher grants Pro until proGrantExpiresAt. Checked live rather
  // than trusting a swept flag, so access ends the moment it lapses even if the
  // nightly expiry sweep hasn't run yet.
  const hasVoucherPro = isFuture(profile?.proGrantExpiresAt);

  const tier: ConsumerTier =
    storedTier === 'free' && (hasLocalPro || hasVoucherPro) ? 'pro' : storedTier;
  const limits = limitsForTier(tier);
  const isPro = tier === 'pro' || tier === 'elite';

  return {
    tier,
    isPro,
    isElite: tier === 'elite',
    showAds: !isPro,
    hasUnlimitedSwipes: isPro,
    hasAdvancedFilters: isPro,
    canRewind: isPro,
    hasVibeCheck: isPro,
    upgradeCtaLabel: tier === 'pro' ? 'Upgrade to Elite' : 'Upgrade to Pro',
    ...limits,
    canCreateMoreSquads: (activeSquadCount) => activeSquadCount < limits.maxSquads,
    canAddMoreMembers: (memberCount) => memberCount < limits.maxMembersPerSquad,
    canAddMoreItineraryStops: (stopCount) => stopCount < limits.maxItineraryStops,
  };
}
