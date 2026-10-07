import * as Notifications from 'expo-notifications';
import { api } from '@/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPush(): Promise<string | null> {
  const config = await api<{ push_enabled: boolean }>('/mobile/config');

  if (!config.push_enabled) {
    return 'Phone push is turned off in System.';
  }

  const permission = await Notifications.requestPermissionsAsync();

  if (permission.status !== 'granted') {
    return 'Notifications stay off until you allow them.';
  }

  const token = await Notifications.getExpoPushTokenAsync();
  await api('/mobile/push-token', { method: 'POST', body: { token: token.data } });

  return 'This phone will get alerts when the app is closed.';
}
