// Voucher code redemption.
//
// Redemption runs ENTIRELY server-side in the `redeemVoucher` callable Cloud
// Function. The client only submits a string and renders the answer — it never
// reads the voucher collection and never writes the grant. That's deliberate:
//
//   * Firestore rules deny clients all access to voucherCodes. If the app could
//     read them, anyone could dump the collection and redeem every code.
//   * users/{uid}.proGrantExpiresAt is server-written for the same reason
//     consumerTier is — a client that can set its own grant gets Pro for free.
//
// The function does validation, one-time-use enforcement and the grant write
// inside a single transaction, so two devices racing the same code can't both
// win.

import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions } from '../firebase/config';

export interface RedeemSuccess {
  ok: true;
  monthsGranted: number;
  expiresAt: string; // ISO — when the granted Pro access ends
}

export interface RedeemFailure {
  ok: false;
  /** Machine-readable so the UI can phrase each case without string matching. */
  reason:
    | 'invalid'
    | 'expired'
    | 'exhausted'
    | 'already-redeemed'
    | 'already-subscribed'
    | 'unavailable';
  message: string;
}

export type RedeemResult = RedeemSuccess | RedeemFailure;

// Codes are issued and compared uppercase; users type them in any case, often
// with spaces or dashes from a printed/pasted voucher.
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, '');
}

const FAILURE_MESSAGES: Record<RedeemFailure['reason'], string> = {
  invalid: 'That code isn’t valid. Double-check it and try again.',
  expired: 'That code has expired.',
  exhausted: 'That code has already been fully redeemed.',
  'already-redeemed': 'You’ve already redeemed this code.',
  'already-subscribed': 'You’re already on Pro — save this code for later.',
  unavailable: 'Couldn’t reach the server. Check your connection and try again.',
};

/**
 * Redeems a voucher. Never throws — every outcome comes back as a typed
 * result so the UI has one code path.
 */
export async function redeemVoucher(rawCode: string): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: 'invalid', message: FAILURE_MESSAGES.invalid };

  try {
    const callable = httpsCallable<{ code: string }, RedeemResult>(functions, 'redeemVoucher');
    const response: HttpsCallableResult<RedeemResult> = await callable({ code });
    const result = response.data;

    // Normalize the server's failure reason into user-facing copy here, so the
    // function stays free to return terse machine codes.
    if (!result.ok) {
      return { ...result, message: FAILURE_MESSAGES[result.reason] ?? result.message };
    }
    return result;
  } catch (error) {
    console.warn('[voucherService] redeem failed:', error);
    return { ok: false, reason: 'unavailable', message: FAILURE_MESSAGES.unavailable };
  }
}
