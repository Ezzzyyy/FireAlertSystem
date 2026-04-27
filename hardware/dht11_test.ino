#include <DHT.h>

#define DHT_PIN 4      // DHT11 data pin on GPIO 4
#define DHT_TYPE DHT11 // DHT 11

DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n\n=== DHT11 Temperature/Humidity Test ===");
  Serial.println("Initializing DHT11 on GPIO 4...");
  
  dht.begin();
  delay(2000);
  Serial.println("DHT11 initialized!");
}

void loop() {
  // Read humidity and temperature
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  
  // Check if any reads failed
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Failed to read from DHT sensor!");
    delay(2000);
    return;
  }
  
  // Display results
  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.print("°C  |  Humidity: ");
  Serial.print(humidity);
  Serial.println("%");
  
  // Delay before next read (DHT11 needs ~2 seconds between reads)
  delay(2000);
}
