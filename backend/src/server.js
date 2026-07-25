require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const axios = require('axios');
const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');

console.log('[Server] Starting... Checking Firebase env vars');
console.log('[Server] FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING');
console.log('[Server] FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'MISSING');
console.log('[Server] FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING');

// Initialize Firebase Admin immediately at startup
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    };
    console.log('[Firebase] Initializing with env variables. Project:', serviceAccount.project_id);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[Firebase] Admin initialized successfully');
  } else {
    console.error('[Firebase] Missing required environment variables for Firebase initialization');
  }
} catch (error) {
  console.error('[Firebase] Failed to initialize:', error.message);
}

const app = express();
const PORT = process.env.PORT || 4000;
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || 'dev-device-key';
const ENABLE_FIRESTORE_SYNC = process.env.ENABLE_FIRESTORE_SYNC === 'true';

// MailerSend configuration
const MAILERSEND_API_KEY = process.env.MAILERSEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'MS_Ow1o4v@trial-z86org8on7wgew13.mlsender.net';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Fire Alert System';

let mailerSend = null;
if (MAILERSEND_API_KEY) {
  mailerSend = new MailerSend({ apiKey: MAILERSEND_API_KEY });
  console.log('[Email] MailerSend initialized successfully');
} else {
  console.warn('[Email] MailerSend API key not configured. OTP will be logged to console only.');
}

const validateEmailWithAPI = async (email) => {
  // List of common disposable email domains
  const disposableDomains = [
    'tempmail.com', 'guerrillamail.com', 'mailinator.com', '10minutemail.com',
    'throwawaymail.com', 'getairmail.com', 'yopmail.com', 'maildrop.cc',
    'sharklasers.com', 'guerrillamailblock.com', 'fakeinbox.com', 'temp-mail.org',
    'trashmail.com', 'spam4.me', 'meltmail.com', 'mytemp.email',
    'tempmail.net', 'tempmail.de', 'tempmail.co', 'tempmail.io',
    'mailtemp.com', 'mailtemp.org', 'mailtemp.net', 'temp-mail.ru',
    'temp-mail.io', 'temp-mail.com', 'temp-mail.net', 'temp-mail.org',
    '20minutemail.com', 'getnada.com', 'mail2web.com', 'hushmail.com',
    'inboxdesign.me', 'anonymbox.com', 'trashemail.com', 'tempmaildemo.com',
    'temporaryemail.com', 'tempemail.net', 'tempemail.co', 'tempemail.org',
    'emailtemp.com', 'emailtemp.org', 'emailtemp.net', 'emailtemp.co',
    'mytempmail.com', 'mytempmail.net', 'mytempmail.org', 'mytempmail.co',
    'tempmailaddress.com', 'tempmailaddress.net', 'tempmailaddress.org',
    'tempmailaddress.co', 'emailtempaddress.com', 'emailtempaddress.net',
    'emailtempaddress.org', 'emailtempaddress.co', 'temporarymail.com',
    'temporarymail.net', 'temporarymail.org', 'temporarymail.co',
    'disposablemail.com', 'disposablemail.net', 'disposablemail.org',
    'disposablemail.co', 'throwawayemail.com', 'throwawayemail.net',
    'throwawayemail.org', 'throwawayemail.co', 'fakeemail.com', 'fakeemail.net',
    'fakeemail.org', 'fakeemail.co', 'tempemailaddress.com', 'tempemailaddress.net',
    'tempemailaddress.org', 'tempemailaddress.co', 'mytrashmail.com',
    'mytrashmail.net', 'mytrashmail.org', 'mytrashmail.co', 'trashmailer.com',
    'trashmailer.net', 'trashmailer.org', 'trashmailer.co', 'tempinbox.com',
    'tempinbox.net', 'tempinbox.org', 'tempinbox.co', 'inboxtemp.com',
    'inboxtemp.net', 'inboxtemp.org', 'inboxtemp.co', 'mailtempinbox.com',
    'mailtempinbox.net', 'mailtempinbox.org', 'mailtempinbox.co',
  ];

  const domain = email.split('@')[1]?.toLowerCase();
  
  if (disposableDomains.includes(domain)) {
    return { valid: false, message: 'Disposable email addresses are not allowed' };
  }

  return { valid: true, message: 'Email passed basic validation' };
};

let firestoreAdminDb = null;
let firestoreUnavailable = false;

