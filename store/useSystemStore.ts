import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Web-compatible storage helper
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  },
};

const getSystemStorageKey = (userId: string | null) => {
  return userId ? `fire-alert-system-state-${userId}` : 'fire-alert-system-state';
};

interface Sensor {
  id: string;
  name: string;
  type: 'smoke' | 'temperature' | 'fire';
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
}

const SENSOR_THRESHOLDS = {
  fire: { warning: 65, critical: 85 },
  smoke: { warning: 1200, critical: 1600 },
  temperature: { warning: 38, critical: 55 },
} as const;

const getSensorStatus = (type: Sensor['type'], value: number): Sensor['status'] => {
  const threshold = SENSOR_THRESHOLDS[type];
  if (value >= threshold.critical) {
    return 'critical';
  }
  if (value >= threshold.warning) {
    return 'warning';
  }
  return 'normal';
};

interface Activity {
  id: string;
  time: string;
  message: string;
}

interface SystemState {
  sensors: Sensor[];
  isArmed: boolean;
  powerMode: 'ultra-low' | 'normal' | 'high-performance';
  uptime: string;
  activities: Activity[];
  systemLocation: string;
  userId: string | null;
  setUserId: (userId: string | null) => void;
  setSystemLocation: (location: string) => void;
  setSensors: (sensors: Sensor[]) => void;
  updateSensor: (id: string, value: number) => void;
  toggleArm: () => void;
  setPowerMode: (mode: 'ultra-low' | 'normal' | 'high-performance') => void;
  addActivity: (activity: string) => void;
  simulateAlarm: () => void;
  resetSystem: () => void;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  sensors: [
    { id: '1', name: 'Fire Sensor', type: 'fire', value: 0, unit: '%', status: 'normal' },
    { id: '2', name: 'Smoke Sensor', type: 'smoke', value: 0, unit: 'ppm', status: 'normal' },
    { id: '3', name: 'Heat Sensor', type: 'temperature', value: 22.5, unit: '°C', status: 'normal' },
  ],
  isArmed: true,
  powerMode: 'normal',
  uptime: '730+',
  activities: [
    { id: '1', time: '12:25:11 AM', message: 'No alerts. System operating normally.' },
  ],
  systemLocation: '',
  userId: null,
  setUserId: (userId) => {
    set({ userId });
  },
  setSystemLocation: (location) => {
    set({ systemLocation: location });
    // Save AFTER set() so we capture the new value
    const updatedState = { ...get(), systemLocation: location };
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(updatedState));
  },
  setSensors: (sensors) => {
    set({ sensors });
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(get()));
  },
  updateSensor: (id, value) => {
    set((state) => ({
      sensors: state.sensors.map((s) =>
        s.id === id ? { ...s, value, status: getSensorStatus(s.type, value) } : s
      ),
    }));
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(get()));
  },
  toggleArm: () => {
    set((state) => ({ isArmed: !state.isArmed }));
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(get()));
  },
  setPowerMode: (mode) => {
    set({ powerMode: mode });
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(get()));
  },
  addActivity: (activity) => {
    set((state) => ({
      activities: [{ id: Date.now().toString(), time: new Date().toLocaleTimeString(), message: activity }, ...state.activities],
    }));
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(get()));
  },
  simulateAlarm: () => {
    set({
      sensors: [
        { id: '1', name: 'Fire Sensor', type: 'fire', value: 95, unit: '%', status: getSensorStatus('fire', 95) },
        { id: '2', name: 'Smoke Sensor', type: 'smoke', value: 120, unit: 'ppm', status: getSensorStatus('smoke', 120) },
        { id: '3', name: 'Heat Sensor', type: 'temperature', value: 65, unit: '°C', status: getSensorStatus('temperature', 65) },
      ],
    });
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(get()));
  },
  resetSystem: () => {
    set({
      sensors: [
        { id: '1', name: 'Fire Sensor', type: 'fire', value: 0, unit: '%', status: 'normal' },
        { id: '2', name: 'Smoke Sensor', type: 'smoke', value: 0, unit: 'ppm', status: 'normal' },
        { id: '3', name: 'Heat Sensor', type: 'temperature', value: 22.5, unit: '°C', status: 'normal' },
      ],
      isArmed: true,
    });
    storage.setItem(getSystemStorageKey(get().userId), JSON.stringify(get()));
  },
}));

// Load persisted state on app start - will be called after userId is set
export const loadPersistedState = async (userId: string | null) => {
  const storageKey = getSystemStorageKey(userId);
  const storedState = await storage.getItem(storageKey);
  if (storedState) {
    try {
      const parsedState = JSON.parse(storedState);
      useSystemStore.setState(parsedState);
      console.log('System state loaded from storage');
    } catch (error) {
      console.error('Failed to parse stored system state:', error);
    }
  }
};
