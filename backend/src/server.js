const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'user-state.json');

const ensureStateStore = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
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
    { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'ppm', status: 'normal', module: 'MQ-2/MQ-135' },
    { id: 3, kind: 'heat', name: 'Heat Sensor', value: 22.5, unit: '°C', status: 'normal', module: 'DHT22' },
  ],
  isArmed: true,
  activities: [
    { id: 1, time: '12:25:11 AM', message: 'No alerts. System operating normally.', type: 'normal' },
  ],
  emergencyContacts: [
    { id: 1, name: 'Emergency Services', phone: '+1-911-000-0000', enabled: true, warningSmsEnabled: false },
    { id: 2, name: 'Fire Department', phone: '+1-800-555-0000', enabled: true, warningSmsEnabled: true },
  ],
  smsSent: 0,
  pushSent: 0,
  powerMode: 'Ultra-Low',
  battery: 85,
  lastAlertTime: 'No alerts',
  smsPerAlert: 0,
  systemLocation: 'Your Building',
});

const users = {
};

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
  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ message: 'Please provide a valid email.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  if (users[email]) {
    return res.status(409).json({ message: 'Email already registered.' });
  }

  const user = {
    id: Math.random().toString(36).slice(2, 11),
    email,
    name,
    password,
  };

  users[email] = user;
  const token = createToken();
  sessions.set(token, email);

  return res.status(201).json({
    token,
    user: getSafeUser(user),
  });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = users[email];
  if (!user) {
    return res.status(404).json({ message: 'Email not found.' });
  }

  if (user.password !== password) {
    return res.status(401).json({ message: 'Incorrect password.' });
  }

  const token = createToken();
  sessions.set(token, email);

  return res.json({
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

app.get('/state', requireAuth, (req, res) => {
  const store = readStateStore();
  const state = store[req.userEmail] || getDefaultDashboardState();
  return res.json({ state });
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

app.listen(PORT, () => {
  console.log(`Auth API running on http://localhost:${PORT}`);
});
