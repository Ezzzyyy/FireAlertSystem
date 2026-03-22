# Fire Alert System - Automation Rules

## Individual Sensor Thresholds

### Fire Sensor (IR Fire Module)
- **Normal**: 0–25%
- **Warning**: >25% → Alert user, log activity
- **Critical**: >60% → Sound alarm, notify emergency contacts
- **Emergency**: >80% → Full emergency protocol

### Smoke Sensor (MQ-2/MQ-135)
- **Normal**: 0–40 ppm
- **Warning**: >40 ppm → Alert user (early smoke detection)
- **Critical**: >80 ppm → Sound alarm
- **Emergency**: >120 ppm → Full emergency, notify authorities

### Heat Sensor (DHT22)
- **Normal**: 0–35°C
- **Warning**: >35°C → Alert user (abnormal temperature)
- **Critical**: >50°C → Sound alarm (fire-level heat)
- **Emergency**: >65°C → Full emergency mode

## Combined Multi-Sensor Rules

### 1. WARNING Status - Selective SMS Alert
**Trigger**: ANY sensor reaches WARNING status

**Action**:
- Send SMS **ONLY to selected contacts** (must enable "Send WARNING SMS" toggle per contact)
- SMS contains: Sensor name, level, timestamp, location, monitor instruction
- Log warning event in activity history
- **NO alarm sound triggered**
- Visual yellow/orange indicator on dashboard

**Contact Selection**:
- Each contact has a "Send WARNING SMS" toggle switch
- Only contacts with this option enabled will receive WARNING SMS
- CRITICAL alerts are always sent to ALL active contacts
- Configure in Settings → Emergency Contacts

**SMS Message Format (WARNING)**:
```
⚠️ FIRE ALERT WARNING
Sensor: [Fire/Smoke/Heat] Sensor
Level: [value][unit]
Status: Elevated - Monitor
Time: [MM/DD/YYYY, HH:MM:SS AM/PM]
Location: Your Building
System: Fire Alert IoT
```

**Example**: 
- Smoke Sensor = 45 ppm (warning)
- Fire Department has "Send WARNING SMS" enabled
- Emergency Services has "Send WARNING SMS" disabled
→ SMS sent only to Fire Department, no alarm

### 2. CRITICAL Status - Full Alarm + SMS to All
**Trigger**: ANY sensor reaches CRITICAL status

**Action**:
- **IMMEDIATE full alarm activation** (LED + Buzzer sound)
- Send SMS to **ALL enabled emergency contacts** (regardless of WARNING SMS setting)
- Send push notification
- SMS contains: CRITICAL alert, evacuation warning, emergency number
- Log critical event in activity history
- Visual red indicator with pulsing animation

**SMS Message Format (CRITICAL)**:
```
🚨 EMERGENCY FIRE ALERT
Sensor: [Fire/Smoke/Heat] Sensor
Level: [value][unit]
Status: CRITICAL - EVACUATE NOW
Time: [MM/DD/YYYY, HH:MM:SS AM/PM]
Location: Your Building
Emergency: 911
System: Fire Alert IoT
```

**Example**:
- Fire Sensor = 65% (critical)
→ Alarm triggers + SMS sent to ALL contacts immediately

## Implementation Details

### Files Modified
- `app/dashboard.tsx` - Added threshold logic and automation useEffect hooks
- `store/useSystemStore.ts` - Sensor-specific status computation
- `components/SensorCard.tsx` - Support for fire/smoke/heat sensor types

### Key Functions
- `getSensorStatus(kind, value)` - Computes status from value and sensor type
- `generateSMSMessage(sensor, status)` - Creates formatted SMS content for WARNING/CRITICAL
- `SENSOR_THRESHOLDS` - Centralized threshold configuration

### Safety Features
- System must be ARMED for automation to trigger
- Prevents duplicate SMS with sensor tracking (processedSensorsRef)
- Each sensor only triggers once per status change
- Visual escalation indicators in UI
- Alarm stops when user clicks "Stop Alert"

## Testing Automation

1. **Test WARNING with selective SMS**: 
   - Go to Settings → Emergency Contacts
   - Toggle "Send WARNING SMS" ON for specific contact (e.g., Fire Department)
   - Set any sensor to warning level (e.g., Smoke to 45 ppm) 
   - Result: SMS sent only to selected contacts, no alarm

2. **Test CRITICAL**: 
   - Set any sensor to critical level (e.g., Fire to 65%) 
   - Result: Alarm + SMS sent to ALL contacts

3. **Test Reset**: 
   - Click "Reset System" to clear all states and tracking

## How to Configure WARNING SMS Recipients

1. Click settings icon (⚙️) in top right
2. Select "Emergency Contacts"
3. For each contact, toggle "Send WARNING SMS" ON/OFF
4. **ON (Orange)**: Contact will receive WARNING alerts
5. **OFF (Gray)**: Contact will NOT receive WARNING alerts
6. All contacts always receive CRITICAL alerts regardless of this setting

## How to Set System Location

1. Click settings icon (⚙️) in top right
2. Select "System Location"
3. Enter your complete address/location:
   - Building name and number
   - Street address
   - Floor and room number
   - Any specific landmark
4. Example: `Building A, 123 Main St, Floor 2, Room 201`
5. This location appears in all SMS alerts sent to emergency contacts
6. **Important**: Use a clear, specific address so emergency responders can find you quickly

## SMS Content Examples

**WARNING SMS (Smoke at 45 ppm to Fire Department)**:
```
⚠️ FIRE ALERT WARNING
Sensor: Smoke Sensor
Level: 45ppm
Status: Elevated - Monitor
Time: 2/23/2026, 10:30:15 AM
Location: Building A, 123 Main St, Floor 2, Room 201
System: Fire Alert IoT
```

**CRITICAL SMS (Fire at 85% to All Contacts)**:
```
🚨 EMERGENCY FIRE ALERT
Sensor: Fire Sensor
Level: 85%
Status: CRITICAL - EVACUATE NOW
Time: 2/23/2026, 10:35:22 AM
Location: Building A, 123 Main St, Floor 2, Room 201
Emergency: 911
System: Fire Alert IoT
```

---
*Last Updated: Feb 23, 2026*
