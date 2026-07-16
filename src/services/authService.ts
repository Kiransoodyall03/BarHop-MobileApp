import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await ensureConsumerUserDoc(cred.user);
  return cred.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureConsumerUserDoc(cred.user);
  return cred.user;
}

export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(auth, credential);
  await ensureConsumerUserDoc(cred.user);
  return cred.user;
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

/**
 * Creates a minimal consumer profile at users/{uid} on first sign-in.
 *
 * The `users` collection is shared with the B2B Creator webapp, where venue
 * owners have a much richer document (businessProfile, Paystack fields, …).
 * A venue owner may well log into the consumer app with the same account, so
 * this never touches an existing document — swipe history lives in the
 * users/{uid}/swipedVenues subcollection either way.
 */
export async function ensureConsumerUserDoc(user: User): Promise<void> {
  try {
    const ref = doc(db, 'users', user.uid);
    const snapshot = await getDoc(ref);
    if (snapshot.exists()) return;

    await setDoc(ref, {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL,
      provider: user.providerData[0]?.providerId ?? 'email',
      emailVerified: user.emailVerified,
      accountType: 'consumer',
      // Routes brand-new users into the onboarding wizard exactly once.
      profileCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Profile creation must never block sign-in — swiping only needs the
    // subcollection, which is created lazily on first swipe.
    console.warn('[authService] Could not create consumer user doc:', error);
  }
}

/** Maps Firebase Auth error codes to copy fit for the auth screen. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
