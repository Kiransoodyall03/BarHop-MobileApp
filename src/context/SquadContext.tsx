import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import {
  createSquad as createSquadDoc,
  joinSquad as joinSquadByPin,
  leaveSquad as leaveSquadDoc,
  listenToMySquads,
  listenToSquad,
} from '../services/squadService';
import { isVenueMatched, type Squad, type SquadWithId } from '../types';

// Which squad the user is currently swiping with.
//
// ⚠️ INVARIANT: absent key ⇒ SOLO, deliberately. A user can belong to several
// squads and still choose to swipe alone, so "no stored ID" is a real choice,
// not missing data. Never fall back to mySquads[0] to be helpful — that would
// silently drag someone back into a squad they opted out of on every restart.
const STORAGE_KEY = 'barhop.activeSquadId';

interface SquadContextValue {
  squadId: string | null;
  squad: Squad | null;
  /** Every active squad the user belongs to — drives the switcher. */
  mySquads: SquadWithId[];
  /** True while restoring the persisted choice / loading the squad list. */
  restoring: boolean;
  isInSquad: boolean;
  isHost: boolean;
  /** Venue IDs the whole squad right-swiped — drives the match modal. */
  matchedVenueIds: string[];
  create: () => Promise<string>; // resolves with the PIN
  join: (pin: string) => Promise<void>;
  /** Swipe with a squad, or pass null to swipe solo. */
  switchTo: (id: string | null) => void;
  /** Defaults to the active squad; pass an ID to leave a different one. */
  leave: (targetId?: string) => Promise<void>;
}

const SquadContext = createContext<SquadContextValue>({
  squadId: null,
  squad: null,
  mySquads: [],
  restoring: true,
  isInSquad: false,
  isHost: false,
  matchedVenueIds: [],
  create: async () => '',
  join: async () => {},
  switchTo: () => {},
  leave: async () => {},
});

