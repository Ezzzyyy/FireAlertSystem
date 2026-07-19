# Sensor Matching Analysis: Arduino ↔ Backend ↔ Mobile App

## Overview
This document analyzes how sensor values flow from Arduino hardware through the backend to the mobile app dashboard.

---

## 🔴 CRITICAL MISMATCH FOUND: Smoke Sensor Unit

### Arduino Hardware (ESP32)
```cpp
// Sends RAW analog values (0-4095)
payload["smoke"] = smokeRaw;  // e.g., 900, 1200, etc.

// Thresholds in RAW values
const int SMOKE_WARNING_RAW = 900;
const int SMOKE_CRITICAL_RAW = 1200;
```

### Backend Server
```javascript
// ✅ CORRECTLY receives and stores RAW values
smoke: smokeRaw == null ? null : clamp(smokeRaw, 0, 4095), // Send raw value

// ✅ CORRECT thresholds for RAW values
smoke: { warning: 900, critical: 1200 },

// ✅ CORRECTLY applies to sensors
if (sensor.kind === 'smoke' && telemetry.smoke != null) {
  const smokeValue = telemetry.smoke;
  return {
    ...sensor,
    unit: 'raw',  // ✅ Correctly labeled as 'raw'
    value: Number(smokeValue.toFixed(1)),
    status: getSensorStatus('smoke', smokeValue),
  };
}
```

### Mobile App Dashboard
```typescript
// ❌ WRONG UNIT DISPLAYED - Shows 'ppm' instead of 'raw'
{ id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'ppm', ... }

// ❌ WRONG THRESHOLDS - Uses percentage thresholds for raw values
const SENSOR_THRESHOLDS: Record<SensorKind, { warning: number; critical: number }> = {
  smoke: { warning: 1200, critical: 1600 },  // ❌ Should be { warning: 900, critical: 1200 }
};
```

**ISSUE**: 
- Backend sends `unit: 'raw'` but mobile app hardcodes `unit: 'ppm'`
- Mobile app thresholds are **WRONG**: warning: 1200, critical: 1600
- Should be: warning: 900, critical: 1200 (matching Arduino)

---

## ✅ Fire Sensor - CORRECT

### Arduino → Backend → Mobile

| Component | Value Type | Unit | Thresholds | Status |
|-----------|-----------|------|------------|--------|
| **Arduino** | Digital (0 or 100%) | % | N/A (digital) | ✅ |
| **Backend** | 0-100 (boolean converted) | % | warning: 65, critical: 85 | ✅ |
| **Mobile** | 0-100 | % | warning: 65, critical: 85 | ✅ |

**Flow**:
```
Arduino: flameDetected = true → fire: 100
Backend: fire: 100, unit: '%'
Mobile:  fire: 100, unit: '%'
```

✅ **MATCHING PERFECTLY**

---

## ❌ Heat Sensor - THRESHOLD MISMATCH

### Arduino → Backend → Mobile

| Component | Value | Unit | Warning Threshold | Critical Threshold | Status |
|-----------|-------|------|-------------------|-------------------|--------|
| **Arduino** | Temperature | °C | 38.0 | 45.0 | ✅ |
| **Backend** | Temperature | °C | 38 | 45 | ✅ |
| **Mobile** | Temperature | °C | **38** | **55** | ❌ |

**ISSUE**: Mobile app has WRONG critical threshold (55°C instead of 45°C)

```typescript
// Mobile app - WRONG
heat: { warning: 38, critical: 55 },

// Should be (matching Arduino/Backend)
heat: { warning: 38, critical: 45 },
```

---

## Alert Trigger Logic Comparison

### Arduino Logic
```cpp
// CRITICAL ALERT: flame OR (smoke >= 1200 AND heat >= 45)
bool critical = flameCritical || (smokeLevel == 2 && heatLevel == 2);
```

