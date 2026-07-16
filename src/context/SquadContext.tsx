import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import {
  createSquad as createSquadDoc,
  joinSquad as joinSquadByPin,
  leaveSquad as leaveSquadDoc,
  listenToSquad,
} from '../services/squadService';
import { isVenueMatched, type Squad } from '../types';

// Persisted so an app restart drops the user straight back into their squad.
const STORAGE_KEY = 'barhop.activeSquadId';

interface SquadContextValue {
  squadId: string | null;
  squad: Squad | null;
  /** True while restoring the persisted squad on cold start. */
  restoring: boolean;
  isInSquad: boolean;
  isHost: boolean;
  /** Venue IDs the whole squad right-swiped — drives the match modal. */
  matchedVenueIds: string[];
  create: () => Promise<string>; // resolves with the PIN
  join: (pin: string) => Promise<void>;
  leave: () => Promise<void>;
}

const SquadContext = createContext<SquadContextValue>({
  squadId: null,
  squad: null,
  restoring: true,
  isInSquad: false,
  isHost: false,
  matchedVenueIds: [],
  create: async () => '',
  join: async () => {},
  leave: async () => {},
});

export function SquadProvider({ children }: PropsWithChildren) {
  const { user, profile } = useAuth();
  const [squadId, setSquadId] = useState<string | null>(null);
  const [squad, setSquad] = useState<Squad | null>(null);
  const [restoring, setRestoring] = useState(true);

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

  // Restore the persisted squad once the session is known.
  useEffect(() => {
    if (!user) {
      setSquadId(null);
      setSquad(null);
      setRestoring(false);
      return;
    }
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setSquadId(stored);
      })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, [user]);

  // Live listener; self-heals when the squad ends or the user was removed.
  useEffect(() => {
    if (!squadId || !user) {
      setSquad(null);
      return;
    }
    const unsubscribe = listenToSquad(squadId, (nextSquad) => {
      if (!nextSquad || !nextSquad.isActive || !nextSquad.members.includes(user.uid)) {
        setSquad(null);
        persistSquadId(null);
        return;
      }
      setSquad(nextSquad);
    });
    return unsubscribe;
  }, [squadId, user, persistSquadId]);

  // Tier gates live in squadService (SquadLimitError) — callers catch it to
  // raise the upsell modal. The tier rides along from the live profile.
  const consumerTier = profile?.consumerTier ?? 'free';

  const create = useCallback(async () => {
    if (!user) throw new Error('Not signed in');
    const { squadId: newId, pin } = await createSquadDoc(user.uid, displayName, consumerTier);
    persistSquadId(newId);
    return pin;
  }, [user, displayName, consumerTier, persistSquadId]);

  const join = useCallback(
    async (pin: string) => {
      if (!user) throw new Error('Not signed in');
      const joinedId = await joinSquadByPin(user.uid, displayName, pin, consumerTier);
      persistSquadId(joinedId);
    },
    [user, displayName, consumerTier, persistSquadId]
  );

  const leave = useCallback(async () => {
    if (!user || !squadId || !squad) return;
    const wasHost = squad.hostId === user.uid;
    persistSquadId(null);
    setSquad(null);
    try {
      await leaveSquadDoc(squadId, user.uid, wasHost);
    } catch (error) {
      console.warn('[SquadContext] leave failed:', error);
    }
  }, [user, squadId, squad, persistSquadId]);

  const matchedVenueIds = useMemo(() => {
    if (!squad?.likes) return [];
    return Object.keys(squad.likes).filter((venueId) => isVenueMatched(squad, venueId));
  }, [squad]);

  const value = useMemo<SquadContextValue>(
    () => ({
      squadId,
      squad,
      restoring,
      isInSquad: !!squad,
      isHost: !!squad && !!user && squad.hostId === user.uid,
      matchedVenueIds,
      create,
      join,
      leave,
    }),
    [squadId, squad, restoring, user, matchedVenueIds, create, join, leave]
  );

  return <SquadContext.Provider value={value}>{children}</SquadContext.Provider>;
}

export function useSquad(): SquadContextValue {
  return useContext(SquadContext);
}
