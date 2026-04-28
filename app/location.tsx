import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { useSystemStore } from '../store/useSystemStore';
import { Picker } from '@react-native-picker/picker';

export default function LocationPage() {
  const { width } = useWindowDimensions();
  // Responsive helpers
  const isMobile = width < 400;
  const isTablet = width >= 400 && width < 800;
  const isDesktop = width >= 800;
  const responsive = {
    containerPadding: isMobile ? 12 : isTablet ? 32 : 64,
    cardPadding: isMobile ? 10 : isTablet ? 18 : 28,
    cardRadius: isMobile ? 8 : 12,
    inputFontSize: isMobile ? 14 : isTablet ? 16 : 18,
    labelFontSize: isMobile ? 12 : isTablet ? 14 : 16,
    buttonFontSize: isMobile ? 15 : isTablet ? 17 : 19,
    buttonWidth: isMobile ? 160 : isTablet ? 200 : 240,
    dropdownFontSize: isMobile ? 13 : isTablet ? 15 : 17,
    maxWidth: isMobile ? undefined : isTablet ? 400 : 480, // Only set maxWidth as number for tablet/desktop
    fullWidth: '100%',
  };
  const router = useRouter();
  const { user } = useAuthStore();
  const systemLocation = useSystemStore(state => state.systemLocation);
  const setSystemLocation = useSystemStore(state => state.setSystemLocation);

  // Parse systemLocation into fields if possible (street, municipality, city, province)
  const [street, setStreet] = useState(() => systemLocation.split(',')[0]?.trim() || '');
  // Address dropdown state
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [error, setError] = useState('');

  // API data and loading states
  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // Load saved address on mount
  React.useEffect(() => {
    if (systemLocation) {
      const parts = systemLocation.split(',').map(p => p.trim());
      
      // Determine if first part is street address or barangay
      // If we have 5 parts, first is street, rest are location
      // If we have 4 parts, no street address, all are location
      let streetAddress = '';
      let locationParts = parts;
      
      if (parts.length === 5) {
        streetAddress = parts[0];
        locationParts = parts.slice(1);
      } else if (parts.length === 4) {
        streetAddress = '';
        locationParts = parts;
      }
      
      setStreet(streetAddress);
      
      const savedBarangay = locationParts[0] || '';
      const savedCity = locationParts[1] || '';
      const savedProvince = locationParts[2] || '';
      const savedRegion = locationParts[3] || '';

      if (savedRegion && regions.length > 0) {
        const regionMatch = regions.find(r => r.name === savedRegion);
        if (regionMatch) {
          setSelectedRegion(regionMatch.code);
          fetch(`https://psgc.gitlab.io/api/regions/${regionMatch.code}/provinces/`)
            .then(res => res.json())
            .then(data => {
              setProvinces(data);
              const provinceMatch = data.find(p => p.name === savedProvince);
              if (provinceMatch) {
                setSelectedProvince(provinceMatch.code);
                fetch(`https://psgc.gitlab.io/api/provinces/${provinceMatch.code}/cities-municipalities/`)
                  .then(res => res.json())
                  .then(cityData => {
                    setCities(cityData);
                    const cityMatch = cityData.find(c => c.name === savedCity);
                    if (cityMatch) {
                      setSelectedCity(cityMatch.code);
                      fetch(`https://psgc.gitlab.io/api/cities-municipalities/${cityMatch.code}/barangays/`)
                        .then(res => res.json())
                        .then(barangayData => {
                          setBarangays(barangayData);
                          const barangayMatch = barangayData.find(b => b.name === savedBarangay);
                          if (barangayMatch) {
                            setSelectedBarangay(barangayMatch.name);
                          }
                        });
                    }
                  });
              }
            });
        }
      }
    }
  }, [systemLocation, regions]);

  // Fetch regions on mount
  React.useEffect(() => {
    setLoadingRegions(true);
    fetch('https://psgc.gitlab.io/api/regions/')
      .then(res => res.json())
      .then(data => {
        setRegions(data);
        setLoadingRegions(false);
      })
      .catch(() => setLoadingRegions(false));
  }, []);

  // Fetch provinces when region changes
  React.useEffect(() => {
    if (!selectedRegion) {
      setProvinces([]);
      return;
    }
    setLoadingProvinces(true);
    fetch(`https://psgc.gitlab.io/api/regions/${selectedRegion}/provinces/`)
      .then(res => res.json())
      .then(data => {
        setProvinces(data);
        setLoadingProvinces(false);
      })
      .catch(() => setLoadingProvinces(false));
  }, [selectedRegion]);

  // Fetch cities/municipalities when province changes
  React.useEffect(() => {
    if (!selectedProvince) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    fetch(`https://psgc.gitlab.io/api/provinces/${selectedProvince}/cities-municipalities/`)
      .then(res => res.json())
      .then(data => {
        setCities(data);
        setLoadingCities(false);
      })
      .catch(() => setLoadingCities(false));
  }, [selectedProvince]);

  // Fetch barangays when city/municipality changes
  React.useEffect(() => {
    if (!selectedCity) {
      setBarangays([]);
      return;
    }
    setLoadingBarangays(true);
    fetch(`https://psgc.gitlab.io/api/cities-municipalities/${selectedCity}/barangays/`)
      .then(res => res.json())
      .then(data => {
        setBarangays(data);
        setLoadingBarangays(false);
      })
      .catch(() => setLoadingBarangays(false));
  }, [selectedCity]);

  const handleSave = async () => {
    if (!selectedRegion || !selectedProvince || !selectedCity || !selectedBarangay) {
      setError('Region, Province, City, and Barangay are required.');
      return;
    }
    setError('');
    // Find the display names for each selected code
    const regionObj = regions.find(r => r.code === selectedRegion);
    const provinceObj = provinces.find(p => p.code === selectedProvince);
    const cityObj = cities.find(c => c.code === selectedCity);
    const barangayObj = barangays.find(b => b.name === selectedBarangay);
    const address = [
      street.trim(),
      barangayObj ? barangayObj.name : selectedBarangay,
      cityObj ? cityObj.name : selectedCity,
      provinceObj ? provinceObj.name : selectedProvince,
      regionObj ? regionObj.name : selectedRegion
    ].filter(Boolean).join(', ');
    
    setSystemLocation(address);
    
    // Save to backend
    const { token } = useAuthStore.getState();
    if (token) {
      try {
        const response = await fetch('https://firealertsystem-dcxc.onrender.com/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            state: {
              systemLocation: address,
            },
          }),
        });
        if (!response.ok) {
          console.error('Failed to save location to backend');
        }
      } catch (error) {
        console.error('Error saving location to backend:', error);
      }
    }
    
    router.back();
  };

  return (
    <LinearGradient colors={['#0f0f1e', '#1a1a2e']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity 
                  style={styles.backButton} 
                  onPress={() => {
                    console.log('Back button pressed');
                    router.back();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.backButtonIcon}>
                    <Text style={styles.backButtonText}>←</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.headerTextContainer}>
                  <Text style={[styles.title, { fontSize: isMobile ? 32 : isTablet ? 36 : 40 }]}>Fire Alert System</Text>
                  <Text style={styles.subtitle}>Set Your Address</Text>
                </View>
              </View>

              {/* Error Message */}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Form */}
              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Street Address (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 123 Main Street, Block 5"
                    placeholderTextColor="#666"
                    value={street}
                    onChangeText={setStreet}
                  />
                </View>

                {/* Region Dropdown */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Region <Text style={styles.required}>*</Text></Text>
                  <View style={styles.pickerContainer}>
                    {loadingRegions ? (
                      <ActivityIndicator color="#fff" style={{ padding: 12 }} />
                    ) : (
                      <Picker
                        selectedValue={selectedRegion}
                        onValueChange={value => {
                          setSelectedRegion(value);
                          setSelectedProvince('');
                          setSelectedCity('');
                          setSelectedBarangay('');
                        }}
                        style={styles.picker}
                        dropdownIconColor="#fff"
                        itemStyle={{ color: '#fff', backgroundColor: '#232346' }}
                      >
                        <Picker.Item label="Select Region" value="" color="#fff" style={{ backgroundColor: '#232346' }} />
                        {regions.map(region => (
                          <Picker.Item key={region.code} label={region.name} value={region.code} color="#fff" style={{ backgroundColor: '#232346' }} />
                        ))}
                      </Picker>
                    )}
                  </View>
                </View>

                {/* Province Dropdown */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Province <Text style={styles.required}>*</Text></Text>
                  <View style={[styles.pickerContainer, !selectedRegion && styles.pickerDisabled]}>
                    {loadingProvinces ? (
                      <ActivityIndicator color="#fff" style={{ padding: 12 }} />
                    ) : (
                      <Picker
                        enabled={!!selectedRegion}
                        selectedValue={selectedProvince}
                        onValueChange={value => {
                          setSelectedProvince(value);
                          setSelectedCity('');
                          setSelectedBarangay('');
                        }}
                        style={styles.picker}
                        dropdownIconColor="#fff"
                        itemStyle={{ color: '#fff', backgroundColor: '#232346' }}
                      >
                        <Picker.Item label="Select Province" value="" color="#fff" style={{ backgroundColor: '#232346' }} />
                        {provinces.map(province => (
                          <Picker.Item key={province.code} label={province.name} value={province.code} color="#fff" style={{ backgroundColor: '#232346' }} />
                        ))}
                      </Picker>
                    )}
                  </View>
                </View>

                {/* City/Municipality Dropdown */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>City/Municipality <Text style={styles.required}>*</Text></Text>
                  <View style={[styles.pickerContainer, !selectedProvince && styles.pickerDisabled]}>
                    {loadingCities ? (
                      <ActivityIndicator color="#fff" style={{ padding: 12 }} />
                    ) : (
                      <Picker
                        enabled={!!selectedProvince}
                        selectedValue={selectedCity}
                        onValueChange={value => {
                          setSelectedCity(value);
                          setSelectedBarangay('');
                        }}
                        style={styles.picker}
                        dropdownIconColor="#fff"
                        itemStyle={{ color: '#fff', backgroundColor: '#232346' }}
                      >
                        <Picker.Item label="Select City/Municipality" value="" color="#fff" style={{ backgroundColor: '#232346' }} />
                        {cities.map(city => (
                          <Picker.Item key={city.code} label={city.name} value={city.code} color="#fff" style={{ backgroundColor: '#232346' }} />
                        ))}
                      </Picker>
                    )}
                  </View>
                </View>

                {/* Barangay Dropdown */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Barangay <Text style={styles.required}>*</Text></Text>
                  <View style={[styles.pickerContainer, !selectedCity && styles.pickerDisabled]}>
                    {loadingBarangays ? (
                      <ActivityIndicator color="#fff" style={{ padding: 12 }} />
                    ) : (
                      <Picker
                        enabled={!!selectedCity}
                        selectedValue={selectedBarangay}
                        onValueChange={setSelectedBarangay}
                        style={styles.picker}
                        dropdownIconColor="#fff"
                        itemStyle={{ color: '#fff', backgroundColor: '#232346' }}
                      >
                        <Picker.Item label="Select Barangay" value="" color="#fff" style={{ backgroundColor: '#232346' }} />
                        {barangays.map(barangay => (
                          <Picker.Item key={barangay.code} label={barangay.name} value={barangay.name} color="#fff" style={{ backgroundColor: '#232346' }} />
                        ))}
                      </Picker>
                    )}
                  </View>
                </View>

                {/* Buttons */}
                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={[styles.saveButtonText, { fontSize: isMobile ? 20 : 24 }]}>Save Address</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
  },
  backButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTextContainer: {
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#888',
    fontSize: 16,
    marginTop: 8,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    color: '#bbb',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  required: {
    color: '#ff6b00',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    height: 56,
  },
  pickerContainer: {
    backgroundColor: '#232346',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    height: 56,
  },
  pickerDisabled: {
    opacity: 0.5,
  },
  picker: {
    color: '#fff',
    backgroundColor: '#232346',
    fontSize: 16,
    width: '100%',
    height: 56,
  },
  saveButton: {
    backgroundColor: '#4ecdc4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});
