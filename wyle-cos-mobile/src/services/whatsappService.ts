// src/services/whatsappService.ts
// Fetches WhatsApp obligations from the Wyle COS backend and converts them
// to UIObligation format so they appear alongside Gmail obligations.

import { UIObligation } from '../types';

const BACKEND_URL = process.env.EXPO_PUBLIC_WHATSAPP_BACKEND_URL ?? 'https://wyle-cos-backend.onrender.com';
const API_SECRET  = process.env.EXPO_PUBLIC_WHATSAPP_API_SECRET  ?? '';

// ── Types mirroring the backend ───────────────────────────────────────────────
interface WAObligation {
  id:              string;
  source:          'whatsapp';
  type:            'appointment' | 'reply_needed' | 'payment' | 'sign_document' | 'task' | 'vendor_followup' | 'other';
  title:           string;
  risk:            'high' | 'medium' | 'low';
  daysUntil:       number;
  status:          'pending' | 'dismissed' | 'sent';
  createdAt:       string;
  senderJid:       string;
  senderName:      string;
  senderPhone:     string;
  originalMessage: string;
  chatId:          string;
  suggestedReply?: string;
  meetingTime?:    string;
  meetingLocation?: string;
}

interface SessionStatus {
  connected:    boolean;
  phone?:       string;
  name?:        string;
  qrAvailable:  boolean;
}

// ── Auth header ───────────────────────────────────────────────────────────────
function headers(): HeadersInit {
  return { 'x-api-secret': API_SECRET, 'Content-Type': 'application/json' };
}

// ── Get WhatsApp connection status ────────────────────────────────────────────
export async function getWhatsAppStatus(): Promise<SessionStatus | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/whatsapp/status`, { headers: headers() });
    if (!res.ok) return null;
    return await res.json() as SessionStatus;
  } catch {
    return null;
  }
}

// ── Get QR code data URL (base64 image) ───────────────────────────────────────
export async function getWhatsAppQR(): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/whatsapp/qr`, { headers: headers() });
    if (!res.ok) return null;
    const data = await res.json() as { qr?: string; connected?: boolean };
    return data.qr ?? null;
  } catch {
    return null;
  }
}

// ── Map backend risk → UIObligation urgency string ────────────────────────────
function mapRisk(risk: WAObligation['risk']): string {
  switch (risk) {
    case 'high':   return 'Due Today';
    case 'medium': return 'Due This Week';
    case 'low':    return 'Upcoming';
  }
}

// ── Map WhatsApp obligation type → emoji icon ─────────────────────────────────
function mapIcon(type: WAObligation['type']): string {
  switch (type) {
    case 'appointment':     return '📅';
    case 'reply_needed':    return '💬';
    case 'payment':         return '💳';
    case 'sign_document':   return '✍️';
    case 'task':            return '✅';
    case 'vendor_followup': return '🏢';
    default:                return '📱';
  }
}

// ── Convert backend WAObligation → UIObligation ───────────────────────────────
function toUIobligation(wa: WAObligation): UIObligation {
  const senderLabel = wa.senderName || wa.senderPhone || 'WhatsApp';

  // Recalculate daysUntil from TODAY:
  // Use meetingTime if the backend extracted it, otherwise estimate via createdAt + original daysUntil
  const actualDueMs = wa.meetingTime
    ? new Date(wa.meetingTime).getTime()
    : new Date(wa.createdAt).getTime() + wa.daysUntil * 24 * 60 * 60 * 1000;

  const actualDaysUntil = Math.round((actualDueMs - Date.now()) / (24 * 60 * 60 * 1000));

  // If the due date has already passed, mark as completed so it's filtered out
  const isExpired = actualDaysUntil < 0;

  // Recalculate risk based on actual days remaining
  const actualRisk: 'high' | 'medium' | 'low' =
    actualDaysUntil <= 1 ? 'high' : actualDaysUntil <= 7 ? 'medium' : 'low';

  return {
    _id:           wa.id,
    emoji:         mapIcon(wa.type),
    title:         wa.title,
    type:          wa.type,
    daysUntil:     actualDaysUntil,
    risk:          isExpired ? wa.risk : actualRisk,
    amount:        null,
    status:        isExpired || wa.status !== 'pending' ? 'completed' : 'active',
    executionPath: wa.suggestedReply ?? '',
    notes:         wa.originalMessage ? `${senderLabel}: ${wa.originalMessage}` : null,
    source:        'whatsapp',
    replyTo:       wa.senderPhone ?? null,
    meetingLink:   wa.meetingTime
      ? `Meeting at ${new Date(wa.meetingTime).toLocaleString()}`
      : null,
  };
}

// ── Fetch pending WhatsApp obligations as UI obligations ──────────────────────
export async function fetchWhatsAppObligations(): Promise<UIObligation[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/whatsapp/obligations`, { headers: headers() });
    if (!res.ok) {
      console.warn('[WA Service] Failed to fetch obligations:', res.status);
      return [];
    }
    const data = await res.json() as { obligations: WAObligation[]; count: number };
    return (data.obligations ?? []).map(toUIobligation);
  } catch (err) {
    console.warn('[WA Service] Error fetching obligations:', err);
    return [];
  }
}

// ── Dismiss an obligation ─────────────────────────────────────────────────────
export async function dismissWhatsAppObligation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/whatsapp/obligations/${id}/dismiss`, {
      method:  'POST',
      headers: headers(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
