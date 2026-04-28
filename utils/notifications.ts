import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification handler
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
    bypassDnd: true,   // bypasses Do Not Disturb on Android
  });
}

// Request notification permissions
export const requestNotificationPermissions = async () => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return false;
  }

  return true;
};

// Get Expo push token
export const getExpoPushToken = async () => {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: 'e75efdd7-223c-4f8e-b533-d385af81b417',
  });

  return token.data;
};

// Set up notification listeners
export const setupNotificationListeners = () => {
  // Handle notifications received while app is in foreground
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('Notification received in foreground:', notification);
    }
  );

  // Handle notifications received when app is in background/closed
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('Notification response received:', response);
      // Handle user tapping on notification
    }
  );

  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
  };
};

// Schedule local notification (for testing)
export const scheduleTestNotification = async () => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔥 Test Fire Alert',
      body: 'This is a test notification from the Fire Alert System',
      data: { type: 'test' },
    },
    trigger: { seconds: 2 },
  });
};
