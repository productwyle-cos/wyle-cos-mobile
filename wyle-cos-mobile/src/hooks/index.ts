import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../store';
import { authAPI, obligationsAPI, briefAPI, insightsAPI } from '../services/api';
import { STORAGE_KEYS } from '../constants';

// ─── useAuth ──────────────────────────────────────────────────────────────────
export const useAuth = () => {
  const { setAuth, logout, user, isAuthenticated } = useAppStore();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
          const res = await authAPI.me();
          await setAuth(token, res.data.user);
        }
      } catch {
        await logout();
      } finally {
        setInitializing(false);
      }
    };
    restore();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authAPI.login(email, password);
    await setAuth(res.data.token, res.data.user);
    return res.data;
  };

  const register = async (name: string, email: string, password: string, phone?: string) => {
    const res = await authAPI.register({ name, email, password, phone });
    await setAuth(res.data.token, res.data.user);
    return res.data;
  };

  return { user, isAuthenticated, initializing, login, register, logout };
};

// ─── useObligations ───────────────────────────────────────────────────────────
export const useObligations = () => {
  const { obligations, setObligations, updateObligation } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await obligationsAPI.getAll();
      setObligations(res.data.data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const resolve = async (id: string) => {
    await obligationsAPI.resolve(id);
    updateObligation(id, { status: 'completed' });
  };

  const urgent = obligations.filter(o => o.riskLevel === 'high' && o.status !== 'completed');
  const active = obligations.filter(o => o.status !== 'completed');

  return { obligations, active, urgent, loading, error, fetch, resolve };
};

// ─── useBrief ─────────────────────────────────────────────────────────────────
export const useBrief = () => {
  const { morningBrief, setMorningBrief } = useAppStore();
  const [loading, setLoading] = useState(false);

  const fetchMorning = useCallback(async () => {
    setLoading(true);
    try {
      const res = await briefAPI.morning();
      setMorningBrief(res.data.brief);
    } finally {
      setLoading(false);
    }
  }, []);

  return { morningBrief, loading, fetchMorning };
};

// ─── useInsights ──────────────────────────────────────────────────────────────
export const useInsights = () => {
  const { insights, setInsights } = useAppStore();
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await insightsAPI.get();
      setInsights(res.data.insights);
    } finally {
      setLoading(false);
    }
  }, []);

  return { insights, loading, fetch };
};
