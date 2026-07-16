import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { limitsForTier, tierLabel } from '../hooks/useConsumerSubscription';
import { isVenueMatched, type ConsumerTier, type Squad, type VenueFilters } from '../types';

/**
 * Thrown when a free-tier constraint blocks a squad operation. Callers catch
 * this specifically to raise the ProUpsellModal (never a crash): the Firebase
 * write is aborted BEFORE it happens.
 */
export class SquadLimitError extends Error {
  constructor(
    public readonly code: 'max-squads' | 'squad-full',
    message: string
  ) {
    super(message);
    this.name = 'SquadLimitError';
  }
}

// No I/L/O/0/1 — every character survives being yelled across a loud bar.
const PIN_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PIN_LENGTH = 6;

export function generatePin(): string {
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += PIN_CHARSET[Math.floor(Math.random() * PIN_CHARSET.length)];
  }
  return pin;
}

/** How many active squads the user currently belongs to (any role). */
export async function countActiveSquads(userId: string): Promise<number> {
  const snapshot = await getDocs(
    query(
      collection(db, 'squads'),
      where('members', 'array-contains', userId),
      where('isActive', '==', true)
    )
  );
  return snapshot.size;
}

/**
 * Creates a squad with the caller as host and sole member. Free tier: aborts
 * (throws SquadLimitError, no Firestore write) when the user is already in
 * their maximum number of active squads. The squad inherits the host's tier,
 * which governs its member capacity for joiners.
 */
export async function createSquad(
  userId: string,
  displayName: string,
  tier: ConsumerTier = 'free'
): Promise<{ squadId: string; pin: string }> {
  const { maxSquads } = limitsForTier(tier);
  if (Number.isFinite(maxSquads)) {
    const activeCount = await countActiveSquads(userId);
    if (activeCount >= maxSquads) {
      throw new SquadLimitError(
        'max-squads',
        `${tierLabel(tier)} accounts can be in ${maxSquads} active squads at a time.`
      );
    }
  }

  const pin = generatePin();
  const ref = await addDoc(collection(db, 'squads'), {
    pin,
    hostId: userId,
    members: [userId],
    memberNames: { [userId]: displayName },
    isActive: true,
    likes: {},
    tier,
    createdAt: serverTimestamp(),
  });
  return { squadId: ref.id, pin };
}

/**
 * Joins an active squad by PIN. Runs as a TRANSACTION so the member-capacity
 * check and the write are atomic — two friends tapping Join at the same
 * moment can't push a free squad past its cap. Throws SquadLimitError
 * (write aborted) when the squad is full, or a plain Error for a bad PIN.
 */
export async function joinSquad(
  userId: string,
  displayName: string,
  pin: string,
  joinerTier: ConsumerTier = 'free'
): Promise<string> {
  const normalized = pin.trim().toUpperCase();
  const snapshot = await getDocs(
    query(
      collection(db, 'squads'),
      where('pin', '==', normalized),
      where('isActive', '==', true),
      limit(1)
    )
  );
  const match = snapshot.docs[0];
  if (!match) {
    throw new Error('No active squad found for that PIN. Double-check it with your host.');
  }

  // Re-joining a squad you're already in never counts against limits.
  const alreadyMember = (match.data() as Squad).members.includes(userId);
  if (!alreadyMember) {
    const { maxSquads } = limitsForTier(joinerTier);
    if (Number.isFinite(maxSquads) && (await countActiveSquads(userId)) >= maxSquads) {
      throw new SquadLimitError(
        'max-squads',
        `${tierLabel(joinerTier)} accounts can be in ${maxSquads} active squads at a time.`
      );
    }
  }

  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(match.ref);
    if (!fresh.exists() || fresh.data().isActive !== true) {
      throw new Error('That squad just ended. Ask your host for a new PIN.');
    }
    const squad = fresh.data() as Squad;
    if (squad.members.includes(userId)) return; // already in — no-op

    // Capacity follows the SQUAD's tier (set from its host at creation).
    const { maxMembersPerSquad } = limitsForTier(squad.tier);
    if (squad.members.length >= maxMembersPerSquad) {
      throw new SquadLimitError(
        'squad-full',
        `${tierLabel(squad.tier)} squads hold ${maxMembersPerSquad} members.`
      );
    }

    tx.update(match.ref, {
      members: [...squad.members, userId],
      [`memberNames.${userId}`]: displayName,
    });
  });
  return match.id;
}

/** Real-time squad listener — the lobby and match detection both hang off this. */
export function listenToSquad(
  squadId: string,
  callback: (squad: Squad | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'squads', squadId),
    (snapshot) => callback(snapshot.exists() ? (snapshot.data() as Squad) : null),
    (error) => {
      console.warn('[squadService] squad listener error:', error);
      callback(null);
    }
  );
}

/**
 * Host leaving ends the squad for everyone (isActive: false); a member leaving
 * just removes themselves. Members' listeners react either way.
 */
export async function leaveSquad(
  squadId: string,
  userId: string,
  isHost: boolean
): Promise<void> {
  const ref = doc(db, 'squads', squadId);
  if (isHost) {
    await updateDoc(ref, { isActive: false });
  } else {
    await updateDoc(ref, {
      members: arrayRemove(userId),
      [`memberNames.${userId}`]: deleteField(),
    });
  }
}

/**
 * Host-set deck filters, shared with every member through the live listener
 * (decks must stay identical for consensus). Host-only is enforced in the UI;
 * server-side enforcement rides the squads update rule (MVP posture).
 */
export async function updateSquadFilters(
  squadId: string,
  filters: VenueFilters
): Promise<void> {
  await updateDoc(doc(db, 'squads', squadId), { filters });
}

/**
 * Pro Rewind: removes the user's right-swipe from the squad's likes map so a
 * rewound card can't produce a phantom consensus match.
 */
export async function removeSquadLike(
  squadId: string,
  venueId: string,
  userId: string
): Promise<void> {
  await updateDoc(doc(db, 'squads', squadId), {
    [`likes.${venueId}`]: arrayRemove(userId),
  });
}

/**
 * Records a right-swipe for the squad and reports whether it completed
 * consensus. The returned flag serves the swiper's immediate UI; the
 * authoritative match signal for ALL members is the live listener, which sees
 * the same likes map update.
 */
export async function recordSquadSwipe(
  squadId: string,
  venueId: string,
  userId: string
): Promise<{ isMatch: boolean }> {
  const ref = doc(db, 'squads', squadId);
  await updateDoc(ref, { [`likes.${venueId}`]: arrayUnion(userId) });

  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return { isMatch: false };
  return { isMatch: isVenueMatched(snapshot.data() as Squad, venueId) };
}
