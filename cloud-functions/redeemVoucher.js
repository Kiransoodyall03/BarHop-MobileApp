// ─────────────────────────────────────────────────────────────────────────────
// redeemVoucher — validates a voucher code and grants time-boxed Pro.
//
// ⚠️  THIS FILE DOES NOT DEPLOY FROM THIS REPO. Copy it into the Creator webapp
//     repo's functions/ directory and export it from index.js.
//
//     Deploy SCOPED:
//         firebase deploy --only functions:redeemVoucher
//
//     An unscoped `--only functions` DELETES the other repo's functions.
//
// ── Why this is entirely server-side ────────────────────────────────────────
//
// The client submits a string and renders the answer; it never reads
// voucherCodes and never writes the grant. Firestore rules deny clients ALL
// access to the voucher collections — if the app could read them, anyone could
// dump the collection and redeem every code. And users/{uid}.proGrantExpiresAt
// is server-written for the same reason consumerTier is: a client that can set
// its own grant has Pro for free.
//
// ── Data model ──────────────────────────────────────────────────────────────
//
// voucherCodes/{CODE}          (CODE is uppercase, no spaces/dashes)
//   { months, maxRedemptions, redemptionCount, active, expiresAt?, campaign? }
//
// voucherRedemptions/{CODE}_{uid}
//   { code, uid, redeemedAt, monthsGranted }   ← existence = "already redeemed"
//
// users/{uid}
//   { proGrantExpiresAt, proGrantCode }        ← the grant the app reads
// ─────────────────────────────────────────────────────────────────────────────

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

const MAX_CODE_LENGTH = 32;

exports.redeemVoucher = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    // Anonymous callers can't be granted anything — there's no account to grant to.
    throw new HttpsError('unauthenticated', 'Sign in to redeem a code.');
  }

  // Normalize identically to the client (voucherService.normalizeCode) so a
  // code typed with spaces, dashes or lowercase still matches the stored doc.
  const code = String(request.data?.code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');

  if (!code || code.length > MAX_CODE_LENGTH) {
    return { ok: false, reason: 'invalid', message: 'Invalid code.' };
  }

  const db = admin.firestore();
  const codeRef = db.collection('voucherCodes').doc(code);
  const redemptionRef = db.collection('voucherRedemptions').doc(`${code}_${uid}`);
  const userRef = db.collection('users').doc(uid);

  try {
    // One transaction covers validation, the one-time-use claim and the grant.
    // Without it, two devices submitting the same last-remaining code could
    // both pass the redemptionCount check before either increments it.
    const result = await db.runTransaction(async (tx) => {
      const [codeSnap, redemptionSnap, userSnap] = await Promise.all([
        tx.get(codeRef),
        tx.get(redemptionRef),
        tx.get(userRef),
      ]);

      if (!codeSnap.exists) return { ok: false, reason: 'invalid', message: 'Invalid code.' };
      const voucher = codeSnap.data();

      if (voucher.active === false) {
        return { ok: false, reason: 'invalid', message: 'Invalid code.' };
      }

      // Campaign window (optional) — distinct from the granted Pro period.
      if (voucher.expiresAt && voucher.expiresAt.toMillis() < Date.now()) {
        return { ok: false, reason: 'expired', message: 'Code expired.' };
      }

      if (redemptionSnap.exists) {
        return { ok: false, reason: 'already-redeemed', message: 'Already redeemed.' };
      }

      const used = voucher.redemptionCount ?? 0;
      const max = voucher.maxRedemptions ?? 1;
      if (used >= max) {
        return { ok: false, reason: 'exhausted', message: 'Code fully redeemed.' };
      }

      // Don't let a voucher burn while the user is already paying — they'd get
      // nothing for it. (Chosen behaviour: reject rather than bank the time.)
      const user = userSnap.exists ? userSnap.data() : {};
      if (user.consumerTier === 'pro' || user.consumerTier === 'elite') {
        return { ok: false, reason: 'already-subscribed', message: 'Already subscribed.' };
      }

      const months = Number(voucher.months) > 0 ? Number(voucher.months) : 1;

      // Stack onto any UNEXPIRED existing grant rather than truncating it, so
      // redeeming a second voucher early extends instead of overwriting.
      const existing = user.proGrantExpiresAt?.toMillis?.() ?? 0;
      const base = existing > Date.now() ? new Date(existing) : new Date();
      const expiresAt = new Date(base);
      expiresAt.setMonth(expiresAt.getMonth() + months);

      tx.set(
        userRef,
        {
          proGrantExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          proGrantCode: code,
        },
        { merge: true }
      );

      tx.set(redemptionRef, {
        code,
        uid,
        monthsGranted: months,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(codeRef, {
        redemptionCount: admin.firestore.FieldValue.increment(1),
      });

      return { ok: true, monthsGranted: months, expiresAt: expiresAt.toISOString() };
    });

    logger.info(
      `redeemVoucher: ${uid} / ${code} → ${result.ok ? 'granted' : result.reason}`
    );
    return result;
  } catch (error) {
    logger.error(`redeemVoucher: ${uid} / ${code} failed`, error);
    throw new HttpsError('internal', 'Could not redeem that code right now.');
  }
});
