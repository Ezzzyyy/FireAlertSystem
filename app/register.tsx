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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';

// Responsive helper
const getResponsiveStyles = (width) => {
  const isMobile = width < 400;
    return {
      isMobile,
      titleFontSize: isMobile ? 36 : 40,
      buttonFontSize: isMobile ? 24 : 28,
      inputPadding: isMobile ? 18 : 22,
    };
};

export default function RegisterPage() {
  const router = useRouter();
  const { register, sendOtp, verifyOtp, isLoading } = useAuthStore();
  const { width } = useWindowDimensions();
  const responsive = getResponsiveStyles(width);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleInitial, setMiddleInitial] = useState('');
  const [lastName, setLastName] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [canResendOtp, setCanResendOtp] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [notification, setNotification] = useState(null);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [generalError, setGeneralError] = useState('');

  const validateEmail = (email) => {
    // More strict email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return false;
    }
    
    // Additional checks
    const parts = email.split('@');
    if (parts.length !== 2) {
      return false;
    }
    
    const [localPart, domain] = parts;
    
    // Local part should not be empty
    if (localPart.length === 0) {
      return false;
    }
    
    // Domain should have at least one dot
    if (!domain.includes('.')) {
      return false;
    }
    
    // Domain parts should not be empty
    const domainParts = domain.split('.');
    if (domainParts.some(part => part.length === 0)) {
      return false;
    }
    
    // TLD should be at least 2 characters
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2) {
      return false;
    }
    
    return true;
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSendOtp = async () => {
    setEmailError('');
    setGeneralError('');
    if (!email) {
      setEmailError('Please enter your email');
      return;
    }
    if (!validateEmail(email)) {
      setEmailError('Invalid email format');
      return;
    }
    
    const result = await sendOtp(email);
    if (result.success) {
      setShowOtpInput(true);
      showNotification('OTP sent to your email', 'success');
      if (result.otp) {
        showNotification(`Development OTP: ${result.otp}`, 'success');
      }
      setCanResendOtp(false);
      setResendCountdown(30);
      const countdown = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            setCanResendOtp(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setEmailError(result.message || 'Failed to send OTP');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      showNotification('Please enter a valid 6-digit OTP', 'error');
      return;
    }
    const result = await verifyOtp(email, otp);
    if (result.success) {
      setShowOtpInput(false);
      showNotification('OTP verified! Completing registration...', 'success');
      const fullName = `${firstName} ${middleInitial ? middleInitial + '. ' : ''}${lastName}`.trim();
      const registerResult = await register(email, password, fullName);
      if (registerResult.success) {
        showNotification('Registration successful! Welcome.', 'success');
        setTimeout(() => router.replace('/dashboard'), 1500);
      } else {
        showNotification(registerResult.message || 'Registration failed', 'error');
      }
    } else {
      showNotification(result.message || 'Invalid OTP', 'error');
    }
  };

  const handleRegister = async () => {
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setFirstNameError('');
    setLastNameError('');
    setGeneralError('');

    if (!email && !password && !firstName && !lastName) {
      setGeneralError('Please fill in all fields');
      return;
    }

    if (!email) {
      setEmailError('Please enter your email');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Invalid email format');
      return;
    }

    if (!password) {
      setPasswordError('Please enter a password');
      return;
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      return;
    }

    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      return;
    }

    if (!firstName.trim()) {
      setFirstNameError('Please enter your first name');
      return;
    }

    if (!lastName.trim()) {
      setLastNameError('Please enter your last name');
      return;
    }

    await handleSendOtp();
  };

  return (
    <LinearGradient colors={['#0f0f1e', '#1a1a2e']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Notification */}
            {notification && (
              <View style={[styles.notification, notification.type === 'error' ? styles.notificationError : styles.notificationSuccess]}>
                <Text style={styles.notificationText}>{notification.message}</Text>
                <TouchableOpacity onPress={() => setNotification(null)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.content}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { fontSize: responsive.titleFontSize }]}>Fire Alert System</Text>
                  <Text style={styles.subtitle}>Create Account</Text>
              </View>

              {/* Form */}
          <View style={styles.form}>
            {!showOtpInput && (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your first name"
                    placeholderTextColor="#666"
                    value={firstName}
                    onChangeText={(text) => {
                      setFirstName(text);
                      setFirstNameError('');
                    }}
                    editable={!isLoading}
                    autoCapitalize="words"
                    nativeID="firstName"
                    accessibilityLabel="First Name"
                  />
                  {firstNameError ? <Text style={styles.errorText}>{firstNameError}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Middle Initial</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="M"
                    placeholderTextColor="#666"
                    value={middleInitial}
                    onChangeText={setMiddleInitial}
                    editable={!isLoading}
                    autoCapitalize="characters"
                    maxLength={1}
                    nativeID="middleInitial"
                    accessibilityLabel="Middle Initial"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your last name"
                    placeholderTextColor="#666"
                    value={lastName}
                    onChangeText={(text) => {
                      setLastName(text);
                      setLastNameError('');
                    }}
                    editable={!isLoading}
                    autoCapitalize="words"
                    nativeID="lastName"
                    accessibilityLabel="Last Name"
                  />
                  {lastNameError ? <Text style={styles.errorText}>{lastNameError}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor="#666"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      setEmailError('');
                    }}
                    editable={!isLoading}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    nativeID="email"
                    accessibilityLabel="Email"
                  />
                  {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.passwordInputWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter your password"
                      placeholderTextColor="#666"
                      value={password}
                      onChangeText={(text) => {
                        setPassword(text);
                        setPasswordError('');
                      }}
                      editable={!isLoading}
                      secureTextEntry={!showPassword}
                      nativeID="password"
                      accessibilityLabel="Password"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                    >
                      <Text style={styles.eyeIcon}>{showPassword ? 'Hide' : 'Show'}</Text>
                    </TouchableOpacity>
                  </View>
                  {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                </View>

                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.passwordInputWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Confirm your password"
                      placeholderTextColor="#666"
                      value={confirmPassword}
                      onChangeText={(text) => {
                        setConfirmPassword(text);
                        setConfirmPasswordError('');
                      }}
                      editable={!isLoading}
                      secureTextEntry={!showPassword}
                      nativeID="confirmPassword"
                      accessibilityLabel="Confirm Password"
                    />
                  </View>
                  {confirmPasswordError ? <Text style={styles.errorText}>{confirmPasswordError}</Text> : null}
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, isLoading && styles.buttonDisabled]}
                  onPress={handleRegister}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.loginButtonText, { fontSize: responsive.buttonFontSize }]}>Register</Text>
                  )}
                </TouchableOpacity>
                {generalError ? <Text style={styles.generalErrorText}>{generalError}</Text> : null}
              </>
            )}

            {showOtpInput && (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Enter OTP</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor="#666"
                    value={otp}
                    onChangeText={setOtp}
                    editable={!isLoading}
                    keyboardType="number-pad"
                    maxLength={6}
                    nativeID="otp"
                    accessibilityLabel="OTP Code"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.loginButton, isLoading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={[styles.loginButtonText, { fontSize: responsive.buttonFontSize }]}>Verify OTP</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={handleSendOtp}
                  disabled={!canResendOtp || isLoading}
                >
                  <Text style={[styles.resendButtonText, !canResendOtp && styles.resendButtonTextDisabled]}>
                    {canResendOtp ? 'Resend OTP' : `Resend in ${resendCountdown}s`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Already have an account?</Text>
                <TouchableOpacity
                  disabled={isLoading}
                  onPress={() => router.push('/login')}
                >
                  <Text style={styles.registerLink}>Login</Text>
                </TouchableOpacity>
              </View>

              {/* Multi-device note */}
              <View style={styles.multiDeviceNote}>
                <Text style={styles.multiDeviceNoteText}>
                  Your account can be used on multiple devices with the same data synced across all of them.
                </Text>
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
    paddingTop: 20,
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
  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 4,
  },
  generalErrorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
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
    flexShrink: 0,
  },
  eyeIcon: {
    fontSize: 16,
    color: '#4ecdc4',
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: '#ff6b6b',
    paddingVertical: 18,
    marginTop: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  loginButtonText: {
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
  },
  footerText: {
    color: '#aaa',
    fontSize: 20,
  },
  registerLink: {
    color: '#4ecdc4',
    fontSize: 20,
    fontWeight: 'bold',
  },
  multiDeviceNote: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(78, 205, 196, 0.3)',
  },
  multiDeviceNoteText: {
    color: '#4ecdc4',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  notification: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: {
    paddingHorizontal: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  resendButton: {
    marginTop: 15,
    paddingVertical: 10,
  },
  resendButtonText: {
    color: '#4ecdc4',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  resendButtonTextDisabled: {
    color: '#666',
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
