// ─── User ─────────────────────────────────────────────────────────────────────
export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  onboardingComplete: boolean;
  onboardingStep: number;
  preferences: UserPreferences;
  autonomyTier: 0 | 1 | 2 | 3 | 4;
  insights: UserInsights;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  dietary: string[];
  cuisines: string[];
  mealBudget: number;
  householdSize: number;
  hasChildren: boolean;
  workSchedule: 'standard' | 'flexible' | 'shift';
  protectedTimeBlocks: string[];
}

export interface UserInsights {
  totalTimeSavedMinutes: number;
  totalDecisionsHandled: number;
  totalMoneySavedAED: number;
}

// ─── Obligation (backend model — do not modify) ────────────────────────────────
export type ObligationType =
  | 'visa'
  | 'emirates_id'
  | 'car_registration'
  | 'insurance'
  | 'school_fee'
  | 'mortgage_emi'
  | 'subscription'
  | 'medical'
  | 'document'
  | 'bill'
  | 'custom';

export type RiskLevel = 'high' | 'medium' | 'low';
export type ObligationStatus = 'active' | 'due_soon' | 'overdue' | 'completed' | 'snoozed';

export interface Obligation {
  _id: string;
  userId: string;
  type: ObligationType;
  title: string;
  description?: string;
  expiryDate?: string;
  dueDate?: string;
  reminderDays: number[];
  status: ObligationStatus;
  riskLevel: RiskLevel;
  executionPath?: string;
  partnerName?: string;
  amount?: number;
  currency: string;
  source: 'manual' | 'email_parsed' | 'document_scan' | 'system';
  daysUntil?: number;
  resolvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── UIObligation (lightweight — used by UI, mock data, and brain dump) ────────
// This is what the store holds, ObligationsScreen renders, and BrainDump creates.
// When the backend is ready, map Obligation → UIObligation on API response.
export interface UIObligation {
  _id: string;
  emoji: string;
  title: string;
  type: string;                       // relaxed — brain dump can return any type string
  daysUntil: number;
  risk: 'high' | 'medium' | 'low';
  amount: number | null;
  status: 'active' | 'completed';
  executionPath: string;
  notes: string | null;
  // Email reply fields — populated when type === 'reply_needed'
  replyTo?: string | null;
  replySubject?: string | null;
  // Meeting link — populated when email contains a Zoom/Meet/Teams URL
  meetingLink?: string | null;
}

// Helper — converts backend Obligation to UIObligation when API is ready
export function toUIObligation(o: Obligation): UIObligation {
  return {
    _id:           o._id,
    emoji:         emojiForType(o.type),
    title:         o.title,
    type:          o.type,
    daysUntil:     o.daysUntil ?? 0,
    risk:          o.riskLevel,
    amount:        o.amount ?? null,
    status:        o.status === 'completed' ? 'completed' : 'active',
    executionPath: o.executionPath ?? '',
    notes:         o.notes ?? null,
  };
}

function emojiForType(type: ObligationType): string {
  const map: Record<ObligationType, string> = {
    visa: '🛂', emirates_id: '🪪', car_registration: '🚗',
    insurance: '🛡️', school_fee: '🎓', mortgage_emi: '🏠',
    subscription: '📱', medical: '🏥', document: '📄',
    bill: '💡', custom: '📦',
  };
  return map[type] ?? '📦';
}

// ─── Food ─────────────────────────────────────────────────────────────────────
export interface FoodOption {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  deliveryTime: string;
  priceRange: string;
  tags: string[];
  image: string;
  partner: string;
  deepLink: string;
  certaintyScore: number;
}

export interface FoodOrder {
  restaurantId: string;
  status: string;
  estimatedDelivery: string;
  confirmationCode: string;
  customisation?: string;
}

// ─── Buddy / Chat ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ─── Brief ────────────────────────────────────────────────────────────────────
export interface MorningBrief {
  greeting: string;
  headline: string;
  lifeOptimizationScore: number;
  topPriorities: BriefPriority[];
  /** Evening only — items completed during the day */
  completedItems?: BriefCompletedItem[];
  /** Evening only — one-sentence preview of tomorrow */
  tomorrowPreview?: string;
  stats: {
    obligationsTracked: number;
    timeSavedThisWeek: string;
    decisionsHandled: number;
  };
  tip: string;
}

export interface BriefPriority {
  id: string;
  title: string;
  type: ObligationType;
  riskLevel: RiskLevel;
  emoji: string;
  daysUntil: number | null;
  executionPath?: string;
  action: string;
}

export interface BriefCompletedItem {
  id: string;
  title: string;
  emoji: string;
  /** Optional short note e.g. "Saved AED 450" or "Filed on time" */
  completedNote?: string;
}

// ─── Insights ─────────────────────────────────────────────────────────────────
export interface InsightsData {
  lifeOptimizationScore: number;
  timeSaved: { totalMinutes: number; displayWeekly: string; displayLifetime: string };
  decisions: { total: number; display: string };
  moneySaved: { totalAED: number; display: string };
  obligations: {
    total: number; active: number; completed: number;
    overdue: number; highRisk: number; missRate: string;
  };
  reliability: { percentage: number; display: string };
  autonomyTier: number;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  brainDump: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Obligations: undefined;
  Buddy: undefined;
  Insights: undefined;
  MorningBrief: undefined;
};

export type OnboardingStackParamList = {
  Welcome: undefined;
  Preferences: undefined;
  ObligationScan: undefined;
  Ready: undefined;
};

// ─── API Response ─────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}