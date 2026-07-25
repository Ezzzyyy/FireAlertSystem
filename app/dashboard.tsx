import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Animated,
  TextInput,
  useWindowDimensions,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/useAuthStore';
import { useSystemStore, loadPersistedState } from '../store/useSystemStore';
import { API_BASE_URL } from '../constants/api';
import { getExpoPushToken, setupNotificationListeners } from '../utils/notifications';

// Responsive helper function
const getResponsiveStyles = (width: number) => {
  const isMobile = width < 400;
  const isTablet = width >= 400 && width < 1000;
  const isLarge = width >= 1000;

  return {
    isMobile,
    isTablet,
    isLarge,
    titleFontSize: isMobile ? 36 : isTablet ? 40 : 44, // Main titles
    sectionTitleFontSize: isMobile ? 28 : isTablet ? 32 : 36, // Section titles
    sensorValueFontSize: isMobile ? 44 : isTablet ? 56 : 64, // Sensor values
    buttonPaddingVertical: isMobile ? 18 : 22,
    gridPadding: isMobile ? 16 : 28,
    cardPadding: isMobile ? 18 : 24,
    sensorCardWidth: isMobile ? '100%' : '48%',
    // Additional responsive styles for mobile
    activityTimeFontSize: isMobile ? 11 : 13,
    activityMessageFontSize: isMobile ? 15 : 17,
    activityInfoFontSize: isMobile ? 12 : 14,
    activityPadding: isMobile ? 14 : 18,
    activityMarginBottom: isMobile ? 14 : 18,
    locationFontSize: isMobile ? 10 : 12,
    notificationFontSize: isMobile ? 10 : 12,
    // Alert history responsive styles
    alertTableLabelFontSize: isMobile ? 9 : 10,
    alertTableValueFontSize: isMobile ? 11 : 12,
    alertTableColumnMinWidth: isMobile ? 60 : 80,
    alertTableRowGap: isMobile ? 6 : 8,
    triggeredSensorNameFontSize: isMobile ? 10 : 11,
    triggeredSensorLevelFontSize: isMobile ? 9 : 10,
    alertBadgeFontSize: isMobile ? 9 : 10,
    // Sensor card responsive styles
    sensorNameFontSize: isMobile ? 11 : 12,
    sensorUnitFontSize: isMobile ? 14 : 16,
    moduleTextFontSize: isMobile ? 10 : 11,
    statusTextFontSize: isMobile ? 10 : 11,
    // Alert history sensor boxes responsive styles
    triggeredSensorsGap: isMobile ? 4 : 8,
    triggeredSensorBoxPaddingHorizontal: isMobile ? 6 : 10,
    triggeredSensorBoxPaddingVertical: isMobile ? 4 : 6,
    triggeredSensorBoxGap: isMobile ? 4 : 6,
  };
};

type SensorKind = 'fire' | 'smoke' | 'heat';
type SensorStatus = 'normal' | 'warning' | 'critical';

interface DashboardSensor {
  id: number;
  kind: SensorKind;
  name: string;
  value: number;
  unit: string;
  status: SensorStatus;
  module: string;
}

interface ActivitySensorItem {
  name: string;
  level: string;
}

const SENSOR_THRESHOLDS: Record<SensorKind, { warning: number; critical: number }> = {
  fire: { warning: 65, critical: 85 },
  smoke: { warning: 1600, critical: 1800 },
  heat: { warning: 38, critical: 45 },
};

const getSensorStatus = (kind: SensorKind, value: number): SensorStatus => {
  const threshold = SENSOR_THRESHOLDS[kind];
  if (value >= threshold.critical) {
    return 'critical';
  }
  if (value >= threshold.warning) {
    return 'warning';
  }
  return 'normal';
};

// Hardware-like multi-sensor detection logic - Updated per user requirements
const getAlertLevel = (sensors: DashboardSensor[]): 'critical' | 'warning' | 'normal' => {
  const fireSensor = sensors.find(s => s.kind === 'fire');
  const smokeSensor = sensors.find(s => s.kind === 'smoke');
  const heatSensor = sensors.find(s => s.kind === 'heat');

  const fireCritical = fireSensor?.value !== undefined && fireSensor.value >= SENSOR_THRESHOLDS.fire.critical;
  const smokeStatus = smokeSensor ? getSensorStatus('smoke', smokeSensor.value) : 'normal';
  const heatStatus = heatSensor ? getSensorStatus('heat', heatSensor.value) : 'normal';

  // CRITICAL: Fire CRITICAL alone (after 3s validation on hardware)
  if (fireCritical) {
    return 'critical'; // Fire CRITICAL alone triggers buzzer + LED
  }
  // CRITICAL: Both heat AND smoke critical
  else if (smokeStatus === 'critical' && heatStatus === 'critical') {
    return 'critical'; // Both heat AND smoke critical triggers buzzer + LED
  }
  // WARNING: Any non-normal sensor state that is not a critical fire or smoke+heat critical combo.
  else if (
    fireSensor?.value !== undefined && fireSensor.value > 0 ||
    smokeStatus !== 'normal' ||
    heatStatus !== 'normal'
  ) {
    return 'warning'; // Warning level triggers LED only
  }
  // Normal: All other cases
  else {
    return 'normal';
  }
};

const formatSensorDisplayName = (name: string) => name.replace(/\s*sensor$/i, '').trim();

const createUniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ALARM_SOURCES = [
  require('../assets/alarm.wav'),
];
const TELEMETRY_STALE_MS = 15000;

export default function Dashboard() {
  const router = useRouter();
  const { user, token, logout, checkAuth } = useAuthStore();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveStyles(width);
  const systemLocation = useSystemStore(state => state.systemLocation);
  const setSystemLocation = useSystemStore(state => state.setSystemLocation);
  const setUserId = useSystemStore(state => state.setUserId);

  const [sensors, setSensors] = useState<DashboardSensor[]>([
    { id: 2, kind: 'fire', name: 'Fire Sensor', value: 0, unit: '%', status: getSensorStatus('fire', 0), module: 'IR Fire Module' },
    { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'raw', status: getSensorStatus('smoke', 1), module: 'MQ-2/MQ-135' },
    { id: 3, kind: 'heat', name: 'Heat Sensor', value: 22.5, unit: '°C', status: getSensorStatus('heat', 22.5), module: 'DHT22' },
  ]);
  const latestTelemetryAtRef = useRef<number>(0);

  const isTelemetryFresh = () => {
    if (latestTelemetryAtRef.current === 0) {
      return false;
    }
    return Date.now() - latestTelemetryAtRef.current <= TELEMETRY_STALE_MS;
  };

  // Check auth on mount to restore user session
  useEffect(() => {
    console.log('[Dashboard] Checking auth on mount...');
    checkAuth();
  }, [checkAuth]);

  // Request notification permissions on mount
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          console.log('[Notifications] Permission status:', newStatus);
        }
      } catch (error) {
        console.error('[Notifications] Failed to request permissions:', error);
      }
    };
    requestPermissions();
  }, []);

  useEffect(() => {
    const registerPushToken = async () => {
      if (!token) {
        return;
      }
      const expoToken = await getExpoPushToken();
      if (!expoToken) {
        console.warn('[Push Register] No Expo push token available');
        return;
      }

      try {
        // Try authenticated registration first
        const response = await fetch(`${API_BASE_URL}/fcm/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ fcmToken: expoToken }),
        });

        if (!response.ok) {
          // Fallback: use public endpoint with email (works after Render restarts)
          console.warn('[Push Register] Auth failed, trying public endpoint...');
          const currentUser = useAuthStore.getState().user;
          if (currentUser?.email) {
            const fallbackResponse = await fetch(`${API_BASE_URL}/fcm/register-public`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fcmToken: expoToken, email: currentUser.email }),
            });
            if (fallbackResponse.ok) {
              console.log('[Push Register] Token registered via public endpoint');
            } else {
              console.warn('[Push Register] Public registration also failed', fallbackResponse.status);
            }
          }
        } else {
          console.log('[Push Register] Expo push token registered', expoToken);
        }
      } catch (error) {
        console.error('[Push Register] Error registering push token:', error);
      }
    };

    if (token) {
      void registerPushToken();
      const cleanupListeners = setupNotificationListeners();
      return cleanupListeners;
    }

    return undefined;
  }, [token]);

  // Fetch live sensor data from backend
  useEffect(() => {
    const fetchSensorData = async () => {
      try {
        // Add timestamp to prevent caching
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/hardware/latest?t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        const data = await response.json();
        if (data.success && data.telemetry) {
          const { fire, smoke, heat, receivedAt } = data.telemetry;
          const parsedReceivedAt = typeof receivedAt === 'string' ? Date.parse(receivedAt) : NaN;
          const telemetryTime = Number.isFinite(parsedReceivedAt) ? parsedReceivedAt : Date.now();
          latestTelemetryAtRef.current = telemetryTime;

          // Store the actual hardware trigger time for use in alert logging
          latestTelemetryTimeRef.current = new Date(telemetryTime);

          // Always update sensors to show live data
          setSensors([
            { id: 2, kind: 'fire', name: 'Fire Sensor', value: fire, unit: '%', status: getSensorStatus('fire', fire), module: 'IR Fire Module' },
            { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: smoke, unit: 'raw', status: getSensorStatus('smoke', smoke), module: 'MQ-2/MQ-135' },
            { id: 3, kind: 'heat', name: 'Heat Sensor', value: heat, unit: '°C', status: getSensorStatus('heat', heat), module: 'DHT22' },
          ]);

          // Check if all sensors are normal
          const fireStatus = getSensorStatus('fire', fire);
          const smokeStatus = getSensorStatus('smoke', smoke);
          const heatStatus = getSensorStatus('heat', heat);
          const allNormal = fireStatus === 'normal' && smokeStatus === 'normal' && heatStatus === 'normal';

          console.log('[Sensor Poll] fireStatus:', fireStatus, 'smokeStatus:', smokeStatus, 'heatStatus:', heatStatus, 'allNormal:', allNormal, 'isAlertActive:', isAlertActiveRef.current);

          // Stop buzzer and clear alert card when all sensors return to normal
          if (allNormal) {
            console.log('[Sensor Poll] All sensors normal, stopping buzzer and clearing alert');
            setIsAlertActive(false);
            isAlertActiveRef.current = false;
            void stopAlarmSound();
          }

          // Always clear processed alerts when sensors return to normal (allow re-triggering)
          if (allNormal && processedSensorsRef.current.size > 0) {
            console.log('[Sensor Poll] All sensors normal, clearing processed alerts');
            processedSensorsRef.current.clear();
          }

          // If alert was manually stopped, clear the flag when all sensors return to normal
          if (alertManuallyStoppedRef.current && allNormal) {
            alertManuallyStoppedRef.current = false;
            console.log('[Sensor Poll] All sensors normal, cleared manual stop flag');
          }
        }
      } catch (error) {
        console.error('Failed to fetch sensor data:', error);
      }
    };

    // Fetch immediately
    fetchSensorData();

    // Poll every 500ms for near real-time updates
    const interval = setInterval(fetchSensorData, 500);

    return () => clearInterval(interval);
  }, []);

  const [isArmed, setIsArmed] = useState(true);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [showFullHistory, setShowFullHistory] = useState(false);

  const [pushSent, setPushSent] = useState(0);
  const [uptime, setUptime] = useState('72h+');
  const [lastAlertTime, setLastAlertTime] = useState('No alerts');
  const [showSettings, setShowSettings] = useState(false);
  // systemLocation now comes from Zustand store

  const glowAnim = useRef(new Animated.Value(0)).current;
  const alarmSoundRef = useRef<Audio.Sound | null>(null);
  const processedSensorsRef = useRef<Set<string>>(new Set());
  const isStateLoadedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertManuallyStoppedRef = useRef(false);
  // Stores the actual hardware trigger time (from telemetry receivedAt)
  const latestTelemetryTimeRef = useRef<Date>(new Date());
  // Tracks the last alert key that was processed so re-opens correctly re-trigger
  const lastAlertKeyRef = useRef<string>('');
  // Ref to track isAlertActive inside polling closure (avoids stale state)
  const isAlertActiveRef = useRef(false);

  const startAlarmSound = async () => {
    if (alarmSoundRef.current) {
      console.log('[Alarm] Alarm already playing');
      return;
    }

    console.log('[Alarm] Starting alarm sound...');
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      console.log('[Alarm] Audio mode set');

      for (const source of ALARM_SOURCES) {
        try {
          console.log('[Alarm] Trying to load sound from source:', source);
          const { sound } = await Audio.Sound.createAsync(
            source,
            {
              shouldPlay: false,
              isLooping: true,
              volume: 1.0,
            }
          );
          console.log('[Alarm] Sound loaded successfully');

          await sound.playAsync();
          console.log('[Alarm] Sound playing');
          alarmSoundRef.current = sound;
          return;
        } catch (error) {
          console.log('[Alarm] Failed to play sound from source:', error);
          continue;
        }
      }

      throw new Error('No playable alarm source found.');
    } catch (error) {
      console.error('[Alarm] Alarm sound unavailable:', error);
    }
  };

  const stopAlarmSound = async () => {
    if (!alarmSoundRef.current) {
      return;
    }

    try {
      await alarmSoundRef.current.stopAsync();
      await alarmSoundRef.current.unloadAsync();
    } catch (error) {
      console.log('Unable to stop alarm sound:', error);
    } finally {
      alarmSoundRef.current = null;
    }
  };

  const getPersistedDashboardState = () => ({
    sensors,
    isArmed,
    activities,
    pushSent,
    lastAlertTime,
    systemLocation,
  });

  const applyPersistedDashboardState = (state: any) => {
    if (Array.isArray(state?.sensors)) setSensors(state.sensors);
    if (typeof state?.isArmed === 'boolean') setIsArmed(state.isArmed);
    // NEVER overwrite activities from backend - AsyncStorage is the source of truth
    console.log('[Apply State] Skipping activities from backend to preserve AsyncStorage data');
    if (typeof state?.pushSent === 'number') setPushSent(state.pushSent);
    if (typeof state?.lastAlertTime === 'string') setLastAlertTime(state.lastAlertTime);
    if (typeof state?.systemLocation === 'string') setSystemLocation(state.systemLocation);
  };

  const saveDashboardStateToBackend = async (stateOverride?: any) => {
    if (!token) {
      console.log('[Backend Save] No token, skipping save');
      return;
    }

    try {
      const stateToSave = stateOverride || getPersistedDashboardState();
      console.log('[Backend Save] Saving state to backend:', stateToSave);
      console.log('[Backend Save] Activities count:', stateToSave.activities?.length);
      const response = await fetch(`${API_BASE_URL}/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ state: stateToSave }),
      });
      console.log('[Backend Save] Response status:', response.status);
      if (response.status === 401) {
        console.warn('[Backend Save] Session expired. Redirecting to login.');
        logout();
        router.replace('/login');
        return;
      }
      if (!response.ok) {
        console.error('[Backend Save] Failed to save, response:', await response.text());
      }
    } catch (error) {
      console.error('[Backend Save] Failed to save to backend:', error);
    }
  };

  const loadDashboardStateFromBackend = async () => {
    if (!token) {
      isStateLoadedRef.current = false;
      return;
    }

    try {
      console.log('[Backend Load] Loading state from backend...');
      const response = await fetch(`${API_BASE_URL}/state`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const payload = await response.json();
        console.log('[Backend Load] Loaded state from backend:', payload.state);
        console.log('[Backend Load] Backend activities count:', payload.state?.activities?.length);
        applyPersistedDashboardState(payload.state);
      } else if (response.status === 401) {
        console.warn('[Backend Load] Session expired. Redirecting to login.');
        logout();
        router.replace('/login');
      } else {
        console.log('[Backend Load] Failed to load, response status:', response.status);
      }
    } catch (error) {
      console.error('[Backend Load] Failed to load from backend:', error);
    } finally {
      isStateLoadedRef.current = true;
    }
  };

  const handleLogout = async () => {
    await saveDashboardStateToBackend(getPersistedDashboardState());
    logout();
    router.replace('/login');
  };

  const handleReset = () => {
    setActivities([]);
    setPushSent(0);
    setLastAlertTime('No alerts');
    processedSensorsRef.current.clear();
  };

  const handleStopAlert = () => {
    console.log('[Stop Alert] Stopping alert');
    setIsAlertActive(false);
    isAlertActiveRef.current = false;
    alertManuallyStoppedRef.current = true;
    processedSensorsRef.current.clear();
    void stopAlarmSound();
    console.log('[Stop Alert] Alert stopped, isAlertActive:', false);
  };

  const handleDeleteContact = (id: number) => {
    // kept for potential future use
  };

  // CRITICAL: Trigger alarm using multi-sensor detection logic
  useEffect(() => {
    if (!isArmed) {
      return;
    }

    if (!isTelemetryFresh()) {
      if (isAlertActive) {
        console.log('[Sensor Poll] Telemetry stale, clearing active alert banner');
        setIsAlertActive(false);
        isAlertActiveRef.current = false;
        alertManuallyStoppedRef.current = false;
        processedSensorsRef.current.clear();
        void stopAlarmSound();
      }
      return;
    }

    const alertLevel = getAlertLevel(sensors);
    const criticalSensors = sensors.filter(sensor => sensor.status === 'critical');
    // Use a time-bucketed key (1-minute wall-clock buckets) so repeated polls
    // don't re-trigger, but a new alarm event (different minute) always logs a new entry
    const triggerMinute = Math.floor(Date.now() / 60000);
    const alertKey = `critical-${criticalSensors.map(s => s.kind).sort().join('-')}-${triggerMinute}`;
    
    console.log('[Critical Alert] Alert level:', alertLevel);
    console.log('[Critical Alert] Alert key:', alertKey);
    console.log('[Critical Alert] Processed:', processedSensorsRef.current.has(alertKey));
    console.log('[Critical Alert] Sensors:', sensors.map(s => ({ name: s.name, status: s.status, value: s.value })));
    
    if (alertLevel === 'critical' && !processedSensorsRef.current.has(alertKey) && !alertManuallyStoppedRef.current) {
      processedSensorsRef.current.add(alertKey);
      
      const criticalSensors = sensors.filter(sensor => sensor.status === 'critical');

      console.log('[Critical Alert] Adding activity - Critical sensors:', criticalSensors);

      // Use the ACTUAL hardware trigger time, not the time the app was opened
      const triggerTime = latestTelemetryTimeRef.current;
      const alertTimestamp = triggerTime.toLocaleDateString() + ' ' + triggerTime.toLocaleTimeString();
      const date = triggerTime.toLocaleDateString();

      if (!isAlertActive) {
        setLastAlertTime(alertTimestamp);
      }
      setIsAlertActive(true);
      isAlertActiveRef.current = true;

      void startAlarmSound();

      // Create deep snapshot of all sensor values at time of alert
      const allSensorsSnapshot = sensors.map(sensor => ({
        id: sensor.id,
        name: sensor.name,
        value: sensor.value,
        unit: sensor.unit,
        status: sensor.status,
        kind: sensor.kind,
        module: sensor.module,
      }));

      // Create snapshot of only critical sensors for the alert message
      const criticalSensorSnapshot = criticalSensors.map(sensor => ({
        name: sensor.name,
        level: `${sensor.value}${sensor.unit}`,
        status: sensor.status,
      }));

      setPushSent(prev => prev + 1);
      setActivities(prev => ([
        {
          id: createUniqueId(),
          time: alertTimestamp,
          date: date,
          message: 'CRITICAL - LED + buzzer',
          type: 'alert',
          sensors: criticalSensorSnapshot,
          allSensors: allSensorsSnapshot,
          location: systemLocation,
          notifications: [
            { time: alertTimestamp, type: 'local', message: 'Local LED + Buzzer activated' },
            { time: alertTimestamp, type: 'push', message: 'Push notification sent via Firebase' },
          ],
        },
        ...prev,
      ]));
    }
  }, [sensors, isArmed]);

  useEffect(() => {
    if (isAlertActive) {
      isAlertActiveRef.current = true;
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 600, useNativeDriver: false }),
        ])
      ).start();
    } else {
      isAlertActiveRef.current = false;
      glowAnim.setValue(0);
    }
  }, [isAlertActive]);

  useEffect(() => {
    return () => {
      void stopAlarmSound();
    };
  }, []);


  // Track last loaded user to reset state loaded flag if user changes
  const lastLoadedUserRef = useRef<string | null>(null);

  // Set userId when user is logged in and load persisted state
  useEffect(() => {
    console.log('[Dashboard Load] useEffect triggered');
    console.log('[Dashboard Load] user object:', user);
    console.log('[Dashboard Load] user.id:', user?.id);
    console.log('[Dashboard Load] user.email:', user?.email);
    if (user?.id) {
      setUserId(user.id);
      void loadPersistedState(user.id);

      // Load dashboard-specific state from AsyncStorage + backend alert log
      const loadDashboardState = async () => {
        try {
          console.log('[Dashboard Load] Loading state for user:', user.id);
          const savedState = await AsyncStorage.getItem(`dashboard-${user.id}`);

          if (savedState) {
            const parsed = JSON.parse(savedState);
            if (parsed.systemLocation) setSystemLocation(parsed.systemLocation);
            if (typeof parsed.pushSent === 'number') setPushSent(parsed.pushSent);
            if (typeof parsed.lastAlertTime === 'string') setLastAlertTime(parsed.lastAlertTime);
          }
        } catch (error) {
          console.error('[Dashboard Load] Failed to load local state:', error);
          await AsyncStorage.removeItem(`dashboard-${user.id}`);
        }

        // Always load alert history from backend — works even if phone was off during an alert
        try {
          const currentToken = useAuthStore.getState().token;
          if (currentToken) {
            const resp = await fetch(`${API_BASE_URL}/alerts`, {
              headers: { Authorization: `Bearer ${currentToken}` },
            });
            if (resp.ok) {
              const data = await resp.json();
              if (Array.isArray(data.alerts) && data.alerts.length > 0) {
                setActivities(data.alerts);
                console.log('[Dashboard Load] Loaded', data.alerts.length, 'alerts from backend');
              }
            }
          }
        } catch (err) {
          console.warn('[Dashboard Load] Could not fetch backend alerts:', err);
        }
      };

      loadDashboardState();
    }
  }, [user?.id, setUserId]);

  // Save dashboard state to AsyncStorage for mobile persistence
  useEffect(() => {
    if (!user?.id) return;
    
    const saveState = async () => {
      try {
        const stateToSave = {
          systemLocation,
          pushSent,
          lastAlertTime,
          activities,
        };
        console.log('[Dashboard Save] Saving state for user:', user.id);
        console.log('[Dashboard Save] Activities count:', activities.length);
        console.log('[Dashboard Save] State to save:', stateToSave);
        await AsyncStorage.setItem(`dashboard-${user.id}`, JSON.stringify(stateToSave));
        console.log('[Dashboard Save] State saved successfully');
      } catch (error) {
        console.error('[Dashboard Save] Failed to save dashboard state:', error);
      }
    };
    
    saveState();
  }, [systemLocation, pushSent, lastAlertTime, activities, user?.id]);

  useEffect(() => {
    // Only load state if both token and user.email are present
    if (token && user?.email) {
      // If user changed, reset state loaded flag
      if (lastLoadedUserRef.current !== user.email) {
        isStateLoadedRef.current = false;
        lastLoadedUserRef.current = user.email;
      }
      console.log('[Backend Load] Triggering backend load for user:', user.email);
      void loadDashboardStateFromBackend();
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [token, user?.email]);

  useEffect(() => {
    if (!token || !isStateLoadedRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void saveDashboardStateToBackend();
    }, 700);
  }, [
    token,
    sensors,
    isArmed,
    activities,
    pushSent,
    lastAlertTime,
    systemLocation,
  ]);

  return (
    <LinearGradient colors={['#0a0820', '#1a0f1f']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* User Header */}
        <View style={styles.userHeader}>
          <View>
            <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
            <Text style={styles.emailText}>{user?.email}</Text>
          </View>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
            <Text style={styles.settingsButtonText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={[styles.scroll, { paddingHorizontal: responsive.gridPadding }]} showsVerticalScrollIndicator={false}>
          {/* Alert Banner */}
          {isAlertActive && (
            <Animated.View
              style={[
                styles.alertBanner,
                {
                  opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
              ]}
            >
              <Text style={styles.alertTitle}>🔥 FIRE DETECTED!</Text>
              <Text style={styles.alertMessage}>Multiple sensors triggered. Evacuate immediately!</Text>
            </Animated.View>
          )}

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleSection}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>🔥</Text>
              </View>
              <View>
                <Text style={[styles.title, { fontSize: responsive.titleFontSize }]}>Fire Alert System</Text>
                <Text style={styles.subtitle1}>IoT-Powered Multi-Channel</Text>
                <Text style={styles.subtitle2}>Detection & Response</Text>
              </View>
            </View>
          </View>

          {/* Sensors Grid */}
          <View style={[styles.sensorsGrid, { paddingHorizontal: responsive.gridPadding }]}>
            {sensors.map((sensor, idx) => (
              <Animated.View
                key={sensor.id}
                style={[
                  styles.sensorCard,
                  { padding: responsive.cardPadding },
                  {
                    width: sensor.id === 3 ? '100%' as any : responsive.sensorCardWidth as any,
                    marginRight: sensor.id === 3 || idx === 1 ? 0 : '4%' as any,
                  },
                  isAlertActive && sensor.status === 'critical' && {
                    borderColor: '#ff4444',
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                  },
                ]}
              >
                <View style={styles.sensorHeader}>
                  <Text style={[styles.sensorName, { fontSize: responsive.sensorNameFontSize }]}>{formatSensorDisplayName(sensor.name)}</Text>
                  <Animated.View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          sensor.status === 'critical'
                            ? isAlertActive
                              ? glowAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['#ff6666', '#ff0000'],
                                })
                              : '#ff6666'
                            : '#00d084',
                      },
                    ]}
                  />
                </View>

                <View style={styles.sensorValueSection}>
                  <Text
                    style={[
                      styles.sensorValue,
                      { fontSize: responsive.sensorValueFontSize },
                      sensor.status === 'critical' && styles.sensorValueCritical,
                    ]}
                  >
                    {sensor.value.toFixed(sensor.id === 3 ? 1 : 0)}
                  </Text>
                  <Text style={[styles.sensorUnit, { fontSize: responsive.sensorUnitFontSize }]}>{sensor.unit}</Text>
                </View>

                <View style={styles.sensorDivider} />

                <View style={styles.sensorFooter}>
                  <Text style={[styles.moduleText, { fontSize: responsive.moduleTextFontSize }]}>{sensor.module}</Text>
                  <Text
                    style={[
                      styles.statusText,
                      { fontSize: responsive.statusTextFontSize },
                      sensor.status === 'critical' && styles.statusTextCritical,
                    ]}
                  >
                    {sensor.status.toUpperCase()}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* Alert History */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <Text style={styles.sectionIcon}>🔔</Text>
                <Text style={[styles.sectionTitleText, { fontSize: responsive.isMobile ? 15 : responsive.sectionTitleFontSize }]}>Alert History Log</Text>
              </View>
              <TouchableOpacity
                style={styles.viewAllButtonSmall}
                onPress={() => setShowFullHistory(true)}
              >
                <Text style={[styles.viewAllButtonSmallText, { fontSize: responsive.isMobile ? 11 : 12 }]}>View All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.alertHistoryBox} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {activities.length > 0 ? (
                activities.map((activity) => (
                  <View key={activity.id} style={styles.alertCard}>
                    {activity.type === 'alert' ? (
                      <View style={[styles.alertTableRow, { gap: responsive.alertTableRowGap }]}>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Time</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.time}</Text>
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Alert</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.message}</Text>
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Sensors</Text>
                          {activity.sensors ? (
                            <View style={[styles.triggeredSensorsContainer, { gap: responsive.triggeredSensorsGap }]}>
                              {activity.sensors.map((sensor: ActivitySensorItem, idx: number) => (
                                <View key={idx} style={[styles.triggeredSensorBox, { paddingHorizontal: responsive.triggeredSensorBoxPaddingHorizontal, paddingVertical: responsive.triggeredSensorBoxPaddingVertical, gap: responsive.triggeredSensorBoxGap }]}>
                                  <Text style={[styles.triggeredSensorName, { fontSize: responsive.triggeredSensorNameFontSize }]}>{formatSensorDisplayName(sensor.name)}</Text>
                                  <Text style={[styles.triggeredSensorLevel, { fontSize: responsive.triggeredSensorLevelFontSize }]}>{sensor.level}</Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>-</Text>
                          )}
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Location</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.location || '-'}</Text>
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Status</Text>
                          <View style={[styles.alertBadge, activity.message.includes('CRITICAL') ? styles.alertBadgeCritical : styles.alertBadgeWarning]}>
                            <Text style={[styles.alertBadgeText, { fontSize: responsive.alertBadgeFontSize }]}>{activity.message.includes('CRITICAL') ? 'CRITICAL' : 'WARNING'}</Text>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View style={[styles.alertTableRow, { gap: responsive.alertTableRowGap }]}>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Time</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.time}</Text>
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Message</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.message}</Text>
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Sensors</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>-</Text>
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Location</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>-</Text>
                        </View>
                        <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                          <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Status</Text>
                          <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>INFO</Text>
                        </View>
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <View style={styles.noAlertContainer}>
                  <Text style={styles.noAlertIcon}>✓</Text>
                  <Text style={styles.noAlertText}>No alerts</Text>
                  <Text style={styles.noAlertSubtext}>System is operating normally</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {/* System Control */}
          <View style={styles.section}>
            <View style={styles.sectionTitle}>
              <Text style={styles.sectionIcon}>⚙️</Text>
              <Text style={[styles.sectionTitleText, { fontSize: responsive.sectionTitleFontSize }]}>System Control</Text>
            </View>

            <View style={styles.armControl}>
              <View>
                <Text style={styles.armLabel}>System Armed</Text>
                <Text style={styles.armSublabel}>Monitoring active • 95% accuracy</Text>
              </View>
              <Switch
                value={isArmed}
                onValueChange={setIsArmed}
                trackColor={{ false: '#333', true: '#00d084' }}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.buttonResetLeft}
                onPress={handleReset}
              >
                <Text style={styles.buttonResetText}>Reset System</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.buttonStopAlertRight}
                onPress={handleStopAlert}
                disabled={!isAlertActive}
              >
                <Text style={styles.buttonStopAlertText}>Stop Alert</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsBox}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Last Alert:</Text>
                <Text style={styles.statValue}>{lastAlertTime}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.footer}>Fire Alert System v2.0</Text>
        </ScrollView>

        {/* Full History Modal */}
        {showFullHistory && (
          <View style={styles.fullHistoryModal}>
            <View style={styles.fullHistoryContent}>
              <View style={styles.fullHistoryHeader}>
                <Text style={styles.fullHistoryTitle}>Complete Alert History</Text>
                <TouchableOpacity onPress={() => setShowFullHistory(false)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.fullHistoryList}>
                {activities.length > 0 ? (
                  activities.map((activity) => (
                    <View key={activity.id} style={styles.historyCard}>
                      {activity.type === 'alert' ? (
                        <View style={[styles.alertTableRow, { gap: responsive.alertTableRowGap }]}>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Time</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.time}</Text>
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Alert</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.message}</Text>
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Sensors</Text>
                            {activity.sensors ? (
                              <View style={[styles.triggeredSensorsContainer, { gap: responsive.triggeredSensorsGap }]}>
                                {activity.sensors.map((sensor: ActivitySensorItem, idx: number) => (
                                  <View key={idx} style={[styles.triggeredSensorBox, { paddingHorizontal: responsive.triggeredSensorBoxPaddingHorizontal, paddingVertical: responsive.triggeredSensorBoxPaddingVertical, gap: responsive.triggeredSensorBoxGap }]} >
                                    <Text style={[styles.triggeredSensorName, { fontSize: responsive.triggeredSensorNameFontSize }]}>{formatSensorDisplayName(sensor.name)}</Text>
                                    <Text style={[styles.triggeredSensorLevel, { fontSize: responsive.triggeredSensorLevelFontSize }]}>{sensor.level}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>-</Text>
                            )}
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Location</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.location || '-'}</Text>
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Status</Text>
                            <View style={[styles.alertBadge, activity.message.includes('CRITICAL') ? styles.alertBadgeCritical : styles.alertBadgeWarning]}>
                              <Text style={[styles.alertBadgeText, { fontSize: responsive.alertBadgeFontSize }]}>{activity.message.includes('CRITICAL') ? 'CRITICAL' : 'WARNING'}</Text>
                            </View>
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.alertTableRow, { gap: responsive.alertTableRowGap }]}>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Time</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.time}</Text>
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Message</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>{activity.message}</Text>
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Sensors</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>-</Text>
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Location</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>-</Text>
                          </View>
                          <View style={[styles.alertTableColumn, { minWidth: responsive.alertTableColumnMinWidth }]}>
                            <Text style={[styles.alertTableLabel, { fontSize: responsive.alertTableLabelFontSize }]}>Status</Text>
                            <Text style={[styles.alertTableValue, { fontSize: responsive.alertTableValueFontSize }]}>INFO</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  ))
                ) : (
                  <View style={styles.noAlertContainer}>
                    <Text style={styles.noAlertIcon}>✓</Text>
                    <Text style={styles.noAlertText}>No alerts</Text>
                    <Text style={styles.noAlertSubtext}>System is operating normally</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <View style={styles.settingsModalOverlay}>
            <View style={styles.settingsModalContent}>
              <View style={styles.settingsModalHeader}>
                <Text style={styles.settingsModalTitle}>Settings</Text>
                <TouchableOpacity onPress={() => setShowSettings(false)}>
                  <Text style={styles.settingsCloseBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.settingsMenuItem}
                onPress={() => {
                  setShowSettings(false);
                  router.push('/location');
                }}
              >
                <Text style={styles.settingsMenuItemText}>Location</Text>
                <Text style={styles.settingsMenuItemSubtext}>{systemLocation}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.settingsMenuItemLogout}
                onPress={handleLogout}
              >
                <Text style={styles.settingsMenuItemLogoutText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Location Configuration Modal removed: now handled by /location page */}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0820',
  },
  safeArea: {
    flex: 1,
  },
  userHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  emailText: {
    fontSize: 18,
    color: '#aaa',
    marginTop: 2,
  },
  settingsButton: {
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  alertBanner: {
    backgroundColor: '#cc0000',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderWidth: 2,
    borderColor: '#ff4444',
  },
  alertTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 20,
    color: '#ffaaaa',
  },
  header: {
    marginVertical: 16,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
    maxWidth: 320,
  },
  logoCircle: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(100, 80, 130, 0.6)',
  },
  logoText: {
    fontSize: 44,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    flexShrink: 1,
    flexWrap: 'wrap',
    lineHeight: 1.1 * 32,
    maxWidth: 220,
  },
  subtitle1: {
    fontSize: 18,
    color: '#999',
    marginTop: 2,
  },
  subtitle2: {
    fontSize: 11,
    color: '#999',
  },
  subtitle3: {
    fontSize: 16,
    color: 'rgba(100, 80, 130, 0.8)',
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 208, 132, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 208, 132, 0.4)',
    gap: 4,
  },
  badgeIcon: {
    fontSize: 20,
  },
  badgeText: {
    fontSize: 10,
    color: '#00d084',
    fontWeight: '600',
  },
  sensorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 16,
    paddingHorizontal: 16,
    width: '100%',
  },
  sensorCard: {
    backgroundColor: 'rgba(26, 20, 37, 0.8)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(100, 80, 130, 0.6)',
    padding: 18,
    marginBottom: 16,
  },
  sensorCardLast: {
    width: '100%',
  },
  sensorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sensorName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sensorValueSection: {
    alignItems: 'center',
    marginVertical: 8,
  },
  sensorValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  sensorValueCritical: {
    color: '#ff6666',
  },
  sensorUnit: {
    fontSize: 10,
    color: '#999',
  },
  sensorDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  sensorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moduleText: {
    fontSize: 14,
    color: '#999',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00d084',
  },
  statusTextCritical: {
    color: '#ff4444',
  },
  section: {
    marginVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIcon: {
    fontSize: 28,
  },
  sectionTitleText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  timestamp: {
    fontSize: 16,
    color: '#999',
  },
  alertHistoryBox: {
    backgroundColor: 'rgba(26, 20, 37, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 66, 0.3)',
    padding: 12,
    marginBottom: 10,
    maxHeight: 200,
  },
  alertCard: {
    backgroundColor: 'rgba(26, 20, 37, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 66, 0.3)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  alertTableRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  alertTableColumn: {
    flex: 1,
    minWidth: 80,
  },
  alertTableLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  alertTableValue: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  activityTime: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
  },
  activityMessage: {
    fontSize: 17,
    color: '#ccc',
  },
  activityAlert: {
    fontSize: 13,
    color: '#ff9999',
    fontWeight: '600',
  },
  notificationsList: {
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#ff8c42',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  notificationIcon: {
    fontSize: 13,
  },
  notificationText: {
    fontSize: 11,
    color: '#bbb',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  alertBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 70,
    alignItems: 'center',
  },
  alertBadgeCritical: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  alertBadgeWarning: {
    backgroundColor: 'rgba(255, 140, 66, 0.2)',
    borderWidth: 1,
    borderColor: '#ff8c42',
  },
  alertBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  triggeredSensorsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  triggeredSensorBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  triggeredSensorName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  triggeredSensorLevel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff8c42',
  },
  noAlertContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  noAlertIcon: {
    fontSize: 48,
    color: '#00d084',
    marginBottom: 8,
  },
  noAlertText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  noAlertSubtext: {
    fontSize: 14,
    color: '#999',
  },
  viewAllButton: {
    backgroundColor: 'rgba(60, 50, 80, 0.8)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewAllButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  viewAllButtonSmall: {
    backgroundColor: 'rgba(60, 50, 80, 0.8)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  viewAllButtonSmallText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  armControl: {
    backgroundColor: 'rgba(38, 30, 46, 0.8)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  armLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
  },
  armSublabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  buttonReset: {
    backgroundColor: 'rgba(26, 26, 46, 0.8)',
    borderWidth: 1,
    borderColor: '#999',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonResetText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  buttonResetLeft: {
    flex: 1,
    backgroundColor: 'rgba(26, 26, 46, 0.8)',
    borderWidth: 1,
    borderColor: '#999',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonStopAlertRight: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderWidth: 1,
    borderColor: '#ff6b6b',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonStopAlertText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  statsBox: {
    backgroundColor: 'rgba(26, 26, 46, 0.5)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 20,
    color: '#999',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  sectionHeaderWithBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addContactBtn: {
    backgroundColor: '#4ecdc4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addContactBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '600',
  },
  contactItem: {
    backgroundColor: 'rgba(26, 26, 46, 0.6)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff8c42',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  contactPhone: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  contactWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  contactWarningLabel: {
    fontSize: 11,
    color: '#ffa500',
    fontWeight: '500',
  },
  deleteBtn: {
    paddingHorizontal: 8,
  },
  deleteBtnText: {
    fontSize: 16,
    color: '#ff6b6b',
    fontWeight: 'bold',
  },
  addContactLargeBtn: {
    backgroundColor: '#4ecdc4',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addContactLargeBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginVertical: 20,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1425',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 13,
  },
  inputHint: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  modalButtonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  modalButtonSave: {
    flex: 1,
    backgroundColor: '#4ecdc4',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderWidth: 1,
    borderColor: '#ff6b6b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  modalButtonCancelText: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '600',
  },
  fullHistoryModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullHistoryContent: {
    backgroundColor: '#1a1425',
    borderRadius: 12,
    width: '100%',
    height: '78%',
    minHeight: 320,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  fullHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  fullHistoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeBtn: {
    fontSize: 32,
    color: '#ff6b6b',
    fontWeight: 'bold',
  },
  fullHistoryList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  historyCard: {
    backgroundColor: 'rgba(38, 30, 46, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 66, 0.3)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  historyTime: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  historyMessage: {
    fontSize: 12,
    color: '#fff',
    marginBottom: 8,
  },
  historyNotifications: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255, 140, 66, 0.5)',
  },
  historyNotification: {
    fontSize: 10,
    color: '#bbb',
    marginBottom: 4,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyNotificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  historyNotificationIcon: {
    fontSize: 12,
  },
  historyNotificationText: {
    fontSize: 11,
    color: '#bbb',
  },
  noHistoryText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 30,
  },
  settingsModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  settingsModalContent: {
    backgroundColor: '#1a1425',
    borderRadius: 12,
    width: '70%',
    marginTop: 60,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  settingsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsModalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  settingsCloseBtn: {
    fontSize: 18,
    color: '#ff6b6b',
    fontWeight: 'bold',
  },
  settingsMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsMenuItemText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  settingsMenuItemSubtext: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  settingsMenuItemLogout: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsMenuItemLogoutText: {
    fontSize: 13,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  contactsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalCloseBtnText: {
    fontSize: 20,
    color: '#ff6b6b',
    fontWeight: 'bold',
  },
  contactsListScroll: {
    maxHeight: 300,
    marginBottom: 12,
  },
  contactItemModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    marginBottom: 8,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editBtnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  deleteBtnModal: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addContactModalBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  addContactModalBtnText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
  },
});
