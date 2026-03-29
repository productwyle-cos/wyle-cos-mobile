import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UIObligation, InsightsData, MorningBrief } from '../types';
import { STORAGE_KEYS } from '../constants';

// ── Mock data uses UIObligation — clean, no backend fields needed ──────────────
const INITIAL_OBLIGATIONS: UIObligation[] = [
  { _id: '1', emoji: '🎓', title: 'School Fee — Q3',       type: 'school_fee',       daysUntil: 0,  risk: 'high',   amount: 14000, status: 'active', executionPath: 'Pay via school parent portal',   notes: 'Due today — avoid late fee' },
  { _id: '2', emoji: '🪪', title: 'Emirates ID Renewal',   type: 'emirates_id',      daysUntil: 5,  risk: 'high',   amount: 370,   status: 'active', executionPath: 'ICA smart app — 20min process',  notes: 'Renewal takes 3-5 working days' },
  { _id: '3', emoji: '🚗', title: 'Range Rover Reg.',       type: 'car_registration', daysUntil: 7,  risk: 'high',   amount: 450,   status: 'active', executionPath: 'RTA online portal or drive-in',  notes: 'Needs valid insurance first' },
  { _id: '4', emoji: '🛂', title: 'UAE Residence Visa',     type: 'visa',             daysUntil: 14, risk: 'medium', amount: null,  status: 'active', executionPath: 'GDRFA website — 45min process', notes: 'Requires passport + EID copy' },
  { _id: '5', emoji: '💡', title: 'DEWA Bill',              type: 'bill',             daysUntil: 12, risk: 'medium', amount: 850,   status: 'active', executionPath: 'DEWA app — auto pay',            notes: null },
  { _id: '6', emoji: '🛡️', title: 'Car Insurance',          type: 'insurance',        daysUntil: 38, risk: 'low',    amount: 2100,  status: 'active', executionPath: 'AXA UAE app',                    notes: null },
];

interface AppState {
  // Auth
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;

  // Onboarding
  setOnboardingComplete: () => void;

  // Obligations — all UIObligation now
  obligations: UIObligation[];
  setObligations: (obs: UIObligation[]) => void;
  updateObligation: (id: string, updates: Partial<UIObligation>) => void;
  addObligation: (ob: UIObligation) => void;
  addObligations: (obs: UIObligation[]) => void;
  resolveObligation: (id: string) => void;

  // Brief — morning/evening
  lastBriefKey: string | null;
  setLastBriefKey: (key: string) => void;

  // Google / Life Signal Engine
  googleConnected: boolean;
  googleEmail: string;
  setGoogleConnected: (connected: boolean) => void;
  setGoogleEmail: (email: string) => void;
  googleAccounts: string[];
  addGoogleAccount: (email: string) => void;
  removeGoogleAccount: (email: string) => void;
  setGoogleAccounts: (accounts: string[]) => void;

  // Microsoft Outlook
  outlookAccounts: string[];
  addOutlookAccount: (email: string) => void;
  removeOutlookAccount: (email: string) => void;
  setOutlookAccounts: (accounts: string[]) => void;

  // Insights
  insights: InsightsData | null;
  setInsights: (data: InsightsData) => void;

  // Brief
  morningBrief: MorningBrief | null;
  setMorningBrief: (brief: MorningBrief) => void;

  // UI
  isLoading: boolean;
  setLoading: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  obligations: INITIAL_OBLIGATIONS,
  insights: null,
  morningBrief: null,
  lastBriefKey: null,
  googleConnected: false,
  googleEmail: '',
  // Auto-load from localStorage so store survives page reloads / OAuth redirects
  googleAccounts: (() => {
    try {
      if (typeof localStorage !== 'undefined') {
        return JSON.parse(localStorage.getItem('wyle_google_accounts') ?? '[]');
      }
    } catch {}
    return [];
  })(),
  outlookAccounts: (() => {
    try {
      if (typeof localStorage !== 'undefined') {
        return JSON.parse(localStorage.getItem('wyle_outlook_accounts') ?? '[]');
      }
    } catch {}
    return [];
  })(),
  isLoading: false,

  setAuth: async (token, user) => {
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.multiRemove([STORAGE_KEYS.AUTH_TOKEN, STORAGE_KEYS.USER]);
    set({ token: null, user: null, isAuthenticated: false, obligations: INITIAL_OBLIGATIONS, insights: null, morningBrief: null });
  },

  updateUser: (user) => set({ user }),

  setOnboardingComplete: () => {
    const { user } = get();
    const updated = user ? { ...user, onboardingComplete: true } : user;
    set({ user: updated });
    if (updated) AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updated));
  },

  setObligations: (obligations) => set({ obligations }),

  updateObligation: (id, updates) => {
    const updated = get().obligations.map(o => o._id === id ? { ...o, ...updates } : o);
    set({ obligations: updated });
  },

  addObligation: (ob) => set((state) => ({
    obligations: [ob, ...state.obligations],
  })),

  addObligations: (obs) => set((state) => ({
    obligations: [...obs, ...state.obligations],
  })),

  resolveObligation: (id) => set((state) => ({
    obligations: state.obligations.map(o =>
      o._id === id ? { ...o, status: 'completed' } : o
    ),
  })),

  setInsights: (insights) => set({ insights }),
  setMorningBrief: (morningBrief) => set({ morningBrief }),
  setLastBriefKey: (lastBriefKey) => set({ lastBriefKey }),
  setGoogleConnected: (googleConnected) => set({ googleConnected }),
  setGoogleEmail: (googleEmail) => set({ googleEmail }),
  setLoading: (isLoading) => set({ isLoading }),

  addGoogleAccount: (email) => set(state => ({
    googleAccounts: [...new Set([...state.googleAccounts, email])],
    googleConnected: true,
    googleEmail: state.googleEmail || email,  // set primary if not set
  })),

  removeGoogleAccount: (email) => set(state => {
    const updated = state.googleAccounts.filter(e => e !== email);
    return {
      googleAccounts: updated,
      googleConnected: updated.length > 0,
      googleEmail: updated[0] ?? '',
    };
  }),

  setGoogleAccounts: (googleAccounts) => set(state => ({
    googleAccounts,
    googleConnected: googleAccounts.length > 0,
    googleEmail: googleAccounts[0] ?? state.googleEmail,
  })),

  addOutlookAccount: (email) => set(state => ({
    outlookAccounts: [...new Set([...state.outlookAccounts, email])],
  })),

  removeOutlookAccount: (email) => set(state => ({
    outlookAccounts: state.outlookAccounts.filter(e => e !== email),
  })),

  setOutlookAccounts: (outlookAccounts) => set({ outlookAccounts }),
}));