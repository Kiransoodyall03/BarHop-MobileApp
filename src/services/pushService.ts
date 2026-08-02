import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { updateProfile } from './profileService';

// Expo's hosted push gateway. Used directly from the client: this app has no
// deployable Cloud Functions of its own (cloud-functions/ is a staging folder
// for the Creator webapp repo), so a server-side sender would be a cross-repo
// change. See the note on sendMatchNotification below.
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Foreground presentation — a match should still surface while swiping. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Registers for push and persists the token on users/{uid}.
 *
 * Returns null (never throws) whenever push isn't available: simulators, a
 * declined permission prompt, or Expo Go — remote push was removed from Expo
 * Go in SDK 53+, so this is a normal outcome in development, not an error.
 */
export async function registerForPushNotifications(uid: string): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    // Android requires a channel before anything will display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('matches', {
        name: 'Matches',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[pushService] no EAS projectId — cannot mint a push token');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await updateProfile(uid, { expoPushToken: token });
    return token;
  } catch (error) {
    console.warn('[pushService] push registration failed:', error);
    return null;
  }
}

/**
 * Notifies a friend that they just matched with this user.
 *
 * ⚠️ Sent CLIENT-side. A determined client holding a friend's token could spam
 * them — tokens are only ever exposed to accepted friends, and removing the
 * friendship revokes access, so the blast radius is bounded. The hardened
 * version is a Firestore-triggered sender in the Creator webapp repo; this is
 * deliberately the launch-scope tradeoff, not the end state.
 *
 * Fire-and-forget: a failed notification must never surface as a swipe error.
 */
export async function sendMatchNotification(
  toToken: string | null | undefined,
  fromName: string,
  venueName: string
): Promise<void> {
  if (!toToken) return;
  try {
    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toToken,
        title: "It's a match! 🍻",
        body: `You and ${fromName} both liked ${venueName}.`,
        channelId: 'matches',
        data: { type: 'friend-match' },
      }),
    });
  } catch (error) {
    console.warn('[pushService] match notification failed:', error);
  }
}