const initializeFirestoreAdmin = () => {
  if (firestoreUnavailable) {
    return null;
  }

  if (firestoreAdminDb) {
    return firestoreAdminDb;
  }

  try {
    // Firebase Admin should already be initialized at startup
    if (admin.apps.length === 0) {
      console.warn('[Firebase] Admin app not initialized. Firestore sync disabled.');
      firestoreUnavailable = true;
      return null;
    }

    firestoreAdminDb = admin.firestore();
    console.log('[Firebase] Firestore initialized successfully');
    return firestoreAdminDb;
  } catch (error) {
    console.error('[Firebase] Firestore init failed:', error.message);
    firestoreUnavailable = true;
    return null;
  }
};

const syncTelemetryToFirestore = async (telemetry, sensorsSnapshot) => {
  if (!ENABLE_FIRESTORE_SYNC) {
    return;
  }

  if (firestoreUnavailable) {
    return;
  }

  const db = initializeFirestoreAdmin();
  if (!db) {
    return;
  }

  const livePayload = {
    fire: telemetry.fire,
    smoke: telemetry.smoke,
    heat: telemetry.heat,
    deviceId: telemetry.deviceId,
    sensors: sensorsSnapshot,
    receivedAt: telemetry.receivedAt,
    source: 'backend-hardware-telemetry',
  };

  try {
    await db.collection('hardware').doc('liveTelemetry').set(livePayload, { merge: true });
    await db.collection('hardwareTelemetryHistory').add(livePayload);
  } catch (error) {
    console.warn('Failed to mirror telemetry to Firestore.', error.message);
    firestoreUnavailable = true;
    firestoreAdminDb = null;
  }
};

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'user-state.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');

// -------- Alert log helpers --------
const readAlertsStore = () => {
  try {
    if (!fs.existsSync(ALERTS_FILE)) return [];
    const raw = fs.readFileSync(ALERTS_FILE, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeAlertsStore = (alerts) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // Keep only the latest 100 alerts to avoid unbounded growth
    const trimmed = alerts.slice(0, 100);
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Alerts] Failed to persist alert log:', e.message);
  }
};

const appendAlert = (alertEntry) => {
  const alerts = readAlertsStore();
  alerts.unshift(alertEntry); // newest first
  writeAlertsStore(alerts);
};

const ensureStateStore = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
};

const ensureUsersStore = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
};

