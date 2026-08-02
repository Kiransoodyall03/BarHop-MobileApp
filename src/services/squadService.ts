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
import { resolveDistrictIds } from './districtService';
import { limitsForTier, tierLabel } from '../hooks/useConsumerSubscription';
import {
  isVenueMatched,
  type ConsumerTier,
  type Squad,
  type SquadWithId,
  type StoredLocation,
  type VenueFilters,
} from '../types';

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

/**
 * Every active squad the user belongs to. ONE query shape, shared by the count,
 * the list and the live listener — it is backed by a composite index that only
 * the webapp repo can deploy, so introducing a second shape would silently fail
 * in production with failed-precondition.
 */
function activeSquadsQuery(userId: string) {
  return query(
    collection(db, 'squads'),
    where('members', 'array-contains', userId),
    where('isActive', '==', true)
  );
}

/** How many active squads the user currently belongs to (any role). */
export async function countActiveSquads(userId: string): Promise<number> {
  const snapshot = await getDocs(activeSquadsQuery(userId));
  return snapshot.size;
}

/**
 * Newest first. A squad created moments ago still has an unresolved
 * serverTimestamp() locally, so it sorts as newest rather than oldest —
 * otherwise the squad you just made appears at the bottom of the picker.
 */
function byNewest(a: SquadWithId, b: SquadWithId): number {
  const ms = (value: Squad['createdAt']): number => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && 'seconds' in value) return value.seconds * 1000;
    return Number.MAX_SAFE_INTEGER;
  };
  return ms(b.createdAt) - ms(a.createdAt);
}

/** Live list of the user's active squads — drives the solo/squad switcher. */
export function listenToMySquads(
  userId: string,
  onChange: (squads: SquadWithId[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    activeSquadsQuery(userId),
    (snapshot) => {
      onChange(
        snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Squad) })).sort(byNewest)
      );
    },
    (error) => {
      console.warn('[squadService] squad list listener failed:', error);
      onError?.(error);
    }
  );
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
  tier: ConsumerTier = 'free',
  location?: StoredLocation | null,
  photoURL?: string | null
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

  // Seeds the shared deck with the host's districts; joiners union theirs in.
  // A host with no stored location just seeds nothing — the squad still works,
  // it simply shows published venues until someone with a location joins.
  const districtIds = await safeResolveDistrictIds(location);

  const pin = generatePin();
  const ref = await addDoc(collection(db, 'squads'), {
    pin,
    hostId: userId,
    members: [userId],
    memberNames: { [userId]: displayName },
    ...(photoURL ? { memberPhotos: { [userId]: photoURL } } : {}),
    isActive: true,
    likes: {},
    tier,
    deckDistrictIds: districtIds,
    createdAt: serverTimestamp(),
  });
  return { squadId: ref.id, pin };
}

/**
 * District IDs for a location, or [] for any failure. Never throws: a squad
 * must still be creatable/joinable when the district index is unreachable.
 */
async function safeResolveDistrictIds(location?: StoredLocation | null): Promise<string[]> {
  if (!location) return [];
  try {
    return await resolveDistrictIds(location);
  } catch (error) {
    console.warn('[squadService] district resolve failed:', error);
    return [];
  }
}

/**
 * Adds the caller's districts to the squad's shared deck if they aren't already
 * there. Called on deck load, which is what backfills squads created before
 * deckDistrictIds existed and picks up a member who has since moved.
 *
 * The subset check is local and free, so the steady state is zero writes.
 */
export async function ensureDeckDistricts(
  squadId: string,
  existing: string[] | undefined,
  location?: StoredLocation | null
): Promise<void> {
  const mine = await safeResolveDistrictIds(location);
  if (!mine.length) return;

  const known = new Set(existing ?? []);
  const missing = mine.filter((id) => !known.has(id));
  if (!missing.length) return;

  try {
    await updateDoc(doc(db, 'squads', squadId), {
      deckDistrictIds: arrayUnion(...missing),
    });
  } catch (error) {
    // Non-fatal: the deck still renders from whatever is already on the doc.
    console.warn('[squadService] deck district backfill failed:', error);
  }
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
  joinerTier: ConsumerTier = 'free',
  location?: StoredLocation | null,
  photoURL?: string | null
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

  // Resolved BEFORE the transaction: a transaction body can retry, and doing
  // network work inside one multiplies those retries.
  const joinerDistrictIds = await safeResolveDistrictIds(location);

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
      ...(photoURL ? { [`memberPhotos.${userId}`]: photoURL } : {}),
      // The joiner's districts widen the shared deck for EVERYONE — that is the
      // point: a squad's deck is the union of its members' local stacks.
      // arrayUnion rather than a computed array so concurrent joins can't clobber
      // each other's contributions.
      ...(joinerDistrictIds.length
        ? { deckDistrictIds: arrayUnion(...joinerDistrictIds) }
        : {}),
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
      [`memberPhotos.${userId}`]: deleteField(),
      [`memberLocations.${userId}`]: deleteField(),
    });
  }
}

/** Live-location tick for the ACTIVE squad only — see StoredLocation on Squad. */
export async function updateSquadMemberLocation(
  squadId: string,
  userId: string,
  location: StoredLocation
): Promise<void> {
  await updateDoc(doc(db, 'squads', squadId), {
    [`memberLocations.${userId}`]: location,
  });
}

/** Denormalized avatar for one squad — see propagatePhotoToMySquads for the fan-out. */
export async function updateSquadMemberPhoto(
  squadId: string,
  userId: string,
  photoURL: string | null
): Promise<void> {
  await updateDoc(doc(db, 'squads', squadId), {
    [`memberPhotos.${userId}`]: photoURL ?? deleteField(),
  });
}

/**
 * Fans an avatar change out to every squad the user belongs to (bounded by
 * maxSquads — 3 free / 7 pro — and only fires on the rare "changed my
 * photo" event), so a stale avatar doesn't resurface when a different squad
 * later becomes active.
 */
export async function propagatePhotoToMySquads(
  mySquads: SquadWithId[],
  userId: string,
  photoURL: string
): Promise<void> {
  await Promise.all(
    mySquads.map((squad) => updateSquadMemberPhoto(squad.id, userId, photoURL))
  );
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