### Backend Logic
```javascript
// MATCHES Arduino
const flameDetected = fireSensor && fireSensor.value >= 85;
const smokeCritical = smokeSensor && smokeSensor.value >= 1200;
const heatCritical = heatSensor && heatSensor.value >= 45;

const shouldAlert = flameDetected || (smokeCritical && heatCritical);
```

### Mobile App Logic
```typescript
// ❌ MISMATCHED - Uses wrong thresholds
const getAlertLevel = (sensors: DashboardSensor[]): 'critical' | 'warning' | 'normal' => {
  const fireCritical = fireSensor?.value >= 85;  // ✅ Correct
  const smokeStatus = getSensorStatus('smoke', smokeSensor.value);  // ❌ Uses wrong threshold (1200 instead of 900)
  const heatStatus = getSensorStatus('heat', heatSensor.value);     // ❌ Uses wrong threshold (55 instead of 45)

  if (fireCritical) return 'critical';  // ✅ Correct
  if (smokeStatus === 'critical' && heatStatus === 'critical') return 'critical';  // ❌ Wrong thresholds
}
```

---

## Summary of Issues

### 🔴 HIGH PRIORITY FIXES NEEDED

1. **Smoke Sensor Unit Display**
   - **Current**: Mobile shows `unit: 'ppm'`
   - **Should be**: `unit: 'raw'` or `unit: 'ADC'`
   - **Impact**: Confusing for users - raw analog values aren't ppm

2. **Smoke Sensor Thresholds**
   - **Current**: Mobile uses warning: 1200, critical: 1600
   - **Should be**: warning: 900, critical: 1200
   - **Impact**: CRITICAL - Alerts won't trigger at correct levels!

3. **Heat Sensor Critical Threshold**
   - **Current**: Mobile uses critical: 55°C
   - **Should be**: critical: 45°C
   - **Impact**: CRITICAL - Critical alerts delayed by 10°C!

### ✅ Working Correctly

- Fire sensor values (0-100%)
- Fire sensor thresholds (warning: 65, critical: 85)
- Heat sensor warning threshold (38°C)
- Backend normalization logic
- Backend alert trigger logic
- Arduino sensor reading and transmission

---

## Recommended Fixes

### Fix 1: Update Mobile App Thresholds
```typescript
// In app/dashboard.tsx - line ~145
const SENSOR_THRESHOLDS: Record<SensorKind, { warning: number; critical: number }> = {
  fire: { warning: 65, critical: 85 },
  smoke: { warning: 900, critical: 1200 },  // ✅ Fixed
  heat: { warning: 38, critical: 45 },      // ✅ Fixed
};
```

### Fix 2: Update Mobile App Smoke Unit Display
```typescript
// In app/dashboard.tsx - line ~131
{ id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'raw', ... }
// OR better:
{ id: 1, kind: 'smoke', name: 'Smoke Sensor', value: 1, unit: 'ADC', ... }
```

### Fix 3: Ensure Dashboard Uses Backend Unit
```typescript
// When fetching sensor data
setSensors([
  { id: 2, kind: 'fire', name: 'Fire Sensor', value: fire, unit: '%', ... },
  { id: 1, kind: 'smoke', name: 'Smoke Sensor', value: smoke, unit: 'raw', ... },  // ✅ Use 'raw'
  { id: 3, kind: 'heat', name: 'Heat Sensor', value: heat, unit: '°C', ... },
]);
```

---

## Testing Checklist

After applying fixes:

- [ ] Smoke sensor displays correct unit ('raw' or 'ADC')
- [ ] Smoke warning triggers at 900 (not 1200)
- [ ] Smoke critical triggers at 1200 (not 1600)
- [ ] Heat critical triggers at 45°C (not 55°C)
- [ ] Alert notification matches Arduino alert state
- [ ] Dashboard sensor status colors match backend status

---

**Date**: 2026-07-19
**Status**: Issues identified, fixes needed
