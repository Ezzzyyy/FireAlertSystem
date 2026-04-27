#define BUZZER_PIN 12  // Buzzer on GPIO 12

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\nBuzzer test started!");
  Serial.println("Buzzer will beep 3 times...");
}

void loop() {
  // Beep 3 times
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, HIGH);  // Buzzer ON
    Serial.println("BUZZER ON");
    delay(500);
    
    digitalWrite(BUZZER_PIN, LOW);   // Buzzer OFF
    Serial.println("BUZZER OFF");
    delay(500);
  }
  
  // Wait 3 seconds before next beep cycle
  Serial.println("Waiting 3 seconds...");
  delay(3000);
}
