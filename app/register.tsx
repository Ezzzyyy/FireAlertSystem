import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';

// Responsive helper
const getResponsiveStyles = (width: number) => {
  const isMobile = width < 400;
  return {
    isMobile,
    titleFontSize: isMobile ? 36 : 40, // Main titles
    buttonFontSize: isMobile ? 24 : 28, // Button text
  };
};

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveStyles(width);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      showNotification('Please fill in all fields', 'error');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      showNotification('Incorrect email', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showNotification('Passwords do not match. Please try again.', 'error');
      return;
    }

    if (password.length < 6) {
      showNotification('Password must be at least 6 characters long', 'error');
      return;
    }

    const result = await register(email, password, name);
    if (result.success) {
      showNotification('Account created successfully! Welcome.', 'success');
      setTimeout(() => router.replace('/dashboard'), 1500);
    } else {
      showNotification(result.message || 'Failed to create account', 'error');
    }
  };

  return (
    <LinearGradient colors={['#0f0f1e', '#1a1a2e']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Notification */}
        {notification && (
          <View style={[styles.notification, notification.type === 'error' ? styles.notificationError : styles.notificationSuccess]}>
            <Text style={styles.notificationText}>{notification.message}</Text>
          </View>
        )}
        
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { fontSize: responsive.titleFontSize }]}>Create Account</Text>
              <Text style={styles.subtitle}>Fire Alert System - Shared Account</Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your full name"
                  placeholderTextColor="#666"
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor="#666"
                  value={email}
                  onChangeText={setEmail}
                  editable={!isLoading}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Enter your password"
                    placeholderTextColor="#666"
                    value={password}
                    onChangeText={setPassword}
                    editable={!isLoading}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm your password"
                    placeholderTextColor="#666"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!isLoading}
                    secureTextEntry={!showConfirmPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={styles.eyeButton}
                  >
                    <Text style={styles.eyeIcon}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.registerButton, isLoading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.registerButtonText, { fontSize: responsive.buttonFontSize }]}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <TouchableOpacity
                disabled={isLoading}
                onPress={() => router.push('/login')}
              >
                <Text style={styles.loginLink}>Login here</Text>
              </TouchableOpacity>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Shared Account Feature</Text>
              <Text style={styles.infoText}>
                This account can be used by multiple users. Share your credentials with family members or team members to monitor your fire alert system together.
              </Text>
            </View>
          </View>
        </ScrollView>
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
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 24,
    color: '#aaa',
  },
  form: {
    width: '100%',
    maxWidth: 350,
  },
  inputContainer: {
    marginBottom: 15,
  },
  label: {
    color: '#fff',
    fontSize: 20,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 0,
    flexShrink: 1,
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 18,
  },
  eyeButton: {
    paddingHorizontal: 6,
    paddingVertical: 10,
    minWidth: 36,
    alignItems: 'center',
    flexShrink: 0,
  },
  eyeIcon: {
    fontSize: 16,
    color: '#4ecdc4',
    fontWeight: '600',
  },
  registerButton: {
    backgroundColor: '#4ecdc4',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 20,
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    color: '#aaa',
    fontSize: 20,
  },
  loginLink: {
    color: '#ff6b6b',
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoBox: {
    marginTop: 30,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  infoTitle: {
    color: '#4ecdc4',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  infoText: {
    color: '#ccc',
    fontSize: 16,
    lineHeight: 22,
  },
  notification: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  notificationSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
  },
  notificationError: {
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
  },
  notificationText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
});
