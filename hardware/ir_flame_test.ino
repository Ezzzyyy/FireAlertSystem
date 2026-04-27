#define FLAME_PIN 14  // IR Flame Sensor DO pin on GPIO 14

void setup() {
  pinMode(FLAME_PIN, INPUT);  // Set GPIO 14 as input
  Serial.begin(115200);
  delay(1000);  // Wait for serial to initialize
  Serial.println("\n\nIR Flame Sensor test started!");
  Serial.println("Point the sensor at a flame or light source...");
}

void loop() {
  int sensorValue = digitalRead(FLAME_PIN);
  
  Serial.print("Sensor value: ");
  Serial.print(sensorValue);
  Serial.print(" → ");
  
  if (sensorValue == HIGH) {
    Serial.println("🔥 FLAME/LIGHT DETECTED!");
  } else {
    Serial.println("Normal (no flame/light)");
  }
  
  delay(1000);  // Check every 1 second
}
