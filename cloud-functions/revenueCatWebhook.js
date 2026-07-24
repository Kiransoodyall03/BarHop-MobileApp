// ─────────────────────────────────────────────────────────────────────────────
// revenueCatWebhook — the ONLY writer of users/{uid}.consumerTier.
//
// ⚠️  THIS FILE DOES NOT DEPLOY FROM THIS REPO. It is staged here because the
//     mobile app defines the Firestore contract it writes. Copy it into the
//     Creator webapp repo's functions/ directory and export it from index.js.
//
//     Deploy SCOPED:
//         firebase deploy --only functions:revenueCatWebhook
//
//     An unscoped `--only functions` DELETES every function the other repo
//     owns — both repos deploy into the same Firebase project.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Consumer Pro is sold through Google Play Billing (Play requires it for in-app
// digital subscriptions — Paystack is the B2B venue flow and is not permitted
// here). RevenueCat validates the Play receipt and calls this webhook, which
// mirrors the entitlement onto users/{uid}.consumerTier.
//
// The mobile app READS consumerTier and gates ads, unlimited swipes, Pro
// filters, squad size and itinerary length on it. Firestore rules forbid
// clients from writing that field (see tierUnchanged() in firestore.rules) —
// otherwise anyone could self-grant Pro. The Admin SDK used here bypasses
// rules, so this function remains the single source of truth.
//
// The binding that makes this work: the app calls Purchases.configure({
// appUserID: <firebase uid> }), so RevenueCat's app_user_id IS the Firebase uid.
// ─────────────────────────────────────────────────────────────────────────────

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// Set this to the same value as the Authorization header configured in
// RevenueCat → Project settings → Webhooks.
const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET');

// Events that mean "this user currently has Pro".
const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'TRIAL_STARTED',
  'TRIAL_CONVERTED',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);

// Events that mean access has actually ENDED. Note CANCELLATION is deliberately
// NOT here: cancelling only stops renewal, and the user keeps Pro until the
// period expires. Revoking on CANCELLATION would take away access they paid
// for. EXPIRATION is the event that fires when the period actually lapses.
const REVOKING_EVENTS = new Set(['EXPIRATION', 'BILLING_ISSUE', 'REFUND']);

const PRO_ENTITLEMENT_ID = 'pro';

exports.revenueCatWebhook = onRequest(
  { secrets: [REVENUECAT_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify the shared secret. Without this, ANYONE who finds the URL could
    // POST themselves a Pro entitlement — the webhook would become a free
    // upgrade endpoint.
    const expected = `Bearer ${REVENUECAT_WEBHOOK_SECRET.value()}`;
    if (req.get('Authorization') !== expected) {
      logger.warn('revenueCatWebhook: rejected request with bad Authorization header');
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body?.event;
    if (!event?.type) {
      res.status(400).send('Malformed payload');
      return;
    }

    // app_user_id is the Firebase uid (set via Purchases.configure in the app).
    // original_app_user_id is the fallback for aliased/anonymous identities.
    const uid = event.app_user_id || event.original_app_user_id;
    if (!uid) {
      logger.error('revenueCatWebhook: event has no app_user_id', { type: event.type });
      res.status(400).send('Missing app_user_id');
      return;
    }

    // Only react to the Pro entitlement. `entitlement_ids` is absent on some
    // event types, in which case we don't filter it out.
    const entitlements = event.entitlement_ids;
    if (Array.isArray(entitlements) && !entitlements.includes(PRO_ENTITLEMENT_ID)) {
      logger.info(`revenueCatWebhook: ignoring ${event.type} for other entitlements`);
      res.status(200).send('Ignored');
      return;
    }

    let tier;
    if (GRANTING_EVENTS.has(event.type)) tier = 'pro';
    else if (REVOKING_EVENTS.has(event.type)) tier = 'free';
    else {
      // TRANSFER, SUBSCRIBER_ALIAS, TEST etc. — acknowledge so RevenueCat
      // doesn't retry, but change nothing.
      logger.info(`revenueCatWebhook: no tier change for ${event.type}`);
      res.status(200).send('OK');
      return;
    }

    try {
      await admin.firestore().collection('users').doc(uid).set(
        {
          consumerTier: tier,
          // Audit trail — makes billing disputes debuggable.
          consumerTierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          consumerTierSource: `revenuecat:${event.type}`,
        },
        { merge: true }
      );
      logger.info(`revenueCatWebhook: ${uid} → ${tier} (${event.type})`);
      res.status(200).send('OK');
    } catch (error) {
      // 500 makes RevenueCat retry with backoff, which is what we want for a
      // transient Firestore failure — the entitlement must not be silently lost.
      logger.error(`revenueCatWebhook: failed writing ${uid}`, error);
      res.status(500).send('Write failed');
    }
  }
);
