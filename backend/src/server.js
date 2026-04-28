const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const DEVICE_API_KEY = process.env.DEVICE_API_KEY || 'dev-device-key';
const ENABLE_FIRESTORE_SYNC = process.env.ENABLE_FIRESTORE_SYNC === 'true';

// Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

let emailTransporter = null;

const initializeEmailTransporter = () => {
  if (emailTransporter) {
    return emailTransporter;
  }

  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('Email credentials not configured. OTP will be logged to console only.');
    return null;
  }

  try {
    emailTransporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_PORT === 465,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
      },
    });
    console.log('Email transporter initialized successfully');
    return emailTransporter;
  } catch (error) {
    console.warn('Failed to initialize email transporter:', error.message);
    return null;
  }
};

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
    if (admin.apps.length === 0) {
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
        // Use environment variables for service account
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
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      } else {
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '../serviceAccountKey.json');
        const resolvedPath = path.resolve(serviceAccountPath);
        const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
    }

    firestoreAdminDb = admin.firestore();
    return firestoreAdminDb;
  } catch (error) {
    console.warn('Firestore Admin init failed. Telemetry will stay local only.', error.message);
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
  smoke: { warning: 1200, critical: 1600 },
  temperature: { warning: 38, critical: 55 },
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
  const firePercentDirect = toFiniteNumber(payload.firePercent ?? payload.fire ?? payload.fire_value);
  const smokePercentDirect = toFiniteNumber(payload.smokePercent ?? payload.smokePpm ?? payload.smoke_value);
  const heatDirect = toFiniteNumber(payload.heatC ?? payload.heat ?? payload.temperature ?? payload.tempC);

  const fireAnalog = toFiniteNumber(payload.fireAnalog ?? payload.flameRaw ?? payload.flameAnalog);
  const smokeAnalog = toFiniteNumber(payload.smokeAnalog ?? payload.smoke ?? payload.mq2Raw ?? payload.mq135Raw);
  const digitalFire = toBoolean(payload.fireDigital ?? payload.flameDetected ?? payload.flameDigital);

  let firePercent = null;
  // Priority: fireAnalog > digitalFire > firePercentDirect
  if (fireAnalog != null) {
    // Many flame sensors are inverse: lower analog means stronger flame signal.
    firePercent = ((4095 - clamp(fireAnalog, 0, 4095)) / 4095) * 100;
  } else if (digitalFire != null) {
    firePercent = digitalFire ? 100 : 0;
  } else if (firePercentDirect != null) {
    firePercent = firePercentDirect;
  }

  let smokePercent = smokePercentDirect;
  let smokeRaw = smokeAnalog; // Keep raw value for dashboard
  if (smokePercent == null && smokeAnalog != null) {
    // Map raw MQ analog values to a simple 0..100 smoke intensity scale.
    smokePercent = (clamp(smokeAnalog, 0, 4095) / 4095) * 100;
  }

  const heatC = heatDirect;

  if (firePercent == null && smokePercent == null && heatC == null) {
    return null;
  }

  return {
    fire: firePercent == null ? null : clamp(firePercent, 0, 100),
    smoke: smokeRaw == null ? null : clamp(smokeRaw, 0, 4095), // Send raw value
    heat: heatC == null ? null : clamp(heatC, -20, 120),
    deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : 'unknown-device',
    receivedAt: new Date().toISOString(),
  };
};

const applyTelemetryToSensors = (existingSensors, telemetry) => {
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

  // Apply combined fire detection logic
  const combinedStatus = getCombinedFireStatus(updatedSensors);
  
  // Update fire sensor status based on combined logic
  return updatedSensors.map((sensor) => {
    if (sensor.kind === 'fire' && combinedStatus !== 'normal') {
      return {
        ...sensor,
        status: combinedStatus,
      };
    }
    return sensor;
  });
};

let latestHardwareTelemetry = null;

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

const requireAuth = (req, res, next) => {
  const token = getTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  const email = sessions.get(token);
  if (!email || !users[email]) {
    return res.status(401).json({ message: 'Invalid session.' });
  }

  req.userEmail = email;
  return next();
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fire-alert-auth-api' });
});

