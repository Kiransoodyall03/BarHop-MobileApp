/**
 * Turns a Firebase error into something that names the ACTUAL failure.
 *
 * Written after a real incident: every catch block in the friends and avatar
 * flows said "check your connection", so an unpublished security rule looked
 * exactly like a dead network and cost an afternoon of debugging the wrong
 * layer. A wrong diagnosis is worse than a vague one — if we can't identify
 * the error, say so plainly rather than blaming the network.
 */
export function describeFirebaseError(error: unknown, fallback: string): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    // ── Firestore ──────────────────────────────────────────────────────────
    case 'permission-denied':
      return __DEV__
        ? 'Permission denied by Firestore rules. The friendCodes / friendships / userLikes rules are probably not published yet.'
        : "You don't have access to do that right now. Please try again later.";
    case 'failed-precondition':
      return __DEV__
        ? 'Firestore needs an index for this query — check the console log for the creation link.'
        : 'Something needs setting up on our side. Please try again later.';
    case 'unauthenticated':
      return 'Your session expired. Sign out and back in, then try again.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Could not reach BarHop. Check your connection and try again.';
    case 'not-found':
      return 'That could not be found.';
    case 'already-exists':
      return 'That already exists.';

    // ── Storage ────────────────────────────────────────────────────────────
    case 'storage/unauthorized':
      return __DEV__
        ? 'Storage rules rejected the upload. Publish storage.rules to the bucket.'
        : "You don't have permission to upload that.";
    case 'storage/unauthenticated':
      return 'Your session expired. Sign out and back in, then try again.';
    case 'storage/bucket-not-found':
    case 'storage/project-not-found':
      return __DEV__
        ? 'Firebase Storage is not enabled for this project — turn it on in the console (Storage → Get started).'
        : 'Uploads are unavailable right now. Please try again later.';
    case 'storage/quota-exceeded':
      return 'Storage is full. Please try again later.';
    case 'storage/retry-limit-exceeded':
      return 'The upload kept failing. Check your connection and try again.';
    case 'storage/canceled':
      return 'Upload cancelled.';

    default:
      // Surface the raw code in dev rather than swallowing it — an unmapped
      // code is exactly what we most want to see while building.
      return code && __DEV__ ? `${fallback} (${code})` : fallback;
  }
}
