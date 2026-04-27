#define LED_PIN 5  // D5 pin

void setup() {
  pinMode(LED_PIN, OUTPUT);  // Set D5 as output
  Serial.begin(115200);
  delay(1000);  // Wait for serial to initialize
  Serial.println("\n\nLED test started!");
  Serial.println("LED should blink every 1 second...");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);  // Turn LED ON
  Serial.println("LED ON");
  delay(1000);  // Wait 1 second
  
  digitalWrite(LED_PIN, LOW);   // Turn LED OFF
  Serial.println("LED OFF");
  delay(1000);  // Wait 1 second
}