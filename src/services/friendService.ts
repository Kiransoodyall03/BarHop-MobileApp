import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { updateProfile } from './profileService';
import {
  friendshipIdFor,
  type ConsumerProfile,
  type FriendProfileSnapshot,
  type Friendship,
  type FriendshipWithId,
  type UserLikes,
} from '../types';

/**
 * Thrown for the expected, user-facing failures of the add-friend flow, so
 * callers can show the message directly instead of a generic error.
 */
export class FriendRequestError extends Error {
  constructor(
    public readonly code:
      | 'not-found'
      | 'self'
      | 'already-friends'
      | 'already-pending',
    message: string
  ) {
    super(message);
    this.name = 'FriendRequestError';
  }
}

// Same charset as the squad PIN: no I/L/O/0/1, so a code survives being read
// aloud in a loud bar or typed off a screenshot.
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  }
  return code;
}

/**
 * The user's shareable friend code, generating and persisting one on first
 * call. Retries on collision — friendCodes/{code} is created with a
 * transaction that fails if the document already exists.
 */
export async function ensureFriendCode(
  uid: string,
  existing?: string | null
): Promise<string> {
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = doc(db, 'friendCodes', code);
    try {
      await runTransaction(db, async (tx) => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists()) throw new Error('collision');
        tx.set(ref, { uid, createdAt: serverTimestamp() });
      });
      await updateProfile(uid, { friendCode: code });
      return code;
    } catch (error) {
      if ((error as Error).message !== 'collision') throw error;
      // Collision — loop and try another code.
    }
  }
  throw new Error('Could not generate a friend code. Please try again.');
}

/** Resolves a shared code to a uid. Codes are normalized to uppercase. */
export async function lookupFriendCode(code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const snapshot = await getDoc(doc(db, 'friendCodes', normalized));
  return snapshot.exists() ? (snapshot.data().uid as string) : null;
}

/** The denormalized snapshot stored on the friendship doc for one user. */
export function snapshotOf(
  profile: ConsumerProfile | null,
  fallbackName = 'BarHop user'
): FriendProfileSnapshot {
  const displayName =
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    fallbackName;
  return {
    displayName,
    photoURL: profile?.photoURL ?? null,
    expoPushToken: profile?.expoPushToken ?? null,
  };
}

/**
 * Sends a friend request by code. The document ID is derived from the two
 * uids, so a request that already exists in either direction is detected
 * without a query — and two people requesting each other simultaneously
 * converge on the same document rather than creating two.
 */
export async function sendFriendRequest(
  myUid: string,
  code: string,
  mySnapshot: FriendProfileSnapshot
): Promise<{ friendUid: string }> {
  const friendUid = await lookupFriendCode(code);
  if (!friendUid) {
    throw new FriendRequestError(
      'not-found',
      "That code doesn't match anyone. Double-check it with your friend."
    );
  }
  if (friendUid === myUid) {
    throw new FriendRequestError('self', "That's your own code!");
  }

  const pairId = friendshipIdFor(myUid, friendUid);
  const ref = doc(db, 'friendships', pairId);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) {
      const friendship = existing.data() as Friendship;
      if (friendship.status === 'accepted') {
        throw new FriendRequestError(
          'already-friends',
          "You're already friends with them."
        );
      }
      // They requested us first — treat this as an accept so the two requests
      // don't deadlock as mutually pending.
      if (friendship.requestedBy === friendUid) {
        tx.update(ref, {
          status: 'accepted',
          [`profiles.${myUid}`]: mySnapshot,
          updatedAt: serverTimestamp(),
        });
        return;
      }
      throw new FriendRequestError(
        'already-pending',
        'You already sent them a request — waiting on them to accept.'
      );
    }

    tx.set(ref, {
      users: [myUid, friendUid],
      status: 'pending',
      requestedBy: myUid,
      profiles: { [myUid]: mySnapshot },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return { friendUid };
}

/** Accepts an inbound request, adding our own denormalized snapshot. */
export async function acceptFriendRequest(
  pairId: string,
  myUid: string,
  mySnapshot: FriendProfileSnapshot
): Promise<void> {
  await updateDoc(doc(db, 'friendships', pairId), {
    status: 'accepted',
    [`profiles.${myUid}`]: mySnapshot,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Declines a pending request or removes an existing friend. Both delete the
 * document: there is no "was friends" state worth keeping, and deleting also
 * revokes the userLikes read permission immediately (the rule checks for an
 * accepted friendship doc).
 */
export async function removeFriendship(pairId: string): Promise<void> {
  await deleteDoc(doc(db, 'friendships', pairId));
}

/** Live list of every friendship this user is part of, pending or accepted. */
export function listenToMyFriendships(
  uid: string,
  onChange: (friendships: FriendshipWithId[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'friendships'), where('users', 'array-contains', uid)),
    (snapshot) => {
      onChange(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Friendship) })));
    },
    (error) => {
      console.warn('[friendService] friendship listener failed:', error);
      onError?.(error);
    }
  );
}

/**
 * Keeps our denormalized snapshot fresh on every friendship we're part of.
 * Called when the display name / photo / push token changes — the same
 * fan-out-on-rare-change tradeoff squad member photos already make.
 */
export async function propagateSnapshotToFriendships(
  friendships: FriendshipWithId[],
  myUid: string,
  snapshot: FriendProfileSnapshot
): Promise<void> {
  await Promise.all(
    friendships.map((friendship) =>
      updateDoc(doc(db, 'friendships', friendship.id), {
        [`profiles.${myUid}`]: snapshot,
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        console.warn('[friendService] snapshot propagation failed:', error);
      })
    )
  );
}

// ── Shared likes ────────────────────────────────────────────────────────────

/** Live view of a friend's shared likes. Denied unless the friendship is accepted. */
export function listenToUserLikes(
  uid: string,
  callback: (venueIds: string[]) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'userLikes', uid),
    (snapshot) => {
      callback(snapshot.exists() ? ((snapshot.data() as UserLikes).venueIds ?? []) : []);
    },
    (error) => {
      // A permission-denied here is normal and transient: the friendship may
      // have just been removed, or the listener raced the accept write.
      console.warn('[friendService] likes listener failed:', error);
      callback([]);
    }
  );
}

/**
 * Adds/removes a venue from the user's shared likes. Callers MUST check
 * socialDiscoveryEnabled first — see recordSwipe in swipeService.
 */
export async function setSharedLike(
  uid: string,
  venueId: string,
  liked: boolean
): Promise<void> {
  await setDoc(
    doc(db, 'userLikes', uid),
    {
      venueIds: liked ? arrayUnion(venueId) : arrayRemove(venueId),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Clears everything shared — used when social discovery is switched off. */
export async function clearSharedLikes(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'userLikes', uid));
}