const readUsersStore = () => {
  ensureUsersStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeUsersStore = (users) => {
  ensureUsersStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
};

const readStateStore = () => {
  ensureStateStore();
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeStateStore = (store) => {
  ensureStateStore();
  fs.writeFileSync(STATE_FILE, JSON.stringify(store, null, 2), 'utf8');
};

const getDefaultDashboardState = () => ({
  sensors: [
    { id: 2, kind: 'fire', name: 'Fire Sensor', value: 0, unit: '%', status: 'normal', module: 'IR Fire Module' },
    { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: '%', status: 'normal', module: 'MQ-2/MQ-135' },
    { id: 3, kind: 'heat', name: 'Heat Sensor', value: 22.5, unit: '°C', status: 'normal', module: 'DHT22' },
  ],
  isArmed: true,
  activities: [],
  pushSent: 0,
  powerMode: 'Ultra-Low',
  battery: 85,
  lastAlertTime: 'No alerts',
  systemLocation: 'Your Building',
});

const SENSOR_THRESHOLDS = {
  fire: { warning: 65, critical: 85 },
  smoke: { warning: 1600, critical: 1800 },
  temperature: { warning: 38, critical: 45 },
};

// Sensor validation and filtering
const sensorHistory = new Map(); // Store last few readings for each sensor
const FIRE_DETECTION_DELAY = 3000; // 3 seconds
const SMOKE_MOVING_AVERAGE_WINDOW = 5;
const FIRE_FLICKER_DETECTION_WINDOW = 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return null;
};

// Sensor validation functions
const getMovingAverage = (sensorId, newValue, windowSize = SMOKE_MOVING_AVERAGE_WINDOW) => {
  const history = sensorHistory.get(sensorId) || [];
  const updatedHistory = [...history, newValue].slice(-windowSize);
  sensorHistory.set(sensorId, updatedHistory);
  return updatedHistory.reduce((sum, val) => sum + val, 0) / updatedHistory.length;
};

const detectFireFlicker = (sensorId, value) => {
  const history = sensorHistory.get(`${sensorId}_flicker`) || [];
  const updatedHistory = [...history, value > 0].slice(-FIRE_FLICKER_DETECTION_WINDOW);
  sensorHistory.set(`${sensorId}_flicker`, updatedHistory);
  
  // Check if we have both high and low values (flickering)
  const hasHigh = updatedHistory.includes(true);
  const hasLow = updatedHistory.includes(false);
  return hasHigh && hasLow;
};

const validateFireSensor = (sensorId, value) => {
  // Check if fire is detected continuously for at least 3 seconds
  const now = Date.now();
  const firstDetectionAt = sensorHistory.get(`${sensorId}_first_detection_at`) || 0;
  
  if (value > SENSOR_THRESHOLDS.fire.warning) {
    if (!firstDetectionAt) {
      sensorHistory.set(`${sensorId}_first_detection_at`, now);
      return false;
    }
    if (now - firstDetectionAt >= FIRE_DETECTION_DELAY) {
      return true;
    }
  } else {
    sensorHistory.set(`${sensorId}_first_detection_at`, 0);
  }
  
  return false;
};

const getCombinedFireStatus = (sensors) => {
  const fireSensor = sensors.find(s => s.kind === 'fire');
  const smokeSensor = sensors.find(s => s.kind === 'smoke');
  const heatSensor = sensors.find(s => s.kind === 'heat');
  
  if (!fireSensor || !smokeSensor || !heatSensor) {
    return 'normal';
  }
  
  const fireValid = validateFireSensor(fireSensor.id, fireSensor.value);
  const smokeAverage = getMovingAverage(smokeSensor.id, smokeSensor.value);
  const fireFlickering = detectFireFlicker(fireSensor.id, fireSensor.value);

  // Detection Logic
  if (fireValid && smokeAverage >= SENSOR_THRESHOLDS.smoke.critical) {
    return 'critical'; // CRITICAL FIRE
  } else if (smokeAverage >= SENSOR_THRESHOLDS.smoke.critical && heatSensor.value >= SENSOR_THRESHOLDS.temperature.warning) {
    return 'warning'; // FIRE WARNING
  } else if (fireValid && fireFlickering) {
    return 'verify'; // Possible false alarm, recheck
  }
  
  return 'normal';
};

const getCombinedFireStatusFromValues = (fireValue, smokeValue, heatValue) => {
  if (fireValue == null || smokeValue == null || heatValue == null) {
    return 'normal';
  }

  const fireValid = validateFireSensor(2, fireValue);
  const smokeAverage = getMovingAverage(1, smokeValue);
  const fireFlickering = detectFireFlicker(2, fireValue);

  if (fireValid && smokeAverage >= SENSOR_THRESHOLDS.smoke.critical) {
    return 'critical';
  }

  if (smokeAverage >= SENSOR_THRESHOLDS.smoke.critical && heatValue >= SENSOR_THRESHOLDS.temperature.warning) {
    return 'warning';
  }

  if (fireValid && fireFlickering) {
    return 'verify';
  }

  return 'normal';
};

const getSensorStatus = (kind, value) => {
  const threshold = SENSOR_THRESHOLDS[kind];
  if (!threshold) {
    return 'normal';
  }
  if (value >= threshold.critical) {
    return 'critical';
  }
  if (value >= threshold.warning) {
    return 'warning';
  }
  return 'normal';
};

const normalizeHardwareTelemetry = (payload) => {
  // Arduino sends:
  // fire: 0 or 100 (from flameDetected boolean)
  // flameDetected: true/false (digital flame sensor)
  // smoke: raw ADC value (0-4095)
  // heat: temperature in Celsius
  // deviceId: string

  const heatDirect = toFiniteNumber(payload.heatC ?? payload.heat ?? payload.temperature ?? payload.tempC);

  // Fire: prefer flameDetected boolean, fall back to fire percent
  const digitalFire = toBoolean(payload.flameDetected ?? payload.fireDigital ?? payload.flameDigital);
  const firePercentDirect = toFiniteNumber(payload.firePercent ?? payload.fire_value);

  let firePercent = null;
  if (digitalFire != null) {
    firePercent = digitalFire ? 100 : 0;
  } else if (firePercentDirect != null) {
    firePercent = firePercentDirect;
  }

  // Smoke: always treat payload.smoke as raw ADC value
  const smokeRaw = toFiniteNumber(payload.smoke ?? payload.smokeAnalog ?? payload.mq2Raw ?? payload.mq135Raw);

  const heatC = heatDirect;

  if (firePercent == null && smokeRaw == null && heatC == null) {
    return null;
  }

  return {
    fire: firePercent == null ? null : clamp(firePercent, 0, 100),
    smoke: smokeRaw == null ? null : clamp(smokeRaw, 0, 4095), // Raw ADC value (0-4095)
    heat: heatC == null ? null : clamp(heatC, -20, 120),
    deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : 'unknown-device',
    receivedAt: new Date().toISOString(),
  };
};

const applyTelemetryToSensors = (existingSensors, telemetry, combinedStatus = null) => {
  if (!Array.isArray(existingSensors)) {
    return existingSensors;
  }

  const updatedSensors = existingSensors.map((sensor) => {
    if (sensor.kind === 'fire' && telemetry.fire != null) {
      return {
        ...sensor,
        unit: '%',
        value: Number(telemetry.fire.toFixed(1)),
        status: getSensorStatus('fire', telemetry.fire),
      };
    }
    if (sensor.kind === 'smoke' && telemetry.smoke != null) {
      // Use direct smoke value (moving average disabled for debugging)
      const smokeValue = telemetry.smoke;
      return {
        ...sensor,
        unit: 'raw',
        value: Number(smokeValue.toFixed(1)),
        status: getSensorStatus('smoke', smokeValue),
      };
    }
    if (sensor.kind === 'heat' && telemetry.heat != null) {
      return {
        ...sensor,
        unit: '°C',
        value: Number(telemetry.heat.toFixed(1)),
        status: getSensorStatus('temperature', telemetry.heat),
      };
    }
    return sensor;
  });

  // Apply combined fire detection logic.
  const nextCombinedStatus = combinedStatus || 'normal';
  
  // Update fire sensor status based on combined logic
  return updatedSensors.map((sensor) => {
    if (sensor.kind === 'fire' && nextCombinedStatus !== 'normal') {
      return {
        ...sensor,
        status: nextCombinedStatus,
      };
    }
    return sensor;
  });
};

let latestHardwareTelemetry = null;
let lastAlertSentAt = 0;
const ALERT_COOLDOWN_MS = 5000; // Only send one alert every 5 seconds

// Store FCM tokens for push notifications. Support multiple devices per user.
const FCM_TOKENS_FILE = path.join(DATA_DIR, 'fcm-tokens.json');

const readFcmTokensStore = () => {
  try {
    if (!fs.existsSync(FCM_TOKENS_FILE)) return {};
    const raw = fs.readFileSync(FCM_TOKENS_FILE, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeFcmTokensStore = (store) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FCM_TOKENS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to persist FCM tokens:', e.message);
  }
};

// Load persisted tokens into memory on startup
const fcmTokensRaw = readFcmTokensStore(); // { email: [token1, token2] }
const fcmTokens = new Map(
  Object.entries(fcmTokensRaw).map(([email, tokens]) => [email, new Set(tokens)])
);
let lastNoTokenLogAt = 0;

const addFcmTokenForUser = (email, token) => {
  const existing = fcmTokens.get(email) || new Set();
  existing.add(token);
  fcmTokens.set(email, existing);
  // Persist to file
  const store = {};
  for (const [e, tokenSet] of fcmTokens.entries()) {
    store[e] = [...tokenSet];
  }
  writeFcmTokensStore(store);
};

const removeFcmTokensForUser = (email) => {
  fcmTokens.delete(email);
  // Persist to file
  const store = {};
  for (const [e, tokenSet] of fcmTokens.entries()) {
    store[e] = [...tokenSet];
  }
  writeFcmTokensStore(store);
};

const getAllFcmTokens = () => {
  const tokens = [];
  for (const tokenSet of fcmTokens.values()) {
    for (const token of tokenSet) {
      tokens.push(token);
    }
  }
  return tokens;
};

// Load users from file on startup
const users = readUsersStore();

const otpStore = new Map();

const sessions = new Map();

const createToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const getSafeUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
});

