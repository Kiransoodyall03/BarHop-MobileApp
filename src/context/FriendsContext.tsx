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
import { Linking } from 'react-native';
import type { Unsubscribe } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import {
  acceptFriendRequest,
  listenToMyFriendships,
  listenToUserLikes,
  propagateSnapshotToFriendships,
  removeFriendship,
  sendFriendRequest,
  snapshotOf,
} from '../services/friendService';
import {
  registerForPushNotifications,
  sendMatchNotification,
} from '../services/pushService';
import {
  friendUidOf,
  type FriendMatch,
  type FriendshipWithId,
} from '../types';

interface FriendsContextValue {
  /** Accepted friendships only — what the friends list renders. */
  friends: FriendshipWithId[];
  /** Requests waiting on ME to accept. */
  pendingIncoming: FriendshipWithId[];
  /** Requests I sent that haven't been accepted yet. */
  pendingOutgoing: FriendshipWithId[];
  /** True until the first friendship snapshot arrives. */
  loading: boolean;
  /** venueId -> uids of friends who also liked it (excludes me). */
  matchesByVenue: Record<string, string[]>;
  /** Every venue I share with at least one friend, most friends first. */
  matches: FriendMatch[];
  /** Matches with one specific friend. */
  matchesWith: (friendUid: string) => string[];
  addFriendByCode: (code: string) => Promise<void>;
  accept: (pairId: string) => Promise<void>;
  remove: (pairId: string) => Promise<void>;
  /** Code captured from a barhop://friend/{code} link, awaiting the UI. */
  pendingInviteCode: string | null;
  clearPendingInvite: () => void;
  /**
   * Call right after a solo right-swipe. Notifies any friend who had already
   * liked the venue and returns their display names so the caller can show the
   * match celebration. Returns [] when nobody matched.
   */
  announceLike: (venueId: string, venueName: string) => string[];
}

const EMPTY: FriendsContextValue = {
  friends: [],
  pendingIncoming: [],
  pendingOutgoing: [],
  loading: true,
  matchesByVenue: {},
  matches: [],
  matchesWith: () => [],
  addFriendByCode: async () => {},
  accept: async () => {},
  remove: async () => {},
  pendingInviteCode: null,
  clearPendingInvite: () => {},
  announceLike: () => [],
};

// barhop://friend/ABC123 — also tolerates https://…/friend/ABC123 so the same
// handler works if a web fallback link ships later.
const INVITE_PATTERN = /friend\/([A-Za-z0-9]{4,12})/;

