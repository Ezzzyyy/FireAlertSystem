#define SMOKE_PIN 32  // MQ-2 Smoke Sensor AO pin on GPIO 32

void setup() {
  Serial.begin(115200);
  delay(1000);  // Wait for serial to initialize
  Serial.println("\n\nMQ-2 Smoke Sensor test started!");
  Serial.println("Smoke level will be displayed (0-4095)...");
}

void loop() {
  int smokeLevel = analogRead(SMOKE_PIN);
  
  Serial.print("Smoke level: ");
  Serial.print(smokeLevel);
  Serial.print(" → ");
  
  if (smokeLevel > 3000) {
    Serial.println("⚠️ HIGH SMOKE/GAS DETECTED!");
  } else if (smokeLevel > 2000) {
    Serial.println("🟡 Medium smoke level");
  } else {
    Serial.println("✓ Normal (no smoke)");
  }
  
  delay(1000);  // Check every 1 second
}
