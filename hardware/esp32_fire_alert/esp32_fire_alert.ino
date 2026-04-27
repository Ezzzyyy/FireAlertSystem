#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HardwareSerial.h>

// -------- WiFi / API config --------
const char* WIFI_SSID = "TECNO CAMON 30S";
const char* WIFI_PASSWORD = "ayawpagkonek";

// Use your computer LAN IP here, same machine running backend server.
const char* API_URL = "http://10.33.72.50:4000/hardware/telemetry";
const char* DEVICE_KEY = "dev-device-key";

// -------- Pin wiring (edit to your build) --------
const int BUZZER_PIN = 12;        // Buzzer on GPIO 12
const int ALERT_LED_PIN = 5;      // LED on GPIO 5 (D5)
const int FLAME_DIGITAL_PIN = 14; // IR Flame Sensor DO pin
const int SMOKE_ANALOG_PIN = 32;  // MQ-2 Smoke Sensor AO pin
const int SIM800L_TX_PIN = 16;    // SIM800L TX to ESP32 RX
const int SIM800L_RX_PIN = 17;    // SIM800L RX to ESP32 TX

const int DHT_PIN = 4;
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

// SIM800L HardwareSerial (use Serial2 on ESP32)
HardwareSerial sim800l(2); // Use UART2

// Fire detection thresholds - Updated
const int FLAME_WARNING_PERCENT = 65;   // Flame sensor warning threshold (%)
const int FLAME_CRITICAL_PERCENT = 85;  // Flame sensor critical threshold (%)
const int SMOKE_WARNING_RAW = 1200;     // Smoke sensor warning threshold (raw ADC) - adjusted for baseline
const int SMOKE_CRITICAL_RAW = 1600;    // Smoke sensor critical threshold (raw ADC) - adjusted for baseline
const float HEAT_WARNING_C = 38.0;      // Temperature warning threshold (°C)
const float HEAT_CRITICAL_C = 55.0;     // Temperature critical threshold (°C)
bool fireAlertActive = false;
enum AlertLevel { ALERT_NORMAL, ALERT_WARNING, ALERT_CRITICAL };
AlertLevel currentAlertLevel = ALERT_NORMAL;

unsigned long lastLedToggleAt = 0;
unsigned long lastBuzzerToggleAt = 0;
bool ledState = false;
bool buzzerState = false;

// Send interval in milliseconds.
const unsigned long SEND_INTERVAL_MS = 2500;

// Fire detection validation delays
const unsigned long FIRE_DETECTION_DELAY_MS = 3000; // 3 seconds
const int SMOKE_MOVING_AVERAGE_WINDOW = 5;
const int FIRE_FLICKER_DETECTION_WINDOW = 3;

// Median filter window for noisy wiring / unstable analog lines.
const int FILTER_WINDOW = 7;
int smokeBuffer[FILTER_WINDOW];
int bufferIndex = 0;
bool bufferFilled = false;

// Fire detection validation variables
unsigned long fireDetectionStartTime = 0;
bool fireDetectionStarted = false;
int flameHistory[FIRE_FLICKER_DETECTION_WINDOW];
int flameHistoryIndex = 0;
bool flameHistoryFilled = false;

// SMS variables
bool sim800lInitialized = false;
unsigned long lastSmsSentAt = 0;
const unsigned long SMS_COOLDOWN_MS = 30000; // 30 seconds between SMS

unsigned long lastSendAt = 0;

int readMedian(int* values, int length) {
  int sorted[FILTER_WINDOW];
  for (int i = 0; i < length; i++) {
    sorted[i] = values[i];
  }

  for (int i = 0; i < length - 1; i++) {
    for (int j = i + 1; j < length; j++) {
      if (sorted[j] < sorted[i]) {
        int temp = sorted[i];
        sorted[i] = sorted[j];
        sorted[j] = temp;
      }
    }
  }

  return sorted[length / 2];
}