const getTokenFromHeader = (authorization) => {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice(7).trim();
};

const requireAuth = async (req, res, next) => {
  const token = getTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  const email = sessions.get(token);
  if (!email) {
    return res.status(401).json({ message: 'Invalid session.' });
  }

  try {
    // Verify user exists in Firebase
    await admin.auth().getUserByEmail(email);
    req.userEmail = email;
    return next();
  } catch (error) {
    console.error('[requireAuth] Error:', error.message);
    sessions.delete(token);
    return res.status(401).json({ message: 'Invalid session.' });
  }
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fire-alert-auth-api' });
});

app.post('/auth/register', async (req, res) => {
  console.log('[Backend Register] Attempting registration for email:', req.body.email);

  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Email, password, and name are required.' });
  }

  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ message: 'Please provide a valid email.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    // Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
      emailVerified: true, // Since we verified via OTP
    });

    console.log('[Backend Register] Firebase user created:', userRecord.uid);

    users[email] = {
      id: userRecord.uid,
      email: userRecord.email,
      name,
    };
    writeUsersStore(users);

    // Initialize user state with default values
    const store = readStateStore();
    if (!store[email]) {
      store[email] = getDefaultDashboardState();
      writeStateStore(store);
      console.log(`[Backend Register] Initialized state for new user: ${email}`);
    }

    // Create session token
    const token = createToken();
    sessions.set(token, email);

    console.log('[Backend Register] Registration successful for email:', email);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName,
      },
    });
  } catch (error) {
    console.error('[Backend Register] Error:', error.message);
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    return res.status(500).json({ message: 'Registration failed: ' + error.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  console.log('[Backend Login] Attempting login for email:', email);

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const apiKey = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAa43FeNlI9QZo7chKhXXAi4nR2-Cvz0A4';

    try {
      const response = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        email,
        password,
        returnSecureToken: true,
      });
    } catch (error) {
      const message = error.response?.data?.error?.message || 'Invalid credentials.';
      if (message === 'EMAIL_NOT_FOUND') {
        return res.status(404).json({ message: 'Email not found.' });
      }
      if (message === 'INVALID_PASSWORD') {
        return res.status(401).json({ message: 'Invalid password.' });
      }
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Get user from Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log('[Backend Login] Firebase user found:', userRecord.uid);

    // Note: Firebase Admin SDK cannot verify passwords directly
    // In a real-world scenario, you'd use Firebase Client SDK on the frontend
    // For this implementation, we trust that the user has the correct credentials
    // since they went through OTP verification during registration

    // Create session token
    const token = createToken();
    sessions.set(token, email);

    // Initialize user state if not exists
    const store = readStateStore();
    if (!store[email]) {
      store[email] = getDefaultDashboardState();
      writeStateStore(store);
      console.log(`[Backend Login] Initialized state for user: ${email}`);
    }

    console.log('[Backend Login] Login successful for email:', email);

    return res.json({
      success: true,
      token,
      user: {
        id: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName || email.split('@')[0],
      },
    });
  } catch (error) {
    console.error('[Backend Login] Error:', error.message);
    if (error.code === 'auth/user-not-found') {
      return res.status(404).json({ message: 'Email not found.' });
    }
    return res.status(401).json({ message: 'Invalid credentials.' });
  }
});

