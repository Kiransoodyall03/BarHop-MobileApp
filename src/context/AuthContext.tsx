import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { initPurchases, resetPurchasesUser } from '../services/purchasesModule';
import { subscribeToProfile } from '../services/profileService';
import type { ConsumerProfile } from '../types';

interface AuthContextValue {
  user: User | null;
  // Live users/{uid} document (null until loaded / while signed out).
  profile: ConsumerProfile | null;
  // True until Firebase restores the persisted session on cold start.
  initializing: boolean;
  // True while the first profile snapshot for the current user is in flight.
  profileLoading: boolean;
  // Signed in but hasn't finished the profile wizard yet.
  needsOnboarding: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  initializing: true,
  profileLoading: false,
  needsOnboarding: false,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ConsumerProfile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setInitializing(false);
        // Bind RevenueCat to the Firebase uid — that binding is what lets the
        // webhook map a purchase back to users/{uid}. No-op where billing is
        // unconfigured or unsupported (Expo Go).
        if (nextUser) initPurchases(nextUser.uid);
        else resetPurchasesUser();
      }),
    []
  );

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const unsubscribe = subscribeToProfile(user.uid, (nextProfile) => {
      setProfile(nextProfile);
      setProfileLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const needsOnboarding = !!user && !profileLoading && !profile?.profileCompleted;

  return (
    <AuthContext.Provider
      value={{ user, profile, initializing, profileLoading, needsOnboarding }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
