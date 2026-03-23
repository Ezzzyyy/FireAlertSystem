
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useSystemStore } from '../store/useSystemStore';

export default function LocationPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const systemLocation = useSystemStore(state => state.systemLocation);
  const setSystemLocation = useSystemStore(state => state.setSystemLocation);

  // Parse systemLocation into fields if possible (street, municipality, city, province)
  const [street, setStreet] = useState(() => systemLocation.split(',')[0]?.trim() || '');
  const [municipality, setMunicipality] = useState(() => systemLocation.split(',')[1]?.trim() || '');
  const [city, setCity] = useState(() => systemLocation.split(',')[2]?.trim() || '');
  const [province, setProvince] = useState(() => systemLocation.split(',')[3]?.trim() || '');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!street.trim() || !municipality.trim() || !city.trim() || !province.trim()) {
      setError('All fields are required.');
      return;
    }
    setError('');
    const address = [street, municipality, city, province].filter(Boolean).join(', ');
    setSystemLocation(address || 'Your Building');
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Set Your Address</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>Street Address <Text style={styles.asterisk}>*</Text></Text>
      <TextInput
        style={styles.input}
        placeholder="Street Address"
        value={street}
        onChangeText={setStreet}
      />
      <Text style={styles.label}>Municipality <Text style={styles.asterisk}>*</Text></Text>
      <TextInput
        style={styles.input}
        placeholder="Municipality"
        value={municipality}
        onChangeText={setMunicipality}
      />
      <Text style={styles.label}>City <Text style={styles.asterisk}>*</Text></Text>
      <TextInput
        style={styles.input}
        placeholder="City"
        value={city}
        onChangeText={setCity}
      />
      <Text style={styles.label}>Province <Text style={styles.asterisk}>*</Text></Text>
      <TextInput
        style={styles.input}
        placeholder="Province"
        value={province}
        onChangeText={setProvince}
      />
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save Address</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  error: {
    color: '#ff3b30',
    fontSize: 15,
    marginBottom: 8,
    marginLeft: 2,
    fontWeight: 'bold',
  },
  label: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 2,
    marginLeft: 2,
  },
  asterisk: {
    color: '#ff6b00',
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: '#181828',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#232346',
    color: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    fontSize: 18,
  },
  saveButton: {
    backgroundColor: '#ff6b00',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  cancelButton: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});
