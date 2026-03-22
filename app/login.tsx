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
    titleFontSize: isMobile ? 28 : 32, // Main titles
    buttonFontSize: isMobile ? 18 : 20, // Button text
    inputPadding: isMobile ? 14 : 16,
  };
};

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveStyles(width);
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showNotification('Please enter both email and password', 'error');
      return;
    }

    const result = await login(email, password);
    if (result.success) {
      showNotification('Login successful! Welcome back.', 'success');
      setTimeout(() => router.replace('/dashboard'), 1500);
    } else {
      showNotification(result.message || 'Invalid email or password. Please try again.', 'error');
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
        
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { fontSize: responsive.titleFontSize }]}>Fire Alert System</Text>
            <Text style={styles.subtitle}>Shared Account Login</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
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

            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.loginButtonText, { fontSize: responsive.buttonFontSize }]}>Login</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity
              disabled={isLoading}
              onPress={() => router.push('/register')}
            >
              <Text style={styles.registerLink}>Create one</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#aaa',
  },
  form: {
    width: '100%',
    maxWidth: 350,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
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
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 18,
  },
  eyeButton: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    minWidth: 45,
    alignItems: 'center',
  },
  eyeIcon: {
    fontSize: 16,
    color: '#4ecdc4',
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: '#ff6b6b',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footer: {
    flexDirection: 'row',
    marginTop: 30,
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    color: '#aaa',
    fontSize: 14,
  },
  registerLink: {
    color: '#4ecdc4',
    fontSize: 14,
    fontWeight: 'bold',
  },
  demoInfo: {
    marginTop: 40,
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  demoTitle: {
    color: '#4ecdc4',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  demoText: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 3,
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
    fontSize: 14,
    fontWeight: '600',
  },
});
