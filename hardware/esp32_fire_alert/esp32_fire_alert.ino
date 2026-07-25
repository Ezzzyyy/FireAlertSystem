#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// -------- WiFi / API config --------
const char* WIFI_SSID     = "WIFI_LIKOD_5G";
const char* WIFI_PASSWORD = "Bluedormnganaaylettere!2213x";

const char* API_URL    = "https://firealertsystem-pzjt.onrender.com/hardware/telemetry";
const char* DEVICE_KEY = "dev-device-key";

// -------- Pin wiring --------
const int BUZZER_PIN        = 12;
const int ALERT_LED_PIN     = 5;
const int FLAME_DIGITAL_PIN = 14;
const int SMOKE_ANALOG_PIN  = 32;
const int DHT_PIN           = 4;
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

// -------- Thresholds --------
// MQ-2 clean-air baseline is ~1400-1500. Thresholds are well above it.
const int   SMOKE_WARNING_RAW  = 1600;
const int   SMOKE_CRITICAL_RAW = 1800;
const float HEAT_WARNING_C     = 38.0;
const float HEAT_CRITICAL_C    = 45.0;

// Flame sensor: outputs HIGH when flame detected, LOW when idle.
// Confirmed by hardware: flameRaw=0 in normal conditions.
#define FLAME_ACTIVE HIGH

// -------- Timings --------
const unsigned long ALERT_CONFIRM_MS     = 3000;  // flame must persist 3s before alert
const unsigned long ALERT_BLINK_MS       = 150;
const unsigned long SENSOR_LOOP_DELAY_MS = 100;
const unsigned long LOG_INTERVAL_MS      = 1000;
const unsigned long TELEMETRY_INTERVAL_MS = 3000;
const unsigned long WIFI_RETRY_MS        = 15000;

// -------- State --------
bool  criticalConfirmed  = false;
bool  ledState           = false;
bool  buzzerState        = false;

unsigned long criticalStartTime  = 0;
unsigned long lastLedToggleAt    = 0;
unsigned long lastBuzzerToggleAt = 0;
unsigned long lastLogAt          = 0;
unsigned long lastTelemetryAt    = 0;
unsigned long lastWifiAttemptAt  = 0;

float lastValidTemp = NAN;

// -------- WiFi --------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("\nConnecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed.");
  }
}

// -------- Setup --------
void setup() {
  Serial.begin(115200);
  delay(300);

  // Set outputs first and drive LOW immediately — no floating
  pinMode(BUZZER_PIN,    OUTPUT);
  pinMode(ALERT_LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN,    LOW);
  digitalWrite(ALERT_LED_PIN, LOW);

  // Flame sensor: active drive, no pull resistor needed
  pinMode(FLAME_DIGITAL_PIN, INPUT);

  dht.begin();

  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(true);
  delay(100);

  Serial.println("\n========== FIRE ALERT SYSTEM ==========");
  connectWiFi();

  // Single short beep on startup to confirm hardware is alive
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("Ready.");
}

// -------- Telemetry --------
void sendTelemetry(float temperature, int smokeRaw, bool flameDetected) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (isnan(temperature)) return;

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  StaticJsonDocument<256> doc;
  doc["fire"]          = flameDetected ? 100 : 0;
  doc["flameDetected"] = flameDetected;
  doc["smoke"]         = smokeRaw;
  doc["heat"]          = temperature;
  doc["deviceId"]      = "esp32-001";

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code > 0) {
    Serial.print("Telemetry OK. HTTP "); Serial.println(code);
  } else {
    Serial.print("Telemetry error: "); Serial.println(code);
  }
  http.end();
}

// -------- Main loop --------
void loop() {
  // WiFi watchdog
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttemptAt >= WIFI_RETRY_MS) {
      lastWifiAttemptAt = millis();
      connectWiFi();
    }
  }

  // Read sensors
  int   smokeRaw      = analogRead(SMOKE_ANALOG_PIN);
  int   flameRaw      = digitalRead(FLAME_DIGITAL_PIN);
  bool  flameDetected = (flameRaw == FLAME_ACTIVE);
  float temp          = dht.readTemperature();

  if (!isnan(temp)) lastValidTemp = temp;
  else              temp = lastValidTemp;

  // Throttled serial log
  if (millis() - lastLogAt >= LOG_INTERVAL_MS) {
    lastLogAt = millis();
    Serial.print("Smoke: "); Serial.print(smokeRaw);
    Serial.print("  Flame: "); Serial.print(flameRaw);
    Serial.print("  Flame detect: "); Serial.print(flameDetected ? "YES" : "NO");
    Serial.print("  Temp: "); Serial.print(temp); Serial.println("C");
  }

  // Alert levels
  int smokeLevel = 0;
  if      (smokeRaw >= SMOKE_CRITICAL_RAW) smokeLevel = 2;
  else if (smokeRaw >= SMOKE_WARNING_RAW)  smokeLevel = 1;

  int heatLevel = 0;
  if (!isnan(temp)) {
    if      (temp >= HEAT_CRITICAL_C) heatLevel = 2;
    else if (temp >= HEAT_WARNING_C)  heatLevel = 1;
  }

  // CRITICAL = flame detected alone, OR smoke+heat both critical
  bool critical = flameDetected || (smokeLevel == 2 && heatLevel == 2);
  // WARNING  = smoke or heat elevated, but NOT critical
  bool warning  = !critical && (smokeLevel >= 1 || heatLevel >= 1);

  // Require flame to persist ALERT_CONFIRM_MS before confirming critical
  if (critical) {
    if (!criticalConfirmed) {
      if (criticalStartTime == 0) {
        criticalStartTime = millis();
      } else if (millis() - criticalStartTime >= ALERT_CONFIRM_MS) {
        criticalConfirmed = true;
        Serial.println(">>> CRITICAL CONFIRMED: LED + Buzzer ON");
      }
    }
  } else {
    // Reset as soon as condition clears
    criticalStartTime = 0;
    criticalConfirmed = false;
  }

  // Drive LED and buzzer
  if (criticalConfirmed) {
    // Fast blink LED + buzzer
    unsigned long now = millis();
    if (now - lastLedToggleAt >= ALERT_BLINK_MS) {
      ledState = !ledState;
      digitalWrite(ALERT_LED_PIN, ledState ? HIGH : LOW);
      lastLedToggleAt = now;
    }
    if (now - lastBuzzerToggleAt >= ALERT_BLINK_MS) {
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
      lastBuzzerToggleAt = now;
    }
  } else if (warning) {
    // Slow blink LED only — no buzzer
    digitalWrite(BUZZER_PIN, LOW);
    buzzerState = false;
    unsigned long now = millis();
    if (now - lastLedToggleAt >= 800) {  // slow 800ms blink for warning
      ledState = !ledState;
      digitalWrite(ALERT_LED_PIN, ledState ? HIGH : LOW);
      lastLedToggleAt = now;
    }
  } else {
    // All clear — everything off
    ledState    = false;
    buzzerState = false;
    digitalWrite(ALERT_LED_PIN, LOW);
    digitalWrite(BUZZER_PIN,    LOW);
  }

  // Telemetry
  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryAt = millis();
    sendTelemetry(temp, smokeRaw, flameDetected);
  }

  delay(SENSOR_LOOP_DELAY_MS);
}
