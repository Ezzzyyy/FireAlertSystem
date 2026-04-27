# Fire Alert System - React Native Expo

IoT-Powered Fire Detection & Response System mobile app built with React Native and Expo.

## Features

- **Real-time Sensor Monitoring**
  - Smoke Detection (ppm)
  - Light Detection (lux)
  - Sound Detection (dB)
  - Temperature Monitoring (°C)

- **System Dashboard**
  - Live sensor readings with status indicators
  - Visual representations for each sensor type
  - Responsive design optimized for mobile

- **Activity Logging**
  - Real-time system event tracking
  - Timestamped activity records
  - System status history

- **System Controls**
  - Armed/Disarmed toggle
  - Simulate fire alarm functionality
  - System reset capabilities
  - Power mode management

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager
- Expo Go app on your mobile device (iOS/Android)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Install backend API dependencies:
```bash
npm install --prefix backend
```

3. Start the backend API:
```bash
npm run api
```

4. Start the development server:
```bash
npm start
```

5. Open Expo Go on your mobile device and scan the QR code

### Available Scripts

- `npm start` - Start the development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS simulator
- `npm run web` - Run in web browser
- `npm run api` - Run local auth backend API

## Auth API + Session Persistence

- Mobile app auth now uses a local backend API (`backend/src/server.js`) instead of in-memory frontend-only users.
- Login/register sessions are persisted with AsyncStorage and restored on app launch.
- Backend endpoints:
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
  - `POST /auth/logout`

### API Base URL (important for mobile)

- Android emulator uses `http://10.0.2.2:4000`
- iOS simulator/web uses `http://localhost:4000`
- If using a physical phone, update `constants/api.ts` to your computer's LAN IP (example: `http://192.168.1.10:4000`).

## Hardware Telemetry (ESP32/Arduino)

The backend now accepts direct sensor data from your hardware and normalizes noisy readings.

If you are using Firebase as the single realtime source for the mobile app, write live telemetry to:

- Firestore document path: `hardware/liveTelemetry`

Accepted shape for app realtime update:

```json
{
  "fire": 32,
  "smoke": 120,
  "heat": 36.5,
  "receivedAt": "2026-04-22T10:35:00.000Z"
}
```

Or include a full `sensors` array matching dashboard sensor objects.

### Backend to Firestore bridge setup

The backend now mirrors each `POST /hardware/telemetry` into Firestore so all logged-in devices see realtime updates.

1. Install backend dependencies (already done in this repo):

```bash
npm install --prefix backend
```

2. Provide Firebase Admin credentials using either option:

- Option A: set `FIREBASE_SERVICE_ACCOUNT_PATH` to your service-account JSON file.
- Option B: set `GOOGLE_APPLICATION_CREDENTIALS` to your service-account JSON file.

3. Run backend:

```bash
npm run api
```

On success, hardware telemetry is mirrored to:

- `hardware/liveTelemetry` (realtime document used by the app)
- `hardwareTelemetryHistory` (historical log collection)

- Endpoint: `POST /hardware/telemetry`
- Header required: `x-device-key: <DEVICE_API_KEY>`
- Backend env var: `DEVICE_API_KEY` (default: `dev-device-key`)

Example payload from ESP32:

```json
{
  "deviceId": "esp32-main",
  "fireAnalog": 1020,
  "fireDigital": true,
  "smokeAnalog": 870,
  "heatC": 32.5
}
```

Supported fields are flexible to help recover from rewiring/recalibration:

- Fire: `firePercent` or `fireAnalog` or `fireDigital`
- Smoke: `smokePpm` or `smokeAnalog`
- Heat: `heatC` (or `temperature` / `tempC`)

Firmware starter file:

- `hardware/esp32_fire_alert/esp32_fire_alert.ino`

### Quick Wiring Recovery Checklist

1. Confirm sensor VCC/GND first before signal lines.
2. Keep analog signal lines short and avoid sharing noisy power rails.
3. Test raw serial readings for 2-3 minutes before enabling alerts.
4. If flame behavior is inverted, use `fireDigital` and calibrate analog later.
5. Set your LAN IP in firmware `API_URL` and make sure backend is running.

## Project Structure

```
.
├── app/                    # App screens and layout
├── components/             # Reusable UI components
├── constants/              # Theme and configuration
├── store/                  # State management (Zustand)
├── app.json               # Expo configuration
├── package.json           # Dependencies
└── index.js              # Entry point
```

## Components

- **SensorCard** - Individual sensor display with real-time readings
- **ActivityLog** - System activity timeline
- **SystemControl** - Control panel for system operations

## State Management

Uses [Zustand](https://github.com/pmndrs/zustand) for lightweight state management.

## Theme

Dark theme optimized for 24/7 monitoring with:
- Primary accent color: #ff9500 (orange)
- Secondary accent: #00d4ff (cyan)
- Background: #0f0f1e (dark)

## Features Implemented

✅ Responsive sensor dashboard
✅ Real-time data visualization
✅ Activity logging system
✅ System control interface
✅ Dark theme UI
✅ Auto-updating sensor values
✅ Status indicators
✅ Simulation functionality

## Future Enhancements

- Push notifications for alerts
- Cloud data sync
- Historical data charts
- Multiple location support
- Advanced filtering options
- Data export functionality

## License

Private - Internet of Things Project

## Author

BABY KWINI - IoT Team
