// freshStartVenues.js — wipe ALL venue cards for a clean slate.
//
// ⚠️  DESTRUCTIVE. Deletes EVERY document in the `venues` collection (both your
//     test-business venues AND the dev sample venues) plus each venue's
//     subcollections (analytics / reservations / staff). Optionally also clears
//     the districtVenues stub cache so the next refresh re-collects fresh
//     Foursquare cards.
//
// ── Where to run it ─────────────────────────────────────────────────────────
// Uses the Firebase Admin SDK, so run it from the Creator WEBAPP repo (which
// has `firebase-admin` installed) — this mobile repo uses the JS SDK and has no
// admin package. Point GOOGLE_APPLICATION_CREDENTIALS at a service-account key
// (Windows path with forward slashes, e.g. C:/Users/... — NOT Git Bash /c/...):
//
//    export GOOGLE_APPLICATION_CREDENTIALS="C:/Users/humai/keys/barhop-admin.json"
//    node freshStartVenues.js                        # DRY RUN — lists, deletes nothing
//    node freshStartVenues.js --confirm              # delete all venues
//    node freshStartVenues.js --confirm --clear-cache  # + wipe stub cache
//
// After a --clear-cache run, force-run refreshDistrictVenues to repopulate the
// auto-created cards. Then rebuild your real venues in the webapp as needed.

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const CLEAR_CACHE = args.includes('--clear-cache');

async function main() {
  const venues = await db.collection('venues').get();
  console.log(`Found ${venues.size} document(s) in 'venues'.`);

  // DRY RUN by default — a wipe this total should never happen by a stray Enter.
  if (!CONFIRM) {
    venues.docs.slice(0, 50).forEach((d) => {
      const v = d.data();
      console.log(`  - ${d.id}  "${v.name ?? '(no name)'}"  placeId=${v.placeId ?? ''}`);
    });
    if (venues.size > 50) console.log(`  … and ${venues.size - 50} more`);
    console.log('\nDRY RUN — nothing deleted. Re-run with --confirm to delete.');
    if (CLEAR_CACHE) console.log('(--clear-cache would also wipe districtVenues.)');
    return;
  }

  // recursiveDelete removes each venue doc AND its subcollections in one call.
  let deleted = 0;
  for (const doc of venues.docs) {
    await db.recursiveDelete(doc.ref);
    deleted += 1;
    if (deleted % 20 === 0) console.log(`  …deleted ${deleted}/${venues.size}`);
  }
  console.log(`Deleted ${deleted} venue(s) and their subcollections.`);

  if (CLEAR_CACHE) {
    const stubs = await db.collection('districtVenues').get();
    for (const doc of stubs.docs) await doc.ref.delete();
    console.log(
      `Cleared ${stubs.size} district snapshot(s). ` +
        'Force-run refreshDistrictVenues to re-collect fresh cards.'
    );
  }

  console.log('\n✅ Fresh start complete.');
}

main().catch((err) => {
  console.error('freshStartVenues failed:', err);
  process.exit(1);
});
