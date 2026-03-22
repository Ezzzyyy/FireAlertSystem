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