app.get('/auth/me', async (req, res) => {
  const token = getTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  const email = sessions.get(token);
  if (!email) {
    return res.status(401).json({ message: 'Invalid session.' });
  }

  try {
    // Get user from Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);
    
    return res.json({
      user: {
        id: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName || userRecord.email.split('@')[0],
      },
    });
  } catch (error) {
    console.error('[Backend /auth/me] Error:', error.message);
    // If user not found in Firebase, invalidate session
    sessions.delete(token);
    return res.status(401).json({ message: 'Invalid session.' });
  }
});

app.post('/auth/logout', (req, res) => {
  const token = getTokenFromHeader(req.headers.authorization);
  if (token) {
    const email = sessions.get(token);
    if (email) {
      removeFcmTokensForUser(email);
    }
    sessions.delete(token);
  }
  return res.json({ success: true });
});

app.post('/fcm/register', requireAuth, (req, res) => {
  const { fcmToken } = req.body || {};
  if (!fcmToken) {
    return res.status(400).json({ message: 'FCM token is required.' });
  }
  addFcmTokenForUser(req.userEmail, fcmToken);
  console.log(`FCM token registered for ${req.userEmail}: ${fcmToken}`);
  return res.json({ success: true });
});

// Public FCM register — allows token registration even after Render restarts wipe sessions
// Token is tied to email, email is passed in body
app.post('/fcm/register-public', async (req, res) => {
  const { fcmToken, email } = req.body || {};
  if (!fcmToken || !email) {
    return res.status(400).json({ message: 'FCM token and email are required.' });
  }
  // Verify email exists in Firebase
  try {
    await admin.auth().getUserByEmail(email);
  } catch {
    return res.status(401).json({ message: 'Invalid email.' });
  }
  addFcmTokenForUser(email, fcmToken);
  console.log(`[FCM Public] Token registered for ${email}: ${fcmToken}`);
  return res.json({ success: true });
});

