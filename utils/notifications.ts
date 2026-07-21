import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification handler — controls how notifications appear when app is FOREGROUNDED
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Set up Android high-priority alarm channel
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('fire-alert', {
    name: 'Fire Alert',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: '#FF0000',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

// Request notification permissions
export const requestNotificationPermissions = async (): Promise<boolean> => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Notification permission not granted');
    return false;
  }

  return true;
};

/**
 * Gets the native FCM device token (not an Expo push token).
 * This token works directly with Firebase Cloud Messaging and
 * delivers background notifications on standalone APKs.
 */
export const getExpoPushToken = async (): Promise<string | null> => {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return null;
  }

  try {
    // Use native FCM token — works for standalone APKs without Expo proxy
    const tokenData = await Notifications.getDevicePushTokenAsync();
    console.log('[Push] Native FCM token type:', tokenData.type);
    console.log('[Push] Native FCM token:', tokenData.data);
    return tokenData.data as string;
  } catch (error: any) {
    console.error('[Push] Failed to get device push token:', error.message);
    return null;
  }
};

// Set up notification listeners
export const setupNotificationListeners = () => {
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('[Push] Notification received in foreground:', notification);
    }
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('[Push] Notification tapped:', response);
    }
  );

  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
  };
};
