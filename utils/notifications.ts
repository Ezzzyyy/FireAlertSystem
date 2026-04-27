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
    projectId: 'c5dcd1f1-9881-443b-a7f9-c9f1864e5411',
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