function inviteCodeFrom(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(INVITE_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

const FriendsContext = createContext<FriendsContextValue>(EMPTY);

export function FriendsProvider({ children }: PropsWithChildren) {
  const { user, profile } = useAuth();
  const [friendships, setFriendships] = useState<FriendshipWithId[]>([]);
  const [loading, setLoading] = useState(true);
  // friendUid -> their shared likes. Rebuilt as listeners fire.
  const [friendLikes, setFriendLikes] = useState<Record<string, string[]>>({});
  const [myLikes, setMyLikes] = useState<string[]>([]);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(null);

  // Invite links, both cold start (getInitialURL) and while running. Uses RN's
  // Linking rather than expo-linking, which is only a transitive dependency here.
  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        const code = inviteCodeFrom(url);
        if (code) setPendingInviteCode(code);
      })
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const code = inviteCodeFrom(url);
      if (code) setPendingInviteCode(code);
    });
    return () => subscription.remove();
  }, []);

  const clearPendingInvite = useCallback(() => setPendingInviteCode(null), []);

  useEffect(() => {
    if (!user) {
      setFriendships([]);
      setFriendLikes({});
      setMyLikes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return listenToMyFriendships(
      user.uid,
      (next) => {
        setFriendships(next);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user]);

  const accepted = useMemo(
    () => friendships.filter((f) => f.status === 'accepted'),
    [friendships]
  );

  // Mint/refresh the push token once per signed-in session. No-ops on
  // simulators, in Expo Go, and when the permission is declined.
  useEffect(() => {
    if (!user) return;
    void registerForPushNotifications(user.uid);
  }, [user]);

  // Keep our denormalized snapshot (name / photo / push token) current on every
  // friendship. Only writes to documents that are actually stale, which is what
  // stops this from looping against its own listener.
  useEffect(() => {
    if (!user || !friendships.length) return;
    const mine = snapshotOf(profile);
    const stale = friendships.filter((friendship) => {
      const stored = friendship.profiles?.[user.uid];
      return (
        stored?.displayName !== mine.displayName ||
        stored?.photoURL !== mine.photoURL ||
        (stored?.expoPushToken ?? null) !== (mine.expoPushToken ?? null)
      );
    });
    if (!stale.length) return;
    void propagateSnapshotToFriendships(stale, user.uid, mine);
  }, [
    user,
    friendships,
    profile?.displayName,
    profile?.firstName,
    profile?.lastName,
    profile?.photoURL,
    profile?.expoPushToken,
    profile,
  ]);

  // My own likes come from the same shared document a friend would read, not
  // from swipedVenues — so what I match on is exactly what I'm sharing. With
  // social discovery off the doc doesn't exist and nothing matches, which is
  // the intended behaviour.
  useEffect(() => {
    if (!user || !profile?.socialDiscoveryEnabled) {
      setMyLikes([]);
      return;
    }
    return listenToUserLikes(user.uid, setMyLikes);
  }, [user, profile?.socialDiscoveryEnabled]);

  // One listener per accepted friend. Keyed by uid so switching friends only
  // tears down the listeners that actually went away.
  const likeSubsRef = useRef<Record<string, Unsubscribe>>({});
  useEffect(() => {
    if (!user) return;
    const wanted = new Set(accepted.map((f) => friendUidOf(f, user.uid)));

    for (const [uid, unsubscribe] of Object.entries(likeSubsRef.current)) {
      if (!wanted.has(uid)) {
        unsubscribe();
        delete likeSubsRef.current[uid];
        setFriendLikes((current) => {
          const next = { ...current };
          delete next[uid];
          return next;
        });
      }
    }

    for (const uid of wanted) {
      if (likeSubsRef.current[uid]) continue;
      likeSubsRef.current[uid] = listenToUserLikes(uid, (venueIds) => {
        setFriendLikes((current) => ({ ...current, [uid]: venueIds }));
      });
    }
  }, [accepted, user]);

  // Tear every listener down on unmount / sign-out.
  useEffect(
    () => () => {
      for (const unsubscribe of Object.values(likeSubsRef.current)) unsubscribe();
      likeSubsRef.current = {};
    },
    []
  );

  const matchesByVenue = useMemo(() => {
    if (!myLikes.length) return {};
    const mine = new Set(myLikes);
    const result: Record<string, string[]> = {};
    for (const [friendUid, venueIds] of Object.entries(friendLikes)) {
      for (const venueId of venueIds) {
        if (!mine.has(venueId)) continue;
        (result[venueId] ??= []).push(friendUid);
      }
    }
    return result;
  }, [myLikes, friendLikes]);

  const matches = useMemo<FriendMatch[]>(
    () =>
      Object.entries(matchesByVenue)
        .map(([venueId, friendUids]) => ({ venueId, friendUids }))
        // Venues the most friends agree on first — that's the strongest signal
        // for where the group should actually go.
        .sort((a, b) => b.friendUids.length - a.friendUids.length),
    [matchesByVenue]
  );

  const matchesWith = useCallback(
    (friendUid: string) =>
      Object.entries(matchesByVenue)
        .filter(([, uids]) => uids.includes(friendUid))
        .map(([venueId]) => venueId),
    [matchesByVenue]
  );

  const addFriendByCode = useCallback(
    async (code: string) => {
      if (!user) throw new Error('Not signed in');
      await sendFriendRequest(user.uid, code, snapshotOf(profile));
    },
    [user, profile]
  );

  const accept = useCallback(
    async (pairId: string) => {
      if (!user) throw new Error('Not signed in');
      await acceptFriendRequest(pairId, user.uid, snapshotOf(profile));
    },
    [user, profile]
  );

  const remove = useCallback(async (pairId: string) => {
    await removeFriendship(pairId);
  }, []);

  // Reads friendLikes directly rather than matchesByVenue: the caller has only
  // just swiped, so their own like hasn't round-tripped through Firestore yet
  // and the derived intersection wouldn't include it.
  const announceLike = useCallback(
    (venueId: string, venueName: string): string[] => {
      if (!user || !profile?.socialDiscoveryEnabled) return [];
      const myName = snapshotOf(profile).displayName;
      const names: string[] = [];

      for (const friendship of accepted) {
        const otherUid = friendUidOf(friendship, user.uid);
        if (!(friendLikes[otherUid] ?? []).includes(venueId)) continue;
        names.push(friendship.profiles?.[otherUid]?.displayName ?? 'a friend');
        void sendMatchNotification(
          friendship.profiles?.[otherUid]?.expoPushToken,
          myName,
          venueName
        );
      }
      return names;
    },
    [user, profile, accepted, friendLikes]
  );

  const value = useMemo<FriendsContextValue>(() => {
    const pending = friendships.filter((f) => f.status === 'pending');
    return {
      friends: accepted,
      pendingIncoming: pending.filter((f) => f.requestedBy !== user?.uid),
      pendingOutgoing: pending.filter((f) => f.requestedBy === user?.uid),
      loading,
      matchesByVenue,
      matches,
      matchesWith,
      addFriendByCode,
      accept,
      remove,
      pendingInviteCode,
      clearPendingInvite,
      announceLike,
    };
  }, [
    friendships,
    accepted,
    user,
    loading,
    matchesByVenue,
    matches,
    matchesWith,
    addFriendByCode,
    accept,
    remove,
    pendingInviteCode,
    clearPendingInvite,
    announceLike,
  ]);

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsContextValue {
  return useContext(FriendsContext);
}