app.post('/auth/register', (req, res) => {
  console.log('[Backend Register] Attempting registration for email:', req.body.email);
  console.log('[Backend Register] Current users in memory:', Object.keys(users));

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

  if (users[email]) {
    console.log('[Backend Register] Email already exists in users:', users[email]);
    return res.status(409).json({ message: 'Email already registered.' });
  }

  const user = {
    id: Math.random().toString(36).slice(2, 11),
    email,
    name,
    password,
  };

  users[email] = user;
  writeUsersStore(users);
  const token = createToken();
  sessions.set(token, email);

  console.log('[Backend Register] Registration successful for email:', email);
  console.log('[Backend Register] Total users after registration:', Object.keys(users));

  return res.status(201).json({
    token,
    user: getSafeUser(user),
  });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  console.log('[Backend Login] Attempting login for email:', email);
  console.log('[Backend Login] Current users in memory:', Object.keys(users));

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = users[email];
  if (!user) {
    console.log('[Backend Login] Email not found in users:', email);
    return res.status(404).json({ message: 'Email not found.' });
  }

  console.log('[Backend Login] User found:', user.email);
  console.log('[Backend Login] Stored password:', user.password);
  console.log('[Backend Login] Provided password:', password);

  if (user.password !== password) {
    console.log('[Backend Login] Password mismatch');
    return res.status(401).json({ message: 'Incorrect password.' });
  }

  const token = createToken();
  sessions.set(token, email);

  console.log('[Backend Login] Login successful for email:', email);

  return res.json({
    success: true,
    token,
    user: getSafeUser(user),
  });
});

app.get('/auth/me', (req, res) => {
  const token = getTokenFromHeader(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  const email = sessions.get(token);
  if (!email) {
    return res.status(401).json({ message: 'Invalid session.' });
  }

  const user = users[email];
  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ message: 'Invalid session.' });
  }

  return res.json({ user: getSafeUser(user) });
});

app.post('/auth/logout', (req, res) => {
  const token = getTokenFromHeader(req.headers.authorization);
  if (token) {
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
  
  if (allTokens.length === 0) {
    const now = Date.now();
    if (now - lastNoTokenLogAt >= 60000) {
      console.log('No FCM tokens registered');
      lastNoTokenLogAt = now;
    }
    return;
  }

  const db = initializeFirestoreAdmin();
  if (!db) {
    console.error('[Push] Firebase Admin not initialized, cannot send FCM messages');
    return;
  }

  try {
    const messaging = admin.messaging();
    
    for (const token of allTokens) {
      const message = {
        notification: {
          title: '🚨 FIRE ALERT - EVACUATE NOW',
          body: `CRITICAL: ${sensorData.name} at ${sensorData.value}${sensorData.unit} — Location: ${location || 'Unknown'}`,
        },
        data: {
          type: 'fire_alert',
          sensor: sensorData.name,
          value: sensorData.value.toString(),
          unit: sensorData.unit,
          location: location || 'Unknown',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'fire-alert',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        webpush: {
          headers: {
            TTL: '60',
          },
        },
      };

      try {
        const response = await messaging.send(message);
        console.log(`[Push] FCM message sent to token ${token.slice(0, 20)}...: ${response}`);
      } catch (error) {
        console.error(`[Push] Failed to send FCM message to token ${token.slice(0, 20)}...`, error.message);
      }
    }
  } catch (error) {
    console.error('[Push] Failed to send FCM notifications:', error.message);
  }
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

  // Try to send email
  const transporter = initializeEmailTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: EMAIL_FROM,
        to: email,
        subject: 'Fire Alert System - OTP Verification',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ff6b6b;">Fire Alert System</h2>
            <p>Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p>This code will expire in 5 minutes.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
          </div>
        `,
      });
      console.log(`OTP email sent to ${email}`);
      return res.json({ 
        success: true, 
        message: 'OTP sent to your email',
      });
    } catch (error) {
      console.error('Failed to send email:', error.message);
      // If email sending fails, the email is likely invalid
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email address. Please use a real email address.' 
      });
    }
  } else {
    // Log to console if email not configured
    console.log(`OTP for ${email}: ${otp}`);
    return res.json({ 
      success: true, 
      message: 'OTP sent to your email',
      // Only for development - remove in production
      otp: otp 
    });
  }
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
  store[req.userEmail] = {
    ...incomingState,
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

  // Update current persisted users so newly opened dashboards get fresh sensor values.
  const store = readStateStore();
  const emails = Object.keys(store);
  let lastSensorsSnapshot = null;
  for (const email of emails) {
    const current = store[email] || getDefaultDashboardState();
    const nextSensors = applyTelemetryToSensors(current.sensors, telemetry);
    store[email] = {
      ...current,
      sensors: nextSensors,
      updatedAt: telemetry.receivedAt,
    };
    lastSensorsSnapshot = nextSensors;

    // Check for critical fire and send FCM notification
    const fireSensor = nextSensors.find(s => s.kind === 'fire');
    if (fireSensor && (fireSensor.status === 'critical' || fireSensor.status === 'warning')) {
      await sendFireAlertNotification(fireSensor, current.systemLocation);
    }
  }
  writeStateStore(store);

  await syncTelemetryToFirestore(
    telemetry,
    lastSensorsSnapshot || applyTelemetryToSensors(getDefaultDashboardState().sensors, telemetry)
  );

  return res.json({
    success: true,
    telemetry,
  });
});

app.get('/hardware/latest', (_req, res) => {
  const telemetry = latestHardwareTelemetry;

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

app.listen(PORT, () => {
  console.log(`Auth API running on http://localhost:${PORT}`);
});
