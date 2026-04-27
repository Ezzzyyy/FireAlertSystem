import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, browserLocalPersistence, onAuthStateChanged } from 'firebase/auth';
import app from '../constants/firebaseConfig';
import Constants from 'expo-constants';

// Web-compatible storage helper
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  },
};

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; message?: string }>;
  sendOtp: (email: string) => Promise<{ success: boolean; message?: string; otp?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'fas_auth_session';
const REQUEST_TIMEOUT_MS = 10000;

// Get API URL from app config
const getApiUrl = () => {
  const apiUrl = Constants.expoConfig?.extra?.apiBaseUrl || 'http://10.33.72.50:4000';
  return apiUrl;
};


const auth = getAuth(app);

// Set Firebase Auth persistence for web
if (typeof window !== 'undefined') {
  auth.setPersistence(browserLocalPersistence).catch((error) => {
    console.error('Firebase auth persistence error:', error);
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isHydrated: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Login failed');
      }
      const user: User = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      };
      const token = data.token;
      await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, token }));
      set({ user, token, isAuthenticated: true, isLoading: false, error: null });
      return { success: true };
    } catch (error: any) {
      set({ isLoading: false, error: error.message || 'Login failed' });
      return { success: false, message: error.message || 'Login failed' };
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const apiUrl = getApiUrl();
      console.log('[Auth Register] Attempting registration for:', email);
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await response.json();
      console.log('[Auth Register] Response status:', response.status);
      console.log('[Auth Register] Response data:', data);
      
      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }
      
      const user: User = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      };
      const token = data.token;
      await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, token }));
      set({ user, token, isAuthenticated: true, isLoading: false, error: null });
      console.log('[Auth Register] Registration successful');
      return { success: true };
    } catch (error: any) {
      let message = error.message || 'Registration failed';
      console.error('[Auth Register] Error:', message);
      set({ isLoading: false, error: message });
      return { success: false, message };
    }
  },

  sendOtp: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      set({ isLoading: false, error: null });
      return { success: data.success, message: data.message, otp: data.otp };
    } catch (error: any) {
      set({ isLoading: false, error: error.message || 'Failed to send OTP' });
      return { success: false, message: error.message || 'Failed to send OTP' };
    }
  },

  verifyOtp: async (email: string, otp: string) => {
    set({ isLoading: true, error: null });
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await response.json();
      set({ isLoading: false, error: null });
      return { success: data.success, message: data.message };
    } catch (error: any) {
      set({ isLoading: false, error: error.message || 'Failed to verify OTP' });
      return { success: false, message: error.message || 'Failed to verify OTP' };
    }
  },

  logout: async () => {
    try {
      const apiUrl = getApiUrl();
      const token = useAuthStore.getState().token;
      if (token) {
        await fetch(`${apiUrl}/auth/logout`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
    set(() => {
      storage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
      return { user: null, token: null, isAuthenticated: false, error: null };
    });
  },

  checkAuth: async () => {
    console.log('[checkAuth] Starting auth check...');
    try {
      const raw = await storage.getItem(AUTH_STORAGE_KEY);
      console.log('[checkAuth] Storage raw data:', raw);
      
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { user: User; token: string | null };
          const validUser = parsed.user && parsed.user.email && parsed.user.id;
          console.log('[checkAuth] Parsed user from storage:', parsed.user);
          console.log('[checkAuth] Parsed token from storage:', parsed.token);
          
          if (validUser) {
            if (!parsed.token) {
              await storage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
              set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
              return;
            }

            const apiUrl = getApiUrl();
            const sessionResponse = await fetch(`${apiUrl}/auth/me`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${parsed.token}`,
              },
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            if (!sessionResponse.ok) {
              console.log('[checkAuth] Stored session is invalid, clearing auth state');
              await storage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
              set({ isHydrated: true, isAuthenticated: false, user: null, token: null, error: null });
              return;
            }

            const mePayload = await sessionResponse.json();
            const normalizedUser: User = {
              id: mePayload?.user?.id || parsed.user.id,
              email: mePayload?.user?.email || parsed.user.email,
              name: mePayload?.user?.name || parsed.user.name,
            };

            await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user: normalizedUser, token: parsed.token }));
            set({
              user: normalizedUser,
              token: parsed.token,
              isAuthenticated: true,
              isHydrated: true,
              error: null,
            });
            console.log('[checkAuth] Restored validated session from storage');
            return;
          } else {
            console.log('[checkAuth] Invalid user in storage, removing');
            await storage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
          }
        } catch (e) {
          console.error('[checkAuth] Error parsing storage:', e);
          await storage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
        }
      }

      console.log('[checkAuth] No user found, setting as logged out');
      set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
    } catch (e) {
      console.error('[checkAuth] Error in checkAuth:', e);
      set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
    }
  },
}));