void pushSamples(int smoke) {
  smokeBuffer[bufferIndex] = smoke;

  bufferIndex = (bufferIndex + 1) % FILTER_WINDOW;
  if (bufferIndex == 0) {
    bufferFilled = true;
  }
}

int getFilteredSmokeRaw() {
  int count = bufferFilled ? FILTER_WINDOW : bufferIndex;
  if (count <= 0) return analogRead(SMOKE_ANALOG_PIN);
  return readMedian(smokeBuffer, count);
}

String getFlameStatus(bool flameDetected) {
  return flameDetected ? "CRITICAL" : "NORMAL";
}

float smokeRawToPercent(int smokeRaw) {
  return smokeRaw * 100.0 / 4095.0;
}

String getSmokeStatus(int smokeRaw) {
  if (smokeRaw > SMOKE_CRITICAL_RAW) return "CRITICAL";
  if (smokeRaw > SMOKE_WARNING_RAW) return "WARNING";
  return "NORMAL";
}

String getHeatStatus(float tempC) {
  if (isnan(tempC)) return "ERROR";
  if (tempC >= HEAT_CRITICAL_C) return "CRITICAL";
  if (tempC >= HEAT_WARNING_C) return "WARNING";
  return "NORMAL";
}

bool isHeatCritical(float tempC) {
  return !isnan(tempC) && tempC > HEAT_CRITICAL_C;
}

// Fire detection validation functions
bool validateFireDetection(bool flameDetected) {
  if (!flameDetected) {
    fireDetectionStarted = false;
    fireDetectionStartTime = 0;
    return false;
  }

  if (!fireDetectionStarted) {
    fireDetectionStarted = true;
    fireDetectionStartTime = millis();
    return false;
  }

  return (millis() - fireDetectionStartTime >= FIRE_DETECTION_DELAY_MS);
}

// Additional validation for flame sensor to avoid false positives
bool isRealFire(bool flameDetected, int smokeLevel, float temperature) {
  // If flame is detected but smoke and temperature are both normal, definitely false positive
  if (flameDetected && smokeLevel < SMOKE_WARNING_RAW && temperature < HEAT_WARNING_C) {
    return false; // Definitely sunlight or other light source
  }
  
  // Require BOTH smoke AND temperature to be elevated for flame detection to be valid
  // This prevents false triggers from bright lights
  if (flameDetected && smokeLevel >= SMOKE_WARNING_RAW && temperature >= HEAT_WARNING_C) {
    return true; // Real fire - multiple sensors confirm
  }
  
  // If only flame detected but not supported by other sensors, ignore it
  return false;
}

bool detectFireFlicker(bool flameDetected) {
  flameHistory[flameHistoryIndex] = flameDetected ? 1 : 0;
  flameHistoryIndex = (flameHistoryIndex + 1) % FIRE_FLICKER_DETECTION_WINDOW;
  if (flameHistoryIndex == 0) {
    flameHistoryFilled = true;
  }

  int count = flameHistoryFilled ? FIRE_FLICKER_DETECTION_WINDOW : flameHistoryIndex;
  if (count < FIRE_FLICKER_DETECTION_WINDOW) return false;

  bool hasHigh = false, hasLow = false;
  for (int i = 0; i < count; i++) {
    if (flameHistory[i] == 1) hasHigh = true;
    if (flameHistory[i] == 0) hasLow = true;
  }

  return hasHigh && hasLow;
}

int getSmokeMovingAverage(int smokeRaw) {
  static int smokeAvgBuffer[SMOKE_MOVING_AVERAGE_WINDOW];
  static int avgIndex = 0;
  static bool avgFilled = false;

  smokeAvgBuffer[avgIndex] = smokeRaw;
  avgIndex = (avgIndex + 1) % SMOKE_MOVING_AVERAGE_WINDOW;
  if (avgIndex == 0) {
    avgFilled = true;
  }

  int count = avgFilled ? SMOKE_MOVING_AVERAGE_WINDOW : avgIndex;
  int sum = 0;
  for (int i = 0; i < count; i++) {
    sum += smokeAvgBuffer[i];
  }

  return sum / count;
}

