import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_TIMEOUT, STORAGE_KEYS } from '../constants';

const api = axios.create({ baseURL: API_URL, timeout: API_TIMEOUT });

// ─── Auth interceptor ─────────────────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER]);
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data: { name: string; email: string; password: string; phone?: string }) =>
    api.post('/auth/register', data),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
};

// ─── Onboarding ───────────────────────────────────────────────────────────────
export const onboardingAPI = {
  savePreferences: (prefs: any) => api.post('/onboarding/preferences', prefs),
  seedObligations: () => api.post('/onboarding/obligations/seed'),
  complete: () => api.patch('/onboarding/complete'),
};

// ─── Obligations ──────────────────────────────────────────────────────────────
export const obligationsAPI = {
  getAll: () => api.get('/obligations'),
  getUrgent: () => api.get('/obligations/urgent'),
  create: (data: any) => api.post('/obligations', data),
  update: (id: string, data: any) => api.patch(`/obligations/${id}`, data),
  resolve: (id: string) => api.patch(`/obligations/${id}/resolve`),
  delete: (id: string) => api.delete(`/obligations/${id}`),
};

// ─── Food ─────────────────────────────────────────────────────────────────────
export const foodAPI = {
  submitIntent: (intent: string) => api.post('/food/intent', { intent }),
  confirmOrder: (restaurantId: string, customisation?: string) =>
    api.post('/food/confirm', { restaurantId, customisation }),
};

// ─── Buddy ────────────────────────────────────────────────────────────────────
export const buddyAPI = {
  chat: (message: string, conversationHistory: any[] = []) =>
    api.post('/buddy/chat', { message, conversationHistory }),
};

// ─── Brief ────────────────────────────────────────────────────────────────────
export const briefAPI = {
  morning: () => api.get('/brief/morning'),
  evening: () => api.get('/brief/evening'),
};

// ─── Insights ─────────────────────────────────────────────────────────────────
export const insightsAPI = {
  get: () => api.get('/insights'),
};

export default api;