// Test endpoint to manually trigger a push notification
app.post('/fcm/test', requireAuth, async (req, res) => {
  const allTokens = getAllFcmTokens();
  console.log(`[Push Test] Tokens available: ${allTokens.length}`, allTokens);
  if (allTokens.length === 0) {
    return res.status(400).json({ message: 'No FCM tokens registered. Open the app first to register.' });
  }
  await sendFireAlertNotification(
    { name: 'Fire Sensor', value: 90, unit: '%' },
    'Test Location'
  );
  return res.json({ success: true, tokenCount: allTokens.length });
});

const sendFireAlertNotification = async (sensorData, location) => {
  const allTokens = getAllFcmTokens();
  console.log(`[Push] Attempting to send alert. Total tokens: ${allTokens.length}`);
  console.log(`[Push] Location being sent: "${location}"`);

  if (allTokens.length === 0) {
    const now = Date.now();
    if (now - lastNoTokenLogAt >= 60000) {
      console.log('[Push] No FCM tokens registered');
      lastNoTokenLogAt = now;
    }
    return;
  }

  const title = '🚨 FIRE ALERT - EVACUATE NOW';
  const body = `CRITICAL: ${sensorData.name} at ${sensorData.value}${sensorData.unit} — Location: ${location || 'Unknown'}`;
  const data = {
    type: 'fire_alert',
    sensor: sensorData.name,
    value: String(sensorData.value),
    unit: sensorData.unit,
    location: location || 'Unknown',
    timestamp: new Date().toISOString(),
  };

  // Send via Firebase Admin SDK (FCM) directly — works for standalone APKs
  const sendResults = await Promise.allSettled(
    allTokens.map((token) =>
      admin.messaging().send({
        token,
        notification: { title, body },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'fire-alert',
            sound: 'default',
            priority: 'max',
            vibrateTimingsMillis: [0, 500, 250, 500, 250, 500],
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true,
            },
          },
        },
      })
    )
  );

  sendResults.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      console.log(`[Push] Token ${idx} sent successfully. Message ID: ${result.value}`);
    } else {
      console.error(`[Push] Token ${idx} failed:`, result.reason?.message || result.reason);
      // If token is invalid/expired, remove it
      const errCode = result.reason?.errorInfo?.code;
      if (
        errCode === 'messaging/invalid-registration-token' ||
        errCode === 'messaging/registration-token-not-registered'
      ) {
        const token = allTokens[idx];
        console.log(`[Push] Removing invalid token: ${token}`);
        for (const [email, tokenSet] of fcmTokens.entries()) {
          tokenSet.delete(token);
          if (tokenSet.size === 0) fcmTokens.delete(email);
        }
        // Persist updated tokens
        const store = {};
        for (const [e, tokenSet] of fcmTokens.entries()) {
          store[e] = [...tokenSet];
        }
        writeFcmTokensStore(store);
      }
    }
  });
};

const getAlertLocationLabel = (store) => {
  const locations = [...new Set(
    Object.values(store)
      .map((entry) => (typeof entry?.systemLocation === 'string' ? entry.systemLocation.trim() : ''))
      .filter(Boolean)
  )];

  if (locations.length === 1) {
    return locations[0];
  }

  if (locations.length > 1) {
    return 'Multiple monitored locations';
  }

  return 'Unknown Location';
};

app.post('/auth/send-otp', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ message: 'Please provide a valid email.' });
  }

  // Validate email with API/disposable domain check
  const validation = await validateEmailWithAPI(email);
  if (!validation.valid) {
    return res.status(400).json({ 
      success: false, 
      message: validation.message 
    });
  }

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store OTP with 5-minute expiry
  otpStore.set(email, {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  // Send email with MailerSend (HTTP API - no SMTP blocking)
  let emailSent = false;
  
  if (mailerSend) {
    try {
      const sentFrom = new Sender(EMAIL_FROM, EMAIL_FROM_NAME);
      const recipients = [new Recipient(email, email)];
      
      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo(recipients)
        .setSubject('Fire Alert System - OTP Verification')
        .setHtml(`
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ff6b6b;">Fire Alert System</h2>
            <p>Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p>This code will expire in 5 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
          </div>
        `);
      
      await mailerSend.email.send(emailParams);
      console.log(`[MailerSend] OTP email sent successfully to ${email}`);
      emailSent = true;
    } catch (error) {
      console.error('[MailerSend] Failed to send email:', error.message);
      if (error.body) {
        console.error('[MailerSend] Error details:', error.body);
      }
      emailSent = false;
    }
  }
  
  // Log to console only if email failed
  if (!emailSent) {
    console.log(`[DEV MODE] OTP for ${email}: ${otp}`);
  }
  
  return res.json({ 
    success: true, 
    message: emailSent ? 'OTP sent to your email' : 'OTP generated (check server logs)',
    otp: emailSent ? undefined : otp 
  });
});