AlertLevel getAlertLevel(bool flameDetected, int smokeRaw, float tempC) {
  bool fireValid = validateFireDetection(flameDetected);
  int smokeAvg = getSmokeMovingAverage(smokeRaw);
  String smokeStatus = getSmokeStatus(smokeAvg);
  String heatStatus = getHeatStatus(tempC);

  // Detection Logic - Updated per user requirements
  // CRITICAL: Fire detected (after 3s validation only)
  if (fireValid && flameDetected) {
    return ALERT_CRITICAL; // Fire triggers buzzer + LED (after 3s validation)
  }
  // CRITICAL: Both heat AND smoke critical
  else if (smokeAvg >= SMOKE_CRITICAL_RAW && tempC >= HEAT_CRITICAL_C) {
    return ALERT_CRITICAL; // Both heat AND smoke critical triggers buzzer + LED
  }
  // WARNING: One sensor warning (heat OR smoke at warning level)
  else if ((smokeAvg >= SMOKE_WARNING_RAW && smokeAvg < SMOKE_CRITICAL_RAW) || 
           (tempC >= HEAT_WARNING_C && tempC < HEAT_CRITICAL_C)) {
    return ALERT_WARNING; // One sensor warning triggers WARNING (LED only)
  }
  // WARNING: One sensor warning and one critical (heat warning + smoke critical OR smoke warning + heat critical)
  else if ((smokeAvg >= SMOKE_WARNING_RAW && tempC >= HEAT_WARNING_C) && 
           !(smokeAvg >= SMOKE_CRITICAL_RAW && tempC >= HEAT_CRITICAL_C)) {
    return ALERT_WARNING; // Mixed warning/critical triggers WARNING (LED only)
  }
  // Normal: All other cases
  else {
    return ALERT_NORMAL;
  }
}

void applyAlertOutputs(AlertLevel level) {
  const unsigned long now = millis();

  if (level == ALERT_CRITICAL) {
    if (now - lastLedToggleAt >= 150) {
      ledState = !ledState;
      digitalWrite(ALERT_LED_PIN, ledState ? HIGH : LOW);
      lastLedToggleAt = now;
    }

    if (now - lastBuzzerToggleAt >= 150) {
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
      lastBuzzerToggleAt = now;
    }
    return;
  }

  if (level == ALERT_WARNING) {
    // LED only - no buzzer for WARNING alerts
    if (now - lastLedToggleAt >= 600) {
      ledState = !ledState;
      digitalWrite(ALERT_LED_PIN, ledState ? HIGH : LOW);
      lastLedToggleAt = now;
    }
    return;
  }

  ledState = false;
  buzzerState = false;
  digitalWrite(ALERT_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  static unsigned long lastConnectAttemptAt = 0;
  const unsigned long RECONNECT_COOLDOWN_MS = 10000;

  if (millis() - lastConnectAttemptAt >= RECONNECT_COOLDOWN_MS || lastConnectAttemptAt == 0) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastConnectAttemptAt = millis();
    Serial.print("Connecting to WiFi");
  } else {
    return false;
  }

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("WiFi connection failed");
  return false;
}

void sendTelemetry(int flameRaw, int smokeRaw, bool flameDigital, float heatC) {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  StaticJsonDocument<256> doc;
  doc["deviceId"] = "esp32-main";
  doc["fireAnalog"] = flameRaw;
  doc["fireDigital"] = flameDigital;
  doc["smokeAnalog"] = smokeRaw;

  if (!isnan(heatC)) {
    doc["heatC"] = heatC;
  }

  String payload;
  serializeJson(doc, payload);

  int responseCode = http.POST(payload);
  String responseBody = http.getString();

  Serial.print("POST /hardware/telemetry -> ");
  Serial.println(responseCode);
  Serial.println(responseBody);

  http.end();
}

