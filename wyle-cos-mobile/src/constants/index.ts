// ─── API ──────────────────────────────────────────────────────────────────────
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
export const API_TIMEOUT = Number(process.env.EXPO_PUBLIC_API_TIMEOUT) || 10000;

// ─── Storage Keys ─────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'wyle_token',
  USER: 'wyle_user',
  ONBOARDING_DONE: 'wyle_onboarding_done',
} as const;

// ─── Autonomy Tiers ───────────────────────────────────────────────────────────
export const AUTONOMY_TIERS = {
  0: { label: 'Observer', description: 'Watching and learning' },
  1: { label: 'Suggester', description: 'Recommendations only' },
  2: { label: 'Assistant', description: 'One-tap approvals' },
  3: { label: 'Orchestrator', description: 'Soft automation' },
  4: { label: 'Operator', description: 'Full within guardrails' },
} as const;

// ─── Obligation Types ─────────────────────────────────────────────────────────
export const OBLIGATION_LABELS: Record<string, string> = {
  visa: 'Visa',
  emirates_id: 'Emirates ID',
  car_registration: 'Car Registration',
  insurance: 'Insurance',
  school_fee: 'School Fee',
  mortgage_emi: 'Mortgage / EMI',
  subscription: 'Subscription',
  medical: 'Medical',
  document: 'Document',
  bill: 'Bill',
  custom: 'Other',
};

export const OBLIGATION_ICONS: Record<string, string> = {
  visa: '🛂',
  emirates_id: '🪪',
  car_registration: '🚗',
  insurance: '🛡️',
  school_fee: '🎓',
  mortgage_emi: '🏠',
  subscription: '📱',
  medical: '🏥',
  document: '📄',
  bill: '💡',
  custom: '📌',
};

// ─── Risk ─────────────────────────────────────────────────────────────────────
export const RISK_LABELS: Record<string, string> = {
  high: 'High Risk',
  medium: 'Medium',
  low: 'Low',
};

// ─── Dietary Options (Onboarding) ─────────────────────────────────────────────
export const DIETARY_OPTIONS = [
  { id: 'no-meat', label: 'No Meat', emoji: '🥗' },
  { id: 'vegan', label: 'Vegan', emoji: '🌱' },
  { id: 'gluten-free', label: 'Gluten Free', emoji: '🌾' },
  { id: 'dairy-free', label: 'Dairy Free', emoji: '🥛' },
  { id: 'halal', label: 'Halal', emoji: '☪️' },
  { id: 'no-restriction', label: 'No Restriction', emoji: '🍽️' },
];

export const CUISINE_OPTIONS = [
  { id: 'Lebanese', label: 'Lebanese', emoji: '🇱🇧' },
  { id: 'Indian', label: 'Indian', emoji: '🇮🇳' },
  { id: 'Italian', label: 'Italian', emoji: '🇮🇹' },
  { id: 'Japanese', label: 'Japanese', emoji: '🇯🇵' },
  { id: 'Mediterranean', label: 'Mediterranean', emoji: '🫒' },
  { id: 'Pakistani', label: 'Pakistani', emoji: '🇵🇰' },
  { id: 'Healthy', label: 'Healthy', emoji: '🥙' },
  { id: 'Filipino', label: 'Filipino', emoji: '🇵🇭' },
];

export const WORK_SCHEDULE_OPTIONS = [
  { id: 'standard', label: 'Standard (9–5)', emoji: '🏢' },
  { id: 'flexible', label: 'Flexible Hours', emoji: '⏰' },
  { id: 'shift', label: 'Shift Work', emoji: '🔄' },
];

// ─── Quick Prompts (Buddy) ────────────────────────────────────────────────────
export const BUDDY_QUICK_PROMPTS = [
  "What needs my attention today?",
  "Order me something light for lunch",
  "When does my visa expire?",
  "What bills are due this week?",
  "Show me my obligations",
  "How much time have I saved?",
];
