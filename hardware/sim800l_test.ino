#include <SoftwareSerial.h>

// Define SIM800L pins
#define SIM_RX 5   // GPIO 5 receives data from SIM800L
#define SIM_TX 18  // GPIO 18 sends data to SIM800L

// Create software serial for SIM800L communication
SoftwareSerial sim800l(SIM_RX, SIM_TX);

void setup() {
  Serial.begin(115200);      // USB Serial for monitoring
  sim800l.begin(9600);       // SIM800L serial (9600 baud)
  
  delay(2000);
  Serial.println("\n\n=== SIM800L Test Started ===");
  Serial.println("Initializing SIM800L on GPIO 4 (RX) and GPIO 2 (TX)...");
  delay(1000);
  
  // Test 1: Send AT command
  Serial.println("\n[TEST 1] Sending AT command...");
  sim800l.println("AT");
  delay(500);
  readSIM800Response();
  
  // Test 2: Check signal strength
  Serial.println("\n[TEST 2] Checking signal strength...");
  sim800l.println("AT+CSQ");
  delay(500);
  readSIM800Response();
  
  // Test 3: Check SIM card status
  Serial.println("\n[TEST 3] Checking SIM card status...");
  sim800l.println("AT+CPIN?");
  delay(500);
  readSIM800Response();
  
  Serial.println("\n=== Test Complete ===");
  Serial.println("If you see OK responses above, SIM800L is working!");
}

void loop() {
  // Forward data from SIM800L to Serial Monitor
  if (sim800l.available()) {
    Serial.write(sim800l.read());
  }
  
  // Allow sending AT commands via Serial Monitor
  if (Serial.available()) {
    char c = Serial.read();
    sim800l.write(c);
  }
}

void readSIM800Response() {
  unsigned long timeout = millis() + 2000;  // 2 second timeout
  String response = "";
  
  while (millis() < timeout) {
    if (sim800l.available()) {
      char c = sim800l.read();
      response += c;
      Serial.write(c);
    }
  }
}