// SIM800L SMS functions
bool initializeSIM800L() {
  if (sim800lInitialized) {
    return true;
  }

  Serial.println("Initializing SIM800L...");
  sim800l.begin(9600, SERIAL_8N1, SIM800L_RX_PIN, SIM800L_TX_PIN);
  delay(1000);

  // Check if SIM800L is responding
  sim800l.println("AT");
  delay(1000);
  while (sim800l.available()) {
    String response = sim800l.readString();
    if (response.indexOf("OK") != -1) {
      Serial.println("SIM800L is responding!");
      break;
    }
  }

  // Set SMS mode to text
  sim800l.println("AT+CMGF=1");
  delay(1000);

  // Check SIM card status
  sim800l.println("AT+CPIN?");
  delay(1000);
  while (sim800l.available()) {
    String response = sim800l.readString();
    if (response.indexOf("READY") != -1) {
      Serial.println("SIM card is ready!");
      sim800lInitialized = true;
      return true;
    } else if (response.indexOf("SIM PIN") != -1) {
      Serial.println("SIM card requires PIN!");
      return false;
    }
  }

  Serial.println("SIM800L initialization failed!");
  return false;
}

bool sendSMS(const String& phoneNumber, const String& message) {
  if (!sim800lInitialized) {
    if (!initializeSIM800L()) {
      return false;
    }
  }

  // Check cooldown
  if (millis() - lastSmsSentAt < SMS_COOLDOWN_MS) {
    Serial.println("SMS cooldown active - skipping send");
    return false;
  }

  Serial.print("Sending SMS to: ");
  Serial.println(phoneNumber);
  Serial.print("Message: ");
  Serial.println(message);

  // Send SMS command
  sim800l.println("AT+CMGS=\"" + phoneNumber + "\"");
  delay(1000);

  // Send message content
  sim800l.print(message);
  delay(1000);

  // Send Ctrl+Z to finish message
  sim800l.write(26);
  delay(5000);

  // Check response
  while (sim800l.available()) {
    String response = sim800l.readString();
    Serial.println("SIM800L Response: " + response);
    if (response.indexOf("OK") != -1 || response.indexOf("+CMGS:") != -1) {
      lastSmsSentAt = millis();
      Serial.println("SMS sent successfully!");
      return true;
    }
  }

  Serial.println("SMS send failed!");
  return false;
}

