import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { storage } from '../firebase/config';
import { updateProfile } from './profileService';

/** Resize/compress to a sane avatar size before spending upload bytes. */
async function prepareAvatar(localUri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 512, height: 512 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

/**
 * Uploads to a fixed avatars/{uid}.jpg path (overwritten on change, so no
 * orphaned files to clean up), then writes photoURL back to users/{uid} —
 * that write flows through the already-live profile listener, so callers
 * don't need to do anything else for the Profile tab to pick it up.
 */
export async function uploadAvatar(uid: string, localUri: string): Promise<string> {
  const prepared = await prepareAvatar(localUri);
  const blob = await (await fetch(prepared)).blob();
  const storageRef = ref(storage, `avatars/${uid}.jpg`);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  const rawUrl = await getDownloadURL(storageRef);
  // Storage download URLs are stable across overwrites (same token), so
  // <Image> won't refetch on its own after a re-upload without this.
  const photoURL = `${rawUrl}&v=${Date.now()}`;
  await updateProfile(uid, { photoURL });
  return photoURL;
}
