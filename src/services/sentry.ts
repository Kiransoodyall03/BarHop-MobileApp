// Crash + error reporting (Sentry).
//
// Entirely no-op until EXPO_PUBLIC_SENTRY_DSN is set: create a project at
// sentry.io, paste the DSN into .env, `eas env:push`. Until then the app runs
// identically — nothing initializes, nothing wraps. This mirrors how ads and
// purchases degrade, so a missing/broken DSN can never itself crash launch.

import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** True only when a DSN is configured — gates both init and the wrap below. */
export const sentryEnabled = !!SENTRY_DSN;

export { Sentry };

/**
 * Initializes reporting. Call once, as early as possible, so a crash during
 * startup is still captured. Guarded so a bad DSN or an absent native module
 * (Expo Go) degrades silently instead of taking the app down.
 */
export function initSentry(): void {
  if (!sentryEnabled) return;
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      // Lets you separate dev noise from real user crashes in the dashboard.
      environment: __DEV__ ? 'development' : 'production',
      // Crash + error reporting only — no performance tracing, to keep runtime
      // overhead and quota usage minimal. Raise if you later want perf data.
      tracesSampleRate: 0,
      // No PII (emails, IPs) attached — keeps user data out of crash payloads
      // and clear of the Play data-safety declarations.
      sendDefaultPii: false,
    });
  } catch (error) {
    console.warn('[sentry] init failed:', error);
  }
}
