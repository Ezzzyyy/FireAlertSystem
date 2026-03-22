import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/api';

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

const buildHeaders = (token?: string) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const parseErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json();
    return payload?.message || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

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
      const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        set({ isLoading: false, error: message });
        return { success: false, message };
      }

      const payload = await response.json();
      const user: User = payload.user;
      const token: string = payload.token;

      await AsyncStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token, user })
      );

      set({ user, token, isAuthenticated: true, isLoading: false, error: null });
      return { success: true };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        set({ isLoading: false, error: 'Auth request timed out. Check API server/network and try again.' });
        return { success: false, message: 'Auth request timed out. Check API server/network and try again.' };
      }
      set({ isLoading: false, error: 'Unable to connect to auth server.' });
      return { success: false, message: 'Unable to connect to auth server.' };
    }
  },

  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response);
        set({ isLoading: false, error: message });
        return { success: false, message };
      }

      const payload = await response.json();
      const user: User = payload.user;
      const token: string = payload.token;

      await AsyncStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token, user })
      );

      set({ user, token, isAuthenticated: true, isLoading: false, error: null });
      return { success: true };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        set({ isLoading: false, error: 'Auth request timed out. Check API server/network and try again.' });
        return { success: false, message: 'Auth request timed out. Check API server/network and try again.' };
      }
      set({ isLoading: false, error: 'Unable to connect to auth server.' });
      return { success: false, message: 'Unable to connect to auth server.' };
    }
  },

  logout: () => {
    set((state) => {
      if (state.token) {
        fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: buildHeaders(state.token),
        }).catch(() => {});
      }
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

      const parsed = JSON.parse(raw) as { token: string; user: User };
      if (!parsed?.token) {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
        return;
      }

      const response = await fetchWithTimeout(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: buildHeaders(parsed.token),
      });

      if (!response.ok) {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
        return;
      }

      const payload = await response.json();
      const user: User = payload.user || parsed.user;

      await AsyncStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: parsed.token, user })
      );

      set({
        user,
        token: parsed.token,
        isAuthenticated: true,
        isHydrated: true,
        error: null,
      });
    } catch {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => {});
      set({ isHydrated: true, isAuthenticated: false, user: null, token: null });
    }
  },
}));