export function SquadProvider({ children }: PropsWithChildren) {
  const { user, profile } = useAuth();
  const [squadId, setSquadId] = useState<string | null>(null);
  const [mySquads, setMySquads] = useState<SquadWithId[]>([]);
  const [squadsLoaded, setSquadsLoaded] = useState(false);
  const [storageRestoring, setStorageRestoring] = useState(true);
  // Set when the list query fails (a missing composite index can only be
  // deployed from the webapp repo). Falls back to the single-doc listener so
  // squads keep working with the switcher degraded to a no-op.
  const [listenerFailed, setListenerFailed] = useState(false);
  const [fallbackSquad, setFallbackSquad] = useState<Squad | null>(null);

  const displayName =
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    user?.displayName ||
    user?.email ||
    'BarHop user';

  const persistSquadId = useCallback((id: string | null) => {
    setSquadId(id);
    if (id) {
      AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  }, []);

  // Restore the persisted choice once the session is known. See the INVARIANT
  // on STORAGE_KEY: no stored ID means solo, and must stay meaning solo.
  useEffect(() => {
    if (!user) {
      setSquadId(null);
      setMySquads([]);
      setSquadsLoaded(false);
      setStorageRestoring(false);
      return;
    }
    setStorageRestoring(true);
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setSquadId(stored);
      })
      .catch(() => {})
      .finally(() => setStorageRestoring(false));
  }, [user]);

  // ONE listener over every squad the user belongs to. The active squad is
  // derived from it, so a squad that ends or drops the user simply falls out of
  // the result set — self-healing comes free.
  useEffect(() => {
    if (!user) return;
    setListenerFailed(false);
    const unsubscribe = listenToMySquads(
      user.uid,
      (squads) => {
        setMySquads(squads);
        setSquadsLoaded(true);
      },
      () => setListenerFailed(true)
    );
    return unsubscribe;
  }, [user]);

  // Degraded path: list query unavailable, so watch just the active squad.
  useEffect(() => {
    if (!listenerFailed || !squadId || !user) {
      setFallbackSquad(null);
      return;
    }
    return listenToSquad(squadId, setFallbackSquad);
  }, [listenerFailed, squadId, user]);

  const squad = useMemo<Squad | null>(() => {
    if (listenerFailed) return fallbackSquad;
    return mySquads.find((s) => s.id === squadId) ?? null;
  }, [listenerFailed, fallbackSquad, mySquads, squadId]);

  // Self-heal a stale stored ID — but ONLY once the list has actually arrived.
  // Running before the first snapshot would clear the restored ID during the
  // moment mySquads is still [], i.e. on every single cold start.
  const clearedStaleRef = useRef(false);
  useEffect(() => {
    if (!squadsLoaded || listenerFailed || !squadId) return;
    if (mySquads.some((s) => s.id === squadId)) {
      clearedStaleRef.current = false;
      return;
    }
    if (clearedStaleRef.current) return;
    clearedStaleRef.current = true;
    persistSquadId(null);
  }, [squadsLoaded, listenerFailed, squadId, mySquads, persistSquadId]);

  // Tier gates live in squadService (SquadLimitError) — callers catch it to
  // raise the upsell modal. The tier rides along from the live profile.
  const consumerTier = profile?.consumerTier ?? 'free';
  const location = profile?.location ?? null;

  const create = useCallback(async () => {
    if (!user) throw new Error('Not signed in');
    const { squadId: newId, pin } = await createSquadDoc(
      user.uid,
      displayName,
      consumerTier,
      location
    );
    persistSquadId(newId);
    return pin;
  }, [user, displayName, consumerTier, location, persistSquadId]);

  const join = useCallback(
    async (pin: string) => {
      if (!user) throw new Error('Not signed in');
      const joinedId = await joinSquadByPin(
        user.uid,
        displayName,
        pin,
        consumerTier,
        location
      );
      persistSquadId(joinedId);
    },
    [user, displayName, consumerTier, location, persistSquadId]
  );

  const switchTo = useCallback(
    (id: string | null) => {
      // Ignore IDs we don't actually belong to; null is always valid (solo).
      if (id !== null && !mySquads.some((s) => s.id === id)) return;
      persistSquadId(id);
    },
    [mySquads, persistSquadId]
  );

  const leave = useCallback(
    async (targetId?: string) => {
      if (!user) return;
      const id = targetId ?? squadId;
      if (!id) return;
      // Resolve from the LIST, not from `squad` — leaving a squad you aren't
      // currently swiping with has to work too.
      const target = mySquads.find((s) => s.id === id) ?? (id === squadId ? squad : null);
      if (!target) return;

      const wasHost = target.hostId === user.uid;
      // Only drop back to solo if we're leaving the squad we're swiping with.
      if (id === squadId) persistSquadId(null);
      try {
        await leaveSquadDoc(id, user.uid, wasHost);
      } catch (error) {
        console.warn('[SquadContext] leave failed:', error);
      }
    },
    [user, squadId, squad, mySquads, persistSquadId]
  );

  const matchedVenueIds = useMemo(() => {
    if (!squad?.likes) return [];
    return Object.keys(squad.likes).filter((venueId) => isVenueMatched(squad, venueId));
  }, [squad]);

  const value = useMemo<SquadContextValue>(
    () => ({
      squadId,
      squad,
      mySquads,
      // Squad-dependent screens must not paint until we know both the stored
      // choice AND the list, or they flash the "no squad" hero on every launch.
      restoring: storageRestoring || (!!user && !squadsLoaded && !listenerFailed),
      isInSquad: !!squad,
      isHost: !!squad && !!user && squad.hostId === user.uid,
      matchedVenueIds,
      create,
      join,
      switchTo,
      leave,
    }),
    [
      squadId,
      squad,
      mySquads,
      storageRestoring,
      squadsLoaded,
      listenerFailed,
      user,
      matchedVenueIds,
      create,
      join,
      switchTo,
      leave,
    ]
  );

  return <SquadContext.Provider value={value}>{children}</SquadContext.Provider>;
}

export function useSquad(): SquadContextValue {
  return useContext(SquadContext);
}
