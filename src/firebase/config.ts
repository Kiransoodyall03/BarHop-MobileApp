import { initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same Firebase project as the B2B Creator webapp — both apps share the
// `venues` and `users` collections. Values come from .env (see .env.example).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// getReactNativePersistence exists in the React Native bundle Metro resolves,
// but is absent from the web type definitions firebase v12 ships to TS
// (firebase/firebase-js-sdk#9316) — hence the cast.
const { getReactNativePersistence } = firebaseAuth as unknown as {
  getReactNativePersistence: (storage: unknown) => firebaseAuth.Persistence;
};

export const auth = firebaseAuth.initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

export const storage = getStorage(app);

// Callable Cloud Functions (voucher redemption). Region must match the
// functions' deployment region in the Creator webapp repo — Firebase defaults
// to us-central1, and a mismatch fails with a confusing "not-found".
export const functions = getFunctions(app);
