#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // verified
#include <DHT.h>

// -------- WiFi / API config --------
const char* WIFI_SSID = "TECNO CAMON 30S";
const char* WIFI_PASSWORD = "ayawpagkonek";

// Use your computer LAN IP here, same machine running backend server.
const char* API_URL = "https://firealertsystem-dcxc.onrender.com/hardware/telemetry";
const char* DEVICE_KEY = "dev-device-key";

// -------- Pin wiring (edit to your build) --------
const int BUZZER_PIN = 12;        // Buzzer on GPIO 12
const int ALERT_LED_PIN = 5;      // LED on GPIO 5 (D5)
const int FLAME_DIGITAL_PIN = 14; // IR Flame Sensor DO pin
const int SMOKE_ANALOG_PIN = 32;  // MQ-2 Smoke Sensor AO pin
const int DHT_PIN = 4;
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

// Fire detection thresholds
const int SMOKE_CRITICAL_RAW = 1600;
const float HEAT_CRITICAL_C = 55.0;

// Timings
const unsigned long ALERT_CONFIRM_MS = 3000;
const unsigned long ALERT_BLINK_MS = 150;
const unsigned long SENSOR_LOOP_DELAY_MS = 100;
const unsigned long LOG_INTERVAL_MS = 1000;
const unsigned long TELEMETRY_INTERVAL_MS = 2000;
const unsigned long WIFI_RETRY_MS = 10000;

// Variables
bool fireAlertActive = false;
unsigned long lastLedToggleAt = 0;
unsigned long lastBuzzerToggleAt = 0;
bool ledState = false;
bool buzzerState = false;

// Variables for confirmation logic
unsigned long criticalStartTime = 0;
bool criticalConfirmed = false;
unsigned long lastLogAt = 0;
unsigned long lastTelemetryAt = 0;
unsigned long lastWifiAttemptAt = 0;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_RETRY_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection timed out. Will retry in loop.");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(ALERT_LED_PIN, OUTPUT);
  pinMode(FLAME_DIGITAL_PIN, INPUT_PULLUP);
  dht.begin();

  Serial.println("\n\n========== FIRE ALERT SYSTEM ==========");
  Serial.println("Initializing...");

  connectWiFi();

  // Test LED and Buzzer
  digitalWrite(ALERT_LED_PIN, HIGH);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(1000);
  digitalWrite(ALERT_LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("Initialization complete.");
}

void sendTelemetry(float temperature, int smokeRaw, bool flameDetected) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skipping telemetry.");
    return;
  }

  if (isnan(temperature)) {
    Serial.println("Temperature read failed. Skipping telemetry this cycle.");
    return;
  }

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  // Create JSON payload
  StaticJsonDocument<256> payload;
  payload["fire"] = flameDetected ? 100 : 0;
  payload["flameDetected"] = flameDetected;
  payload["smoke"] = smokeRaw;
  payload["heat"] = temperature;
  payload["deviceId"] = "esp32-001";

  String jsonString;
  serializeJson(payload, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);
  if (httpResponseCode > 0) {
    Serial.print("Telemetry sent. Response code: ");
    Serial.println(httpResponseCode);
    String responseBody = http.getString();
    if (responseBody.length() > 0) {
      Serial.print("Response: ");
      Serial.println(responseBody);
    }
  } else {
    Serial.print("Error sending telemetry: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttemptAt >= WIFI_RETRY_MS) {
      lastWifiAttemptAt = millis();
      connectWiFi();
    }
  }

  // Read sensors
  int smokeRaw = analogRead(SMOKE_ANALOG_PIN);
  int flameDigitalRaw = digitalRead(FLAME_DIGITAL_PIN);
  bool flameDetected = flameDigitalRaw == HIGH; // This module appears to output HIGH when flame is present
  float temperature = dht.readTemperature();

  // Throttle logs to avoid flooding serial monitor.
  if (millis() - lastLogAt >= LOG_INTERVAL_MS) {
    lastLogAt = millis();
    Serial.print("Smoke Sensor (Raw): ");
    Serial.println(smokeRaw);
    Serial.print("Flame Digital Raw: ");
    Serial.println(flameDigitalRaw);
    Serial.print("Flame Sensor Detected: ");
    Serial.println(flameDetected ? "YES" : "NO");
    Serial.print("Temperature (C): ");
    Serial.println(temperature);
    Serial.print("WiFi Status: ");
    Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
  }

  int smokeLevel = 0;
  if (smokeRaw >= SMOKE_CRITICAL_RAW) {
    smokeLevel = 2;
  } else if (smokeRaw >= (SMOKE_CRITICAL_RAW * 0.75)) {
    smokeLevel = 1;
  }

  int heatLevel = 0;
  if (!isnan(temperature)) {
    if (temperature >= HEAT_CRITICAL_C) {
      heatLevel = 2;
    } else if (temperature >= 38.0) {
      heatLevel = 1;
    }
  }

  bool flameCritical = flameDetected;

  // Alert rules:
  // - WARNING: one sensor reads warning, LED only
  // - WARNING: smoke or heat is warning and the other is critical, LED only
  // - CRITICAL: smoke and heat both critical, LED + buzzer
  // - CRITICAL: flame alone is critical, LED + buzzer
  bool critical = flameCritical || (smokeLevel == 2 && heatLevel == 2);
  bool warning = (!critical) && (
    (smokeLevel == 1 && heatLevel == 0) ||
    (smokeLevel == 0 && heatLevel == 1) ||
    (smokeLevel == 1 && heatLevel == 2) ||
    (smokeLevel == 2 && heatLevel == 1)
  );

  if (critical) {
    if (!criticalConfirmed) {
      if (criticalStartTime == 0) {
        criticalStartTime = millis();
      } else if (millis() - criticalStartTime >= ALERT_CONFIRM_MS) {
        criticalConfirmed = true;
        Serial.println("CRITICAL CONDITION CONFIRMED: Activating LED and Buzzer.");
        sendTelemetry(temperature, smokeRaw, flameDetected);
        lastTelemetryAt = millis();
      }
    }
  } else {
    criticalStartTime = 0;
    criticalConfirmed = false;
  }

  if (criticalConfirmed) {
    if (!fireAlertActive) {
      fireAlertActive = true;
    }

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
    if (fireAlertActive) {
      Serial.println("ALERT DOWNGRADED: LED only warning.");
      fireAlertActive = false;
    }
    digitalWrite(BUZZER_PIN, LOW);
    buzzerState = false;

    unsigned long now = millis();
    if (now - lastLedToggleAt >= ALERT_BLINK_MS) {
      ledState = !ledState;
      digitalWrite(ALERT_LED_PIN, ledState ? HIGH : LOW);
      lastLedToggleAt = now;
    }
  } else {
    // Deactivate alert
    if (fireAlertActive) {
      Serial.println("ALERT CLEARED: Deactivating LED and Buzzer.");
      fireAlertActive = false;
    }
    ledState = false;
    buzzerState = false;
    digitalWrite(ALERT_LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
  }

  // Keep dashboard updated even when not critical.
  if (millis() - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    sendTelemetry(temperature, smokeRaw, flameDetected);
    lastTelemetryAt = millis();
  }

  delay(SENSOR_LOOP_DELAY_MS);
}