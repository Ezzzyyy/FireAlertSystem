import { create } from 'zustand';

interface Sensor {
  id: string;
  name: string;
  type: 'smoke' | 'temperature' | 'fire';
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
}

const SENSOR_THRESHOLDS = {
  fire: { warning: 25, critical: 60 },
  smoke: { warning: 40, critical: 80 },
  temperature: { warning: 35, critical: 50 },
} as const;

const getSensorStatus = (type: Sensor['type'], value: number): Sensor['status'] => {
  const threshold = SENSOR_THRESHOLDS[type];
  if (value > threshold.critical) {
    return 'critical';
  }
  if (value > threshold.warning) {
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
  setSensors: (sensors: Sensor[]) => void;
  updateSensor: (id: string, value: number) => void;
  toggleArm: () => void;
  setPowerMode: (mode: 'ultra-low' | 'normal' | 'high-performance') => void;
  addActivity: (activity: string) => void;
  simulateAlarm: () => void;
  resetSystem: () => void;
}

export const useSystemStore = create<SystemState>((set) => ({
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
  setSensors: (sensors) => set({ sensors }),
  updateSensor: (id, value) =>
    set((state) => ({
      sensors: state.sensors.map((s) =>
        s.id === id ? { ...s, value, status: getSensorStatus(s.type, value) } : s
      ),
    })),
  toggleArm: () => set((state) => ({ isArmed: !state.isArmed })),
  setPowerMode: (mode) => set({ powerMode: mode }),
  addActivity: (activity) =>
    set((state) => ({
      activities: [{ id: Date.now().toString(), time: new Date().toLocaleTimeString(), message: activity }, ...state.activities],
    })),
  simulateAlarm: () =>
    set({
      sensors: [
        { id: '1', name: 'Fire Sensor', type: 'fire', value: 95, unit: '%', status: getSensorStatus('fire', 95) },
        { id: '2', name: 'Smoke Sensor', type: 'smoke', value: 120, unit: 'ppm', status: getSensorStatus('smoke', 120) },
        { id: '3', name: 'Heat Sensor', type: 'temperature', value: 65, unit: '°C', status: getSensorStatus('temperature', 65) },
      ],
    }),
  resetSystem: () =>
    set({
      sensors: [
        { id: '1', name: 'Fire Sensor', type: 'fire', value: 0, unit: '%', status: 'normal' },
        { id: '2', name: 'Smoke Sensor', type: 'smoke', value: 0, unit: 'ppm', status: 'normal' },
        { id: '3', name: 'Heat Sensor', type: 'temperature', value: 22.5, unit: '°C', status: 'normal' },
      ],
      isArmed: true,
    }),
}));