void sendEmergencySMS(AlertLevel level, float temperature, int smokeLevel) {
  if (!sim800lInitialized) {
    initializeSIM800L();
  }

  String alertType = (level == ALERT_CRITICAL) ? "CRITICAL" : "WARNING";
  String message = "🚨 " + alertType + " FIRE ALERT!\n\n";
  message += "Temperature: " + String(temperature, 1) + "°C\n";
  message += "Smoke Level: " + String(smokeLevel) + " (raw)\n";
  message += "Time: " + String(millis() / 1000) + "s\n\n";
  message += "Please check the location immediately!";

  // Send to emergency numbers (you can modify these)
  String emergencyNumbers[] = {
    "+63911000000",  // Emergency Services
    "+639285551234"  // Fire Department
  };

  for (const String& number : emergencyNumbers) {
    sendSMS(number, message);
    delay(2000); // Wait between sends
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize outputs and flame sensor
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  pinMode(ALERT_LED_PIN, OUTPUT);
  digitalWrite(ALERT_LED_PIN, LOW);
  pinMode(FLAME_DIGITAL_PIN, INPUT);
  
  analogReadResolution(12); // ESP32 ADC range: 0..4095
  dht.begin();

  Serial.println("\n\n========== FIRE ALERT SYSTEM ==========");
  Serial.println("Sensors Active: Flame, Smoke, Temperature, Humidity");
  Serial.println("Buzzer: GPIO 12");
  Serial.println("Alert LED: GPIO 5");
  Serial.println("=========================================\n");

  // Test buzzer on startup
  Serial.println("Testing buzzer...");
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(BUZZER_PIN, LOW);
  delay(200);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("Buzzer test complete.");

  connectWiFi();

  for (int i = 0; i < FILTER_WINDOW; i++) {
    smokeBuffer[i] = analogRead(SMOKE_ANALOG_PIN);
  }
  bufferFilled = true;
}

void loop() {
  if (millis() - lastSendAt < SEND_INTERVAL_MS) {
    // Apply alert outputs while waiting (buzzer/LED continue)
    if (currentAlertLevel != ALERT_NORMAL) {
      applyAlertOutputs(currentAlertLevel);
    }
    delay(20);
    return;
  }
  lastSendAt = millis();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Read all sensors FIRST (before applying alert outputs to avoid electrical interference)
  int smokeRaw = analogRead(SMOKE_ANALOG_PIN);
  bool flameDetected = digitalRead(FLAME_DIGITAL_PIN) == HIGH;
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  pushSamples(smokeRaw);
  int filteredSmoke = getFilteredSmokeRaw();
  String flameStatus = getFlameStatus(flameDetected);
  String smokeStatus = getSmokeStatus(filteredSmoke);
  String heatStatus = getHeatStatus(temperature);

  // Print sensor status
  Serial.print("[");
  Serial.print(millis() / 1000);
  Serial.print("s] ");
  Serial.print("FLAME: ");
  Serial.print(flameStatus);
  Serial.print("  |  SMOKE: ");
  Serial.print(filteredSmoke);
  Serial.print(" (raw) ");
  Serial.print(smokeStatus);
  Serial.print("  |  TEMP: ");
  if (isnan(temperature)) {
    Serial.print("ERROR");
  } else {
    Serial.print(temperature);
    Serial.print("°C ");
    Serial.print(heatStatus);
  }
  Serial.print("  |  HUM: ");
  if (isnan(humidity)) {
    Serial.print("ERROR");
  } else {
    Serial.print(humidity);
    Serial.print("%");
  }
  Serial.println();

  AlertLevel nextLevel = getAlertLevel(flameDetected, filteredSmoke, temperature);

  Serial.print("Alert Level: ");
  if (nextLevel == ALERT_CRITICAL) Serial.print("CRITICAL");
  else if (nextLevel == ALERT_WARNING) Serial.print("WARNING");
  else Serial.print("NORMAL");
  Serial.println();

  if (nextLevel != currentAlertLevel) {
    Serial.print("Alert Level Changed: ");
    Serial.print(currentAlertLevel == ALERT_CRITICAL ? "CRITICAL" : currentAlertLevel == ALERT_WARNING ? "WARNING" : "NORMAL");
    Serial.print(" -> ");
    Serial.println(nextLevel == ALERT_CRITICAL ? "CRITICAL" : nextLevel == ALERT_WARNING ? "WARNING" : "NORMAL");
    
    if (nextLevel == ALERT_CRITICAL) {
      Serial.println("CRITICAL alert: LED + buzzer active.");
      fireAlertActive = true;
      // Send emergency SMS for critical alerts
      sendEmergencySMS(ALERT_CRITICAL, temperature, filteredSmoke);
    } else if (nextLevel == ALERT_WARNING) {
      Serial.println("WARNING alert: LED only (no buzzer).");
      // Send warning SMS (optional - you can comment this out if you don't want warning SMS)
      // sendEmergencySMS(ALERT_WARNING, temperature, filteredSmoke);
    } else {
      if (fireAlertActive) {
        Serial.println("Alert cleared: all outputs off.");
      }
      fireAlertActive = false;
    }

    currentAlertLevel = nextLevel;
    lastLedToggleAt = 0;
    lastBuzzerToggleAt = 0;
  }

  applyAlertOutputs(currentAlertLevel);

  // Backend treats lower fireAnalog as stronger flame signal.
  // Map digital flame to equivalent analog scale: detected -> 0 (100%), normal -> 4095 (0%).
  int fireRawForTelemetry = flameDetected ? 0 : 4095;
  sendTelemetry(fireRawForTelemetry, filteredSmoke, flameDetected, temperature);
}
