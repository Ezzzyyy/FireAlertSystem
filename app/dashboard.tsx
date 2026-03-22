import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Animated,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { API_BASE_URL } from '../constants/api';

// Responsive helper function
const getResponsiveStyles = (width: number) => {
  const isMobile = width < 400;
  const isTablet = width >= 400 && width < 1000;
  const isLarge = width >= 1000;

  return {
    isMobile,
    isTablet,
    isLarge,
    titleFontSize: isMobile ? 26 : isTablet ? 28 : 32, // Main titles
    sectionTitleFontSize: isMobile ? 20 : isTablet ? 22 : 24, // Section titles
    sensorValueFontSize: isMobile ? 22 : isTablet ? 24 : 28, // Sensor values
    buttonPaddingVertical: isMobile ? 14 : 16,
    gridPadding: isMobile ? 12 : 20,
    cardPadding: isMobile ? 12 : 16,
    sensorCardWidth: isMobile ? '100%' : '48%',
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

const SENSOR_THRESHOLDS: Record<SensorKind, { warning: number; critical: number }> = {
  fire: { warning: 25, critical: 60 },
  smoke: { warning: 40, critical: 80 },
  heat: { warning: 35, critical: 50 },
};

const getSensorStatus = (kind: SensorKind, value: number): SensorStatus => {
  const threshold = SENSOR_THRESHOLDS[kind];
  if (value > threshold.critical) {
    return 'critical';
  }
  if (value > threshold.warning) {
    return 'warning';
  }
  return 'normal';
};

const generateSMSMessage = (sensor: DashboardSensor, status: 'warning' | 'critical', location: string): string => {
  const timestamp = new Date().toLocaleString();
  const sensorNames = {
    fire: 'Fire Sensor',
    smoke: 'Smoke Sensor',
    heat: 'Heat Sensor',
  };
  
  if (status === 'warning') {
    return `⚠️ FIRE ALERT WARNING\nSensor: ${sensorNames[sensor.kind]}\nLevel: ${sensor.value}${sensor.unit}\nStatus: Elevated - Monitor\nTime: ${timestamp}\nLocation: ${location}\nSystem: Fire Alert IoT`;
  } else {
    return `🚨 EMERGENCY FIRE ALERT\nSensor: ${sensorNames[sensor.kind]}\nLevel: ${sensor.value}${sensor.unit}\nStatus: CRITICAL - EVACUATE NOW\nTime: ${timestamp}\nLocation: ${location}\nEmergency: 911\nSystem: Fire Alert IoT`;
  }
};

const createUniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ALARM_SOURCES = [
  require('../assets/alarm.wav'),
  require('../assets/buzzer.mp3'),
];

export default function Dashboard() {
  const router = useRouter();
  const { user, token, logout } = useAuthStore();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveStyles(width);

  const [sensors, setSensors] = useState<DashboardSensor[]>([
    { id: 2, kind: 'fire', name: 'Fire Sensor', value: 0, unit: '%', status: getSensorStatus('fire', 0), module: 'IR Fire Module' },
    { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'ppm', status: getSensorStatus('smoke', 1), module: 'MQ-2/MQ-135' },
    { id: 3, kind: 'heat', name: 'Heat Sensor', value: 22.5, unit: '°C', status: getSensorStatus('heat', 22.5), module: 'DHT22' },
  ]);

  const [isArmed, setIsArmed] = useState(true);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [activities, setActivities] = useState<any[]>([
    { id: 1, time: '12:25:11 AM', message: 'No alerts. System operating normally.', type: 'normal' }
  ]);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState([
    { id: 1, name: 'Emergency Services', phone: '+1-911-000-0000', enabled: true, warningSmsEnabled: false },
    { id: 2, name: 'Fire Department', phone: '+1-800-555-0000', enabled: true, warningSmsEnabled: true },
  ]);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactInput, setContactInput] = useState({ name: '', phone: '' });
  const [editingId, setEditingId] = useState(null);

  const [smsSent, setSmsSent] = useState(0);
  const [pushSent, setPushSent] = useState(0);
  const [uptime, setUptime] = useState('72h+');
  const [powerMode, setPowerMode] = useState('Ultra-Low');
  const [battery, setBattery] = useState(85);
  const [lastAlertTime, setLastAlertTime] = useState('No alerts');
  const [smsPerAlert, setSmsPerAlert] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showContactsInSettings, setShowContactsInSettings] = useState(false);
  const [systemLocation, setSystemLocation] = useState('Your Building');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationInput, setLocationInput] = useState('');

  const glowAnim = useRef(new Animated.Value(0)).current;
  const alarmSoundRef = useRef<Audio.Sound | null>(null);
  const processedSensorsRef = useRef<Set<string>>(new Set());
  const isStateLoadedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAlarmSound = async () => {
    if (alarmSoundRef.current) {
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      for (const source of ALARM_SOURCES) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            source,
            {
              shouldPlay: false,
              isLooping: true,
              volume: 1.0,
            }
          );

          await sound.playAsync();
          alarmSoundRef.current = sound;
          return;
        } catch {
          continue;
        }
      }

      throw new Error('No playable alarm source found.');
    } catch (error) {
      console.log('Alarm sound unavailable:', error);
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
    emergencyContacts,
    smsSent,
    pushSent,
    powerMode,
    battery,
    lastAlertTime,
    smsPerAlert,
    systemLocation,
  });

  const applyPersistedDashboardState = (state: any) => {
    if (Array.isArray(state?.sensors)) setSensors(state.sensors);
    if (typeof state?.isArmed === 'boolean') setIsArmed(state.isArmed);
    if (Array.isArray(state?.activities)) setActivities(state.activities);
    if (Array.isArray(state?.emergencyContacts)) setEmergencyContacts(state.emergencyContacts);
    if (typeof state?.smsSent === 'number') setSmsSent(state.smsSent);
    if (typeof state?.pushSent === 'number') setPushSent(state.pushSent);
    if (typeof state?.powerMode === 'string') setPowerMode(state.powerMode);
    if (typeof state?.battery === 'number') setBattery(state.battery);
    if (typeof state?.lastAlertTime === 'string') setLastAlertTime(state.lastAlertTime);
    if (typeof state?.smsPerAlert === 'number') setSmsPerAlert(state.smsPerAlert);
    if (typeof state?.systemLocation === 'string') setSystemLocation(state.systemLocation);
  };

  const saveDashboardStateToBackend = async (stateOverride?: any) => {
    if (!token) {
      return;
    }

    try {
      await fetch(`${API_BASE_URL}/state`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ state: stateOverride || getPersistedDashboardState() }),
      });
    } catch {
      // Intentionally ignore temporary connectivity issues.
    }
  };

  const loadDashboardStateFromBackend = async () => {
    if (!token) {
      isStateLoadedRef.current = false;
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/state`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const payload = await response.json();
        applyPersistedDashboardState(payload.state);
      }
    } catch {
      // Ignore load failures and keep current local defaults.
    } finally {
      isStateLoadedRef.current = true;
    }
  };

  const handleLogout = async () => {
    await saveDashboardStateToBackend(getPersistedDashboardState());
    logout();
    router.replace('/login');
  };

  const handleSimulate = async () => {
    setIsAlertActive(true);
    const timestamp = new Date().toLocaleTimeString();
    setLastAlertTime(timestamp);

    await startAlarmSound();

    const enabledContacts = emergencyContacts.filter(contact => contact.enabled);
    
    setSensors([
      { id: 2, kind: 'fire', name: 'Fire Sensor', value: 95, unit: '%', status: getSensorStatus('fire', 95), module: 'IR Fire Module' },
      { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 450, unit: 'ppm', status: getSensorStatus('smoke', 450), module: 'MQ-2/MQ-135' },
      { id: 3, kind: 'heat', name: 'Heat Sensor', value: 75.2, unit: '°C', status: getSensorStatus('heat', 75.2), module: 'DHT22' },
    ]);

    const newNotifications = [
      { time: timestamp, type: 'local', message: 'Local LED + Buzzer activated' },
      ...enabledContacts.map(contact => ({
        time: timestamp,
        type: 'sms',
        message: `SMS sent to ${contact.name}`,
      })),
      { time: timestamp, type: 'push', message: 'Push notification sent via Firebase' },
    ];

    // Count SMS in this alert
    const smsCount = newNotifications.filter(n => n.type === 'sms').length;
    setSmsPerAlert(smsCount);

    setActivities([
      {
        id: createUniqueId(),
        time: timestamp,
        message: '🚨 FIRE ALERT TRIGGERED',
        type: 'alert',
        notifications: newNotifications,
      },
      ...activities,
    ]);

    setSmsSent(prev => prev + enabledContacts.length);
    setPushSent(prev => prev + 1);
  };

  const handleReset = () => {
    setIsAlertActive(false);
    processedSensorsRef.current.clear();
    void stopAlarmSound();
    setSensors([
      { id: 2, kind: 'fire', name: 'Fire Sensor', value: 0, unit: '%', status: getSensorStatus('fire', 0), module: 'IR Fire Module' },
      { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'ppm', status: getSensorStatus('smoke', 1), module: 'MQ-2/MQ-135' },
      { id: 3, kind: 'heat', name: 'Heat Sensor', value: 22.5, unit: '°C', status: getSensorStatus('heat', 22.5), module: 'DHT22' },
    ]);
    setSmsSent(0);
    setPushSent(0);
    setSmsPerAlert(0);
    setLastAlertTime('No alerts');
    setActivities([{ id: 1, time: '12:25:11 AM', message: 'No alerts. System operating normally.', type: 'normal' }]);
  };

  const handleStopAlert = () => {
    setIsAlertActive(false);
    processedSensorsRef.current.clear();
    void stopAlarmSound();
    // Reset sensors to normal state
    setSensors([
      { id: 2, kind: 'fire', name: 'Fire Sensor', value: 0, unit: '%', status: getSensorStatus('fire', 0), module: 'IR Fire Module' },
      { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'ppm', status: getSensorStatus('smoke', 1), module: 'MQ-2/MQ-135' },
      { id: 3, kind: 'heat', name: 'Heat Sensor', value: 22.5, unit: '°C', status: getSensorStatus('heat', 22.5), module: 'DHT22' },
    ]);
  };

  const handleAddContact = () => {
    if (contactInput.name && contactInput.phone) {
      if (editingId) {
        setEmergencyContacts(prev =>
          prev.map(c => c.id === editingId ? { ...c, name: contactInput.name, phone: contactInput.phone } : c)
        );
      } else {
        setEmergencyContacts(prev => [
          ...prev,
          { id: Date.now() + Math.floor(Math.random() * 1000), name: contactInput.name, phone: contactInput.phone, enabled: true, warningSmsEnabled: false }
        ]);
      }
      setContactInput({ name: '', phone: '' });
      setEditingId(null);
      setShowContactModal(false);
    }
  };

  const handleDeleteContact = (id: string | number) => {
    setEmergencyContacts(prev => prev.filter(c => c.id !== id));
  };

  const handleToggleWarningSms = (id: string | number) => {
    setEmergencyContacts(prev => 
      prev.map(c => c.id === id ? { ...c, warningSmsEnabled: !c.warningSmsEnabled } : c)
    );
  };

  // WARNING: Send SMS only to selected contacts
  useEffect(() => {
    if (!isArmed) {
      return;
    }

    const warningSensors = sensors.filter(sensor => sensor.status === 'warning');
    
    warningSensors.forEach(sensor => {
      const sensorKey = `${sensor.id}-warning`;
      if (processedSensorsRef.current.has(sensorKey)) {
        return;
      }
      
      processedSensorsRef.current.add(sensorKey);
      
      const timestamp = new Date().toLocaleTimeString();
      const warningContacts = emergencyContacts.filter(contact => contact.warningSmsEnabled);
      const smsMessage = generateSMSMessage(sensor, 'warning', systemLocation);

      if (warningContacts.length > 0) {
        setSmsPerAlert(warningContacts.length);
        setSmsSent(prev => prev + warningContacts.length);
        setActivities(prev => ([
          {
            id: createUniqueId(),
            time: timestamp,
            message: `⚠️ WARNING: ${sensor.name} elevated`,
            type: 'alert',
            notifications: warningContacts.map(contact => ({
              time: timestamp,
              type: 'sms',
              message: `SMS to ${contact.name}: ${smsMessage}`,
            })),
          },
          ...prev,
        ]));
      } else {
        setActivities(prev => ([
          {
            id: createUniqueId(),
            time: timestamp,
            message: `⚠️ WARNING: ${sensor.name} elevated (No SMS contacts selected)`,
            type: 'alert',
            notifications: [],
          },
          ...prev,
        ]));
      }
    });
  }, [sensors, isArmed, emergencyContacts]);

  // CRITICAL: Trigger alarm + SMS
  useEffect(() => {
    if (!isArmed) {
      return;
    }

    const criticalSensors = sensors.filter(sensor => sensor.status === 'critical');
    
    criticalSensors.forEach(sensor => {
      const sensorKey = `${sensor.id}-critical`;
      if (processedSensorsRef.current.has(sensorKey)) {
        return;
      }
      
      processedSensorsRef.current.add(sensorKey);
      
      const timestamp = new Date().toLocaleTimeString();
      const enabledContacts = emergencyContacts.filter(contact => contact.enabled);
      const smsMessage = generateSMSMessage(sensor, 'critical', systemLocation);

      // Trigger alarm
      setIsAlertActive(true);
      setLastAlertTime(timestamp);
      
      void startAlarmSound();

      setSmsPerAlert(enabledContacts.length);
      setSmsSent(prev => prev + enabledContacts.length);
      setPushSent(prev => prev + 1);
      setActivities(prev => ([
        {
          id: createUniqueId(),
          time: timestamp,
          message: `🚨 CRITICAL ALERT: ${sensor.name} - EVACUATE NOW`,
          type: 'alert',
          notifications: [
            { time: timestamp, type: 'local', message: 'Local LED + Buzzer activated' },
            ...enabledContacts.map(contact => ({
              time: timestamp,
              type: 'sms',
              message: `SMS to ${contact.name}: ${smsMessage}`,
            })),
            { time: timestamp, type: 'push', message: 'Push notification sent via Firebase' },
          ],
        },
        ...prev,
      ]));
    });
  }, [sensors, isArmed, emergencyContacts]);

  useEffect(() => {
    if (isAlertActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 600, useNativeDriver: false }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [isAlertActive]);

  useEffect(() => {
    return () => {
      void stopAlarmSound();
    };
  }, []);

  useEffect(() => {
    void loadDashboardStateFromBackend();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [token]);

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
    emergencyContacts,
    smsSent,
    pushSent,
    powerMode,
    battery,
    lastAlertTime,
    smsPerAlert,
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
                <Text style={styles.subtitle3}>ESP32 + Arduino IoT Cloud</Text>
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
                    width: sensor.id === 3 ? '100%' : '48%',
                    marginRight: sensor.id === 3 || idx === 1 ? 0 : '4%',
                  },
                  isAlertActive && sensor.status === 'critical' && {
                    borderColor: '#ff4444',
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                  },
                ]}
              >
                <View style={styles.sensorHeader}>
                  <Text style={styles.sensorName}>{sensor.name}</Text>
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
                  <Text style={styles.sensorUnit}>{sensor.unit}</Text>
                </View>

                <View style={styles.sensorDivider} />

                <View style={styles.sensorFooter}>
                  <Text style={styles.moduleText}>{sensor.module}</Text>
                  <Text
                    style={[
                      styles.statusText,
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
              {activities.length > 0 && activities.slice(0, 1).map((activity) => (
                <View key={activity.id} style={styles.activityItem}>
                  {activity.type === 'alert' ? (
                    <>
                      <Text style={styles.activityTime}>{activity.time}</Text>
                      <Text style={styles.activityAlert}>{activity.message}</Text>
                      <View style={styles.notificationsList}>
                        {activity.notifications?.map((notif, idx) => (
                          <View key={idx} style={styles.notificationItem}>
                            <Text style={styles.notificationIcon}>
                              {notif.type === 'local' ? '🔊' : notif.type === 'sms' ? '📱' : '📲'}
                            </Text>
                            <Text style={styles.notificationText}>{notif.message}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.activityTime}>{activity.time}</Text>
                      <Text style={styles.activityMessage}>{activity.message}</Text>
                    </>
                  )}
                </View>
              ))}
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

            <TouchableOpacity
              style={[styles.buttonSimulate, { paddingVertical: responsive.buttonPaddingVertical }, isAlertActive && styles.buttonDisabled]}
              onPress={handleSimulate}
              disabled={isAlertActive}
            >
              <Text style={[styles.buttonSimulateText, { fontSize: responsive.isMobile ? 12 : 14 }]}>Simulate Fire</Text>
            </TouchableOpacity>

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
                <Text style={styles.statLabel}>Power Mode:</Text>
                <Text style={styles.statValue}>{powerMode}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>SMS per Alert:</Text>
                <Text style={styles.statValue}>{smsPerAlert}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Last Alert:</Text>
                <Text style={styles.statValue}>{lastAlertTime}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Battery:</Text>
                <Text style={styles.statValue}>{battery}%</Text>
              </View>
            </View>
          </View>

          <Text style={styles.footer}>Fire Alert System v2.0 • Powered by Expo + Arduino IoT Cloud</Text>
        </ScrollView>

        {/* Contact Modal - For Settings */}
        {showContactsInSettings && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.contactsModalHeader}>
                <Text style={styles.modalTitle}>Emergency Contacts</Text>
                <TouchableOpacity onPress={() => {
                  setShowContactsInSettings(false);
                  setShowContactModal(false);
                  setContactInput({ name: '', phone: '' });
                  setEditingId(null);
                }}>
                  <Text style={styles.modalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {!showContactModal ? (
                <>
                  <ScrollView style={styles.contactsListScroll}>
                    {emergencyContacts.map((contact) => (
                      <View key={contact.id} style={styles.contactItemModal}>
                        <View style={styles.contactInfo}>
                          <Text style={styles.contactName}>{contact.name}</Text>
                          <Text style={styles.contactPhone}>{contact.phone}</Text>
                          <View style={styles.contactWarningRow}>
                            <Text style={styles.contactWarningLabel}>Send WARNING SMS:</Text>
                            <Switch
                              value={contact.warningSmsEnabled}
                              onValueChange={() => handleToggleWarningSms(contact.id)}
                              trackColor={{ false: '#333', true: '#ffa500' }}
                              thumbColor={contact.warningSmsEnabled ? '#ff9500' : '#666'}
                            />
                          </View>
                        </View>
                        <View style={styles.contactActions}>
                          <TouchableOpacity
                            onPress={() => {
                              setContactInput({ name: contact.name, phone: contact.phone });
                              setEditingId(contact.id);
                              setShowContactModal(true);
                            }}
                            style={styles.editBtn}
                          >
                            <Text style={styles.editBtnText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteContact(contact.id)}
                            style={styles.deleteBtnModal}
                          >
                            <Text style={styles.deleteBtnText}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.addContactModalBtn}
                    onPress={() => {
                      setContactInput({ name: '', phone: '' });
                      setEditingId(null);
                      setShowContactModal(true);
                    }}
                  >
                    <Text style={styles.addContactModalBtnText}>+ Add Contact</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., Fire Department"
                      placeholderTextColor="#666"
                      value={contactInput.name}
                      onChangeText={(text) => setContactInput(prev => ({ ...prev, name: text }))}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Phone Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="+1-800-555-0000"
                      placeholderTextColor="#666"
                      value={contactInput.phone}
                      onChangeText={(text) => setContactInput(prev => ({ ...prev, phone: text }))}
                    />
                  </View>

                  <View style={styles.modalButtonGroup}>
                    <TouchableOpacity style={styles.modalButtonSave} onPress={() => {
                      handleAddContact();
                      setShowContactModal(false);
                    }}>
                      <Text style={styles.modalButtonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalButtonCancel}
                      onPress={() => {
                        setShowContactModal(false);
                        setContactInput({ name: '', phone: '' });
                        setEditingId(null);
                      }}
                    >
                      <Text style={styles.modalButtonCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

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
                    <View key={activity.id} style={styles.historyItem}>
                      <Text style={styles.historyTime}>{activity.time}</Text>
                      <Text style={styles.historyMessage}>{activity.message}</Text>
                      {activity.notifications && (
                        <View style={styles.historyNotifications}>
                          {activity.notifications.map((notif, idx) => (
                            <Text key={idx} style={styles.historyNotification}>
                              {notif.type === 'local' ? '🔊' : notif.type === 'sms' ? '📱' : '📲'} {notif.message}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  ))
                ) : (
                  <Text style={styles.noHistoryText}>No alerts recorded</Text>
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Settings Modal */}
        {showSettings && !showContactsInSettings && (
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
                  setLocationInput(systemLocation);
                  setShowLocationModal(true);
                }}
              >
                <Text style={styles.settingsMenuItemText}>Location</Text>
                <Text style={styles.settingsMenuItemSubtext}>{systemLocation}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.settingsMenuItem}
                onPress={() => setShowContactsInSettings(true)}
              >
                <Text style={styles.settingsMenuItemText}>Emergency Contacts</Text>
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

        {/* Location Configuration Modal */}
        {showLocationModal && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.contactsModalHeader}>
                <Text style={styles.modalTitle}>Set Location</Text>
                <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                  <Text style={styles.modalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location / Address</Text>
                <TextInput
                  style={[styles.input, { height: 80 }]}
                  placeholder="e.g., Building A, 123 Main St, Floor 2, Room 201"
                  placeholderTextColor="#666"
                  value={locationInput}
                  onChangeText={setLocationInput}
                  multiline
                />
                <Text style={styles.inputHint}>This location will appear in all SMS alerts</Text>
              </View>

              <View style={styles.modalButtonGroup}>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={() => {
                    if (locationInput.trim()) {
                      setSystemLocation(locationInput.trim());
                    }
                    setShowLocationModal(false);
                  }}
                >
                  <Text style={styles.modalButtonText}>Save Location</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setShowLocationModal(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  emailText: {
    fontSize: 11,
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
    fontSize: 18,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 13,
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
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle1: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  subtitle2: {
    fontSize: 11,
    color: '#999',
  },
  subtitle3: {
    fontSize: 10,
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
    fontSize: 12,
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
    padding: 12,
    marginBottom: 12,
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
    fontSize: 24,
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
    fontSize: 9,
    color: '#999',
  },
  statusText: {
    fontSize: 8,
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
    fontSize: 18,
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  timestamp: {
    fontSize: 10,
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
  activityItem: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  activityTime: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  activityMessage: {
    fontSize: 13,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  armSublabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  buttonSimulate: {
    backgroundColor: '#ff9500',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonSimulateText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 12,
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
    fontSize: 20,
    color: '#ff6b6b',
    fontWeight: 'bold',
  },
  fullHistoryList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  historyItem: {
    backgroundColor: 'rgba(38, 30, 46, 0.8)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff8c42',
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
