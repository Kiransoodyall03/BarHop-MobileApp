// Single choke point for the react-native-purchases (RevenueCat) NATIVE module.
//
// Consumer Pro is sold through GOOGLE PLAY BILLING, not Paystack. Play requires
// in-app digital subscriptions to use its own billing; Paystack is the B2B
// venue-subscription flow on the Creator webapp and must not be used here.
// RevenueCat wraps Play Billing and gives us receipt validation + webhooks.
//
// Every surface talks to purchases through this file so the app degrades
// gracefully in the two cases where the SDK can't work:
//   1. Expo Go / any build without the native module — require() throws.
//   2. No EXPO_PUBLIC_REVENUECAT_ANDROID_KEY configured yet.
// In both, `purchasesSupported` is false, the paywall shows an "unavailable"
// state, and nothing crashes. Mirrors src/ads/adsModule.ts.

type PurchasesLibrary = typeof import('react-native-purchases');
type CustomerInfo = import('react-native-purchases').CustomerInfo;
export type PurchasesPackage = import('react-native-purchases').PurchasesPackage;

let loaded: PurchasesLibrary | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  loaded = require('react-native-purchases');
} catch {
  loaded = null; // Expo Go — native module unavailable
}

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

export const purchasesModule: PurchasesLibrary | null = loaded;

/** True only when the native SDK loaded AND an API key is configured. */
export const purchasesSupported = purchasesModule != null && !!API_KEY;

// The entitlement identifier configured in the RevenueCat dashboard. A customer
// holding this is Pro, regardless of which package (monthly/annual) they bought.
export const PRO_ENTITLEMENT_ID = 'pro';

let configuredFor: string | null = null;

// ── Local entitlement store ──────────────────────────────────────────────────
//
// The RevenueCat webhook is the authoritative writer of users/{uid}.consumerTier
// (clients can't be trusted with it — see firestore.rules), but it lands a
// second or two after payment. That lag is very visible right after someone
// pays. So the SDK's own entitlement is mirrored here for INSTANT unlock, and
// Firestore catches up behind it.
//
// A module-level store + useSyncExternalStore avoids adding another provider
// around the app; useConsumerSubscription subscribes to it directly.

let proEntitlementActive = false;
const listeners = new Set<() => void>();

export function subscribeToEntitlement(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getEntitlementSnapshot(): boolean {
  return proEntitlementActive;
}

function setEntitlement(active: boolean): void {
  if (proEntitlementActive === active) return;
  proEntitlementActive = active;
  listeners.forEach((listener) => listener());
}

/**
 * Configures the SDK for a signed-in user. `appUserID` is the Firebase uid —
 * that binding is what lets the RevenueCat webhook map a purchase back to
 * users/{uid} and set consumerTier server-side. Safe to call repeatedly.
 */
export function initPurchases(uid: string): void {
  if (!purchasesSupported || !purchasesModule || configuredFor === uid) return;
  try {
    purchasesModule.default.configure({ apiKey: API_KEY!, appUserID: uid });
    configuredFor = uid;
    // Seed the entitlement so a returning subscriber is Pro immediately on
    // launch, without waiting for a Firestore round-trip.
    void hasProEntitlement();
  } catch (error) {
    console.warn('[purchasesModule] configure failed:', error);
  }
}

/** Clears cached user state on sign-out so the next user starts clean. */
export function resetPurchasesUser(): void {
  configuredFor = null;
  setEntitlement(false);
}

/**
 * The packages on the current offering (monthly + annual), or [] when purchases
 * are unavailable. Prices are NEVER hardcoded in the app — the paywall renders
 * `pkg.product.priceString` so currency and localization follow Play.
 */
export async function getProPackages(): Promise<PurchasesPackage[]> {
  if (!purchasesSupported || !purchasesModule) return [];
  try {
    const offerings = await purchasesModule.default.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (error) {
    console.warn('[purchasesModule] getOfferings failed:', error);
    return [];
  }
}

export type PurchaseOutcome =
  | { status: 'purchased' }
  | { status: 'cancelled' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/**
 * Buys a package. A user backing out is NOT an error — it's the most common
 * outcome on a paywall and must not surface as a scary alert, so it gets its
 * own status.
 */
export async function purchaseProPackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!purchasesSupported || !purchasesModule) return { status: 'unavailable' };
  try {
    const result = await purchasesModule.default.purchasePackage(pkg);
    const active = isProActive(result.customerInfo);
    setEntitlement(active);
    return active
      ? { status: 'purchased' }
      : { status: 'error', message: 'Purchase completed but Pro is not active yet.' };
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) return { status: 'cancelled' };
    const message =
      (error as { message?: string }).message ?? 'Could not complete the purchase.';
    console.warn('[purchasesModule] purchase failed:', error);
    return { status: 'error', message };
  }
}

/** Play requires a visible restore path (reinstalls, new devices). */
export async function restoreProPurchases(): Promise<boolean> {
  if (!purchasesSupported || !purchasesModule) return false;
  try {
    const active = isProActive(await purchasesModule.default.restorePurchases());
    setEntitlement(active);
    return active;
  } catch (error) {
    console.warn('[purchasesModule] restore failed:', error);
    return false;
  }
}

/** Current entitlement straight from the SDK's cache — used for instant unlock. */
export async function hasProEntitlement(): Promise<boolean> {
  if (!purchasesSupported || !purchasesModule) return false;
  try {
    const active = isProActive(await purchasesModule.default.getCustomerInfo());
    setEntitlement(active);
    return active;
  } catch {
    return false;
  }
}

function isProActive(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[PRO_ENTITLEMENT_ID];
}
