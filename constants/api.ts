import { Platform } from 'react-native';
import Constants from 'expo-constants';

const ANDROID_EMULATOR_BASE_URL = 'http://10.0.2.2:4000';
const LOCALHOST_BASE_URL = 'http://localhost:4000';

const envBaseUrl = process.env.EXPO_PUBLIC_API_URL;
const appConfigBaseUrl = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

const isIpv4Host = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value);

const getHostIpFromExpo = () => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;

  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(':')[0];
  if (!host || !isIpv4Host(host)) {
    return null;
  }

  return host;
};

const hostIp = getHostIpFromExpo();
const LAN_BASE_URL = hostIp ? `http://${hostIp}:4000` : null;

export const API_BASE_URL =
  Platform.OS === 'web'
    ? envBaseUrl || LOCALHOST_BASE_URL
    : envBaseUrl ||
      appConfigBaseUrl ||
      LAN_BASE_URL ||
      (Platform.OS === 'android' ? ANDROID_EMULATOR_BASE_URL : LOCALHOST_BASE_URL);
