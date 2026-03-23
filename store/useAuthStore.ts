import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import app from '../constants/firebaseConfig';

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
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'fas_auth_session';
const REQUEST_TIMEOUT_MS = 10000;


const auth = getAuth(app);

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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      const user: User = {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || '',
      };
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user }));
      set({ user, token: null, isAuthenticated: true, isLoading: false, error: null });
      return { success: true };
    } catch (error: any) {
      set({ isLoading: false, error: error.message || 'Login failed' });
      return { success: false, message: error.message || 'Login failed' };
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      // Optionally update displayName
      if (firebaseUser && name) {
        await updateProfile(firebaseUser, { displayName: name });
      }
      const user: User = {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: name || '',
      };
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user }));
      set({ user, token: null, isAuthenticated: true, isLoading: false, error: null });
      return { success: true };
    } catch (error: any) {
      set({ isLoading: false, error: error.message || 'Registration failed' });
      return { success: false, message: error.message || 'Registration failed' };
    }
  },

  logout: () => {
    set(() => {
      signOut(auth).catch(() => {});
      AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
      return { user: null, token: null, isAuthenticated: false, error: null };
    });
  },

  checkAuth: async () => {
    try {
      const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
        return;
      }
      const parsed = JSON.parse(raw) as { user: User };
      const validUser = parsed.user && parsed.user.email && parsed.user.id;
      if (validUser) {
        set({
          user: parsed.user,
          token: null,
          isAuthenticated: true,
          isHydrated: true,
          error: null,
        });
      } else {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
        set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
      }
    } catch {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
      set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
    }
  },
}));