app.post('/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body || {};

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  const storedOtp = otpStore.get(email);
  
  if (!storedOtp) {
    return res.status(400).json({ message: 'OTP not found or expired. Please request a new OTP.' });
  }

  if (Date.now() > storedOtp.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ message: 'OTP expired. Please request a new OTP.' });
  }

  if (storedOtp.otp !== otp) {
    return res.status(400).json({ message: 'Invalid OTP.' });
  }

  // OTP is valid, clear it
  otpStore.delete(email);

  return res.json({ success: true, message: 'OTP verified successfully.' });
});

// -------- Alert log endpoints --------
// Returns all backend-persisted alerts (works even if phone was off)
app.get('/alerts', requireAuth, (req, res) => {
  const alerts = readAlertsStore();
  return res.json({ alerts });
});

// Clear all alerts
app.delete('/alerts', requireAuth, (req, res) => {
  writeAlertsStore([]);
  return res.json({ success: true });
});

app.get('/state', requireAuth, (req, res) => {
  const store = readStateStore();
  const baseState = store[req.userEmail] || getDefaultDashboardState();
  const state = latestHardwareTelemetry
    ? {
        ...baseState,
        sensors: applyTelemetryToSensors(baseState.sensors, latestHardwareTelemetry),
      }
    : baseState;
  return res.json({ state });
});

app.get('/state/sensors', requireAuth, (req, res) => {
  const store = readStateStore();
  const baseState = store[req.userEmail] || getDefaultDashboardState();
  const sensors = latestHardwareTelemetry
    ? applyTelemetryToSensors(baseState.sensors, latestHardwareTelemetry)
    : baseState.sensors;
  return res.json({ sensors });
});

app.put('/state', requireAuth, (req, res) => {
  const incomingState = req.body?.state;
  if (!incomingState || typeof incomingState !== 'object') {
    return res.status(400).json({ message: 'state object is required.' });
  }

  const store = readStateStore();
  const existingState = store[req.userEmail] || getDefaultDashboardState();

  // Never let frontend overwrite live sensor data from hardware
  const { sensors: _ignoredSensors, ...safeIncomingState } = incomingState;

  store[req.userEmail] = {
    ...existingState,
    ...safeIncomingState,
    // Always keep latest hardware sensor data
    sensors: existingState.sensors,
    updatedAt: new Date().toISOString(),
  };
  writeStateStore(store);

  return res.json({ success: true });
});

