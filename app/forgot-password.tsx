import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import app from '../constants/firebaseConfig';

// Responsive helper
const getResponsiveStyles = (width: number) => {
  const isMobile = width < 400;
    return {
      isMobile,
      titleFontSize: isMobile ? 36 : 40,
      buttonFontSize: isMobile ? 24 : 28,
      inputPadding: isMobile ? 18 : 22,
    };
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveStyles(width);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleResetPassword = async () => {
    if (!email) {
      showNotification('Please enter your email address', 'error');
      return;
    }

    setIsLoading(true);
    
    try {
      const auth = getAuth(app);
      await sendPasswordResetEmail(auth, email);
      setIsLoading(false);
      showNotification('Password reset link sent to your email!', 'success');
      setTimeout(() => router.replace('/login'), 2000);
    } catch (error: any) {
      setIsLoading(false);
      let errorMessage = 'Failed to send reset email';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      }
      showNotification(errorMessage, 'error');
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
            <Text style={styles.subtitle}>Reset Password</Text>
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

            <TouchableOpacity
              style={[styles.resetButton, isLoading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.resetButtonText, { fontSize: responsive.buttonFontSize }]}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              disabled={isLoading}
              onPress={() => router.back()}
            >
              <Text style={styles.backLink}>Back to Login</Text>
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
    fontSize: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  resetButton: {
    backgroundColor: '#ff6b6b',
    paddingVertical: 18,
    marginTop: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  backLink: {
    color: '#4ecdc4',
    fontSize: 20,
    fontWeight: 'bold',
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