app.post('/hardware/telemetry', async (req, res) => {
  const providedKey = req.headers['x-device-key'];
  if (providedKey !== DEVICE_API_KEY) {
    return res.status(401).json({ message: 'Invalid device key.' });
  }

  const telemetry = normalizeHardwareTelemetry(req.body || {});
  if (!telemetry) {
    return res.status(400).json({
      message: 'Telemetry payload must include at least one valid sensor value.',
    });
  }

  latestHardwareTelemetry = telemetry;

  const combinedStatus = getCombinedFireStatusFromValues(telemetry.fire, telemetry.smoke, telemetry.heat);

  // Apply telemetry to sensors using default state (for alert checking)
  const defaultSensors = getDefaultDashboardState().sensors;
  const nextSensorsDefault = applyTelemetryToSensors(defaultSensors, telemetry, combinedStatus);

  // Check for critical fire and send FCM notification (with cooldown to prevent spam)
  const now = Date.now();
  const fireSensor = nextSensorsDefault.find(s => s.kind === 'fire');
  const smokeSensor = nextSensorsDefault.find(s => s.kind === 'smoke');
  const heatSensor = nextSensorsDefault.find(s => s.kind === 'heat');

  const flameDetected = fireSensor && fireSensor.value >= 85;
  const smokeCritical = smokeSensor && smokeSensor.value >= SENSOR_THRESHOLDS.smoke.critical;
  const heatCritical = heatSensor && heatSensor.value >= SENSOR_THRESHOLDS.temperature.critical;

  const shouldAlert = flameDetected || (smokeCritical && heatCritical);

  console.log(`[Alert Check] flame=${flameDetected}, smoke=${smokeSensor?.value}, heat=${heatSensor?.value}, shouldAlert=${shouldAlert}`);
  console.log(`[Alert Check] FCM tokens registered: ${getAllFcmTokens().length}`);

  if (shouldAlert && now - lastAlertSentAt >= ALERT_COOLDOWN_MS) {
    const alertSensor = flameDetected ? fireSensor : smokeSensor;

    // Use a neutral location label if users monitor different locations.
    const store = readStateStore();
    const location = getAlertLocationLabel(store);

    console.log(`[Alert] TRIGGERING push notification! Sensor: ${alertSensor?.name}, Location: ${location}`);
    await sendFireAlertNotification(alertSensor, location);
    lastAlertSentAt = now;

    // Persist alert to backend log so app can load history even if phone was off
    appendAlert({
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date(now).toLocaleString(),
      date: new Date(now).toLocaleDateString(),
      timestamp: now,
      message: 'CRITICAL - LED + Buzzer',
      type: 'alert',
      location: location || 'Unknown',
      sensors: [
        { name: alertSensor?.name || 'Unknown', level: `${alertSensor?.value}${alertSensor?.unit}`, status: 'critical' }
      ],
      allSensors: [
        { kind: 'fire',  name: 'Fire Sensor',  value: telemetry.fire,  unit: '%',  status: flameDetected ? 'critical' : 'normal' },
        { kind: 'smoke', name: 'Smoke Sensor', value: telemetry.smoke, unit: 'raw', status: smokeCritical ? 'critical' : 'normal' },
        { kind: 'heat',  name: 'Heat Sensor',  value: telemetry.heat,  unit: '°C', status: heatCritical  ? 'critical' : 'normal' },
      ],
    });

    // Persist alert to backend log so app can load it even if phone was off
    appendAlert({
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date(now).toLocaleString(),
      date: new Date(now).toLocaleDateString(),
      timestamp: now,
      message: 'CRITICAL - LED + buzzer',
      type: 'alert',
      location: location || 'Unknown',
      sensors: [
        {
          name: alertSensor?.name || 'Unknown',
          level: `${alertSensor?.value}${alertSensor?.unit}`,
          status: 'critical',
        },
      ],
      telemetry: {
        fire: telemetry.fire,
        smoke: telemetry.smoke,
        heat: telemetry.heat,
        flameDetected: telemetry.flameDetected,
      },
    });
  }

  // Update persisted state for all registered users
  const store = readStateStore();
  const emails = Object.keys(store);
  let lastSensorsSnapshot = null;
  for (const email of emails) {
    const current = store[email] || getDefaultDashboardState();
    const nextSensors = applyTelemetryToSensors(current.sensors, telemetry, combinedStatus);
    store[email] = {
      ...current,
      sensors: nextSensors,
      updatedAt: telemetry.receivedAt,
    };
    lastSensorsSnapshot = nextSensors;
  }
  writeStateStore(store);

  await syncTelemetryToFirestore(
    telemetry,
    lastSensorsSnapshot || nextSensorsDefault
  );

  return res.json({
    success: true,
    telemetry,
  });
});

app.get('/hardware/latest', (_req, res) => {
  const telemetry = latestHardwareTelemetry;

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');

  return res.json({
    success: true,
    telemetry,
    sensors: telemetry
      ? applyTelemetryToSensors(getDefaultDashboardState().sensors, telemetry)
      : getDefaultDashboardState().sensors,
  });
});

// Keep process alive on malformed/aborted request bodies.
app.use((error, _req, res, next) => {
  if (!error) {
    return next();
  }

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload.' });
  }

  if (error.type === 'request.aborted') {
    console.warn('Request aborted by client while reading body.');
    return res.status(400).json({ message: 'Request aborted by client.' });
  }

  console.error('Unhandled server error:', error.message);
  return res.status(500).json({ message: 'Internal server error.' });
});

// Admin endpoint to view all registered users
app.get('/admin/users', (req, res) => {
  const apiKey = req.headers['x-admin-key'];
  if (apiKey !== DEVICE_API_KEY) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  const allUsers = Object.values(users).map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
  }));
  
  return res.json({ 
    success: true, 
    count: allUsers.length,
    users: allUsers 
  });
});

app.listen(PORT, () => {
  console.log(`Auth API running on http://localhost:${PORT}`);
});
