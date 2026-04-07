// src/screens/Obligations/ObligationsScreen.tsx
// Automations screen — dark palette, no back button, 5-tab footer
// All functionality retained: filter · cards · detail modal · add modal · brain dump voice

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Animated, Modal, TextInput, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator, Dimensions, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { VoiceService } from '../../services/voiceService';
import { UIObligation } from '../../types';
import { checkTimeConflicts, fetchEventsForDateRange, CalendarEvent, fmtTime, fmtDate, detectDayOverload, OVERLOAD_THRESHOLD, cancelCalendarEvent, sendGmailEmail } from '../../services/calendarService';
import { getAccessToken, getAccessTokenForEmail, getAllGoogleAccounts } from '../../services/googleAuthService';
import { sendOutlookEmail } from '../../services/outlookCalendarService';
import { getAllOutlookAccounts } from '../../services/outlookAuthService';
import { callAI } from '../../services/aiService';

const { width } = Dimensions.get('window');

// ── Colours (matches HomeScreen palette) ─────────────────────────────────────
const C = {
  bg:         '#0D0D0D',
  surface:    '#161616',
  surfaceEl:  '#1E1E1E',
  surfaceHi:  '#252525',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  chartreuseB:'#A8CC00',
  salmon:     '#FF6B6B',
  crimson:    '#FF3B30',
  orange:     '#FF9500',
  white:      '#FFFFFF',
  textSec:    '#9A9A9A',
  textTer:    '#555555',
  border:     '#2A2A2A',
};

type Risk = 'high' | 'medium' | 'low';
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'done' | 'error';

const RISK_COLORS: Record<Risk, string> = {
  high: C.crimson, medium: C.orange, low: C.verdigris,
};

const TYPE_OPTIONS = [
  { emoji: '🛂', label: 'Visa' },       { emoji: '🪪', label: 'Emirates ID' },
  { emoji: '🚗', label: 'Car Reg' },    { emoji: '🛡️', label: 'Insurance' },
  { emoji: '💡', label: 'Bill' },       { emoji: '🎓', label: 'School Fee' },
  { emoji: '🏥', label: 'Medical' },    { emoji: '📄', label: 'Document' },
  { emoji: '💰', label: 'Payment' },    { emoji: '📦', label: 'Other' },
];


function buildBrainDumpSystem(): string {
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now    = new Date();
  const yyyy   = now.getFullYear();
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const dd     = String(now.getDate()).padStart(2, '0');
  const todayISO   = `${yyyy}-${mm}-${dd}`;
  const todayHuman = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${yyyy}`;
  const lastDay    = new Date(yyyy, now.getMonth() + 1, 0).getDate();
  const daysLeft   = lastDay - now.getDate();

  const upcoming = Array.from({ length: 14 }, (_, i) => {
    const d   = new Date(now); d.setDate(now.getDate() + i);
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const lbl = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : DAYS[d.getDay()];
    return `  ${lbl} = ${y}-${m}-${day} (${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()})`;
  }).join('\n');

  return `You are Buddy inside Wyle — a life management app for busy professionals in Dubai, UAE.

=== DATE CONTEXT ===
TODAY: ${todayHuman}
TODAY ISO: ${todayISO}
UPCOMING DATES (use to resolve "Saturday", "next Monday", etc.):
${upcoming}
Days left in month: ${daysLeft}
=== END DATE CONTEXT ===

=== DUAL INTENT DETECTION ===
Detect whether the user is CREATING tasks OR QUERYING their calendar.

INTENT "tasks" — user is adding obligations/tasks/reminders:
Return: {"intent":"tasks","items":[...]}
Each item: _id, emoji, title, type (visa/emirates_id/car_registration/insurance/bill/school_fee/medical/appointment/payment/task/other), daysUntil (from ${todayISO}), risk (high<7d/medium7-30d/low>30d), amount (AED or null), status:"active", executionPath, notes, scheduledDateTime (ISO if specific time mentioned, else null), scheduledDuration (mins, default 60, null if no time)
If nothing actionable: {"intent":"tasks","items":[]}

INTENT "calendar_query" — user is ASKING about their schedule:
Triggered by: "what meetings", "my schedule", "do I have anything on", "list my meetings", "show me meetings", "tell me my meetings"
Return: {"intent":"calendar_query","start":"<ISO datetime>","end":"<ISO datetime>","label":"<human period>"}
- start = beginning of queried day/period (T00:00:00)
- end   = end of queried period (T23:59:59)
- label = e.g. "Saturday, Mar 21", "next week", "tomorrow"

Return ONLY valid JSON. No markdown, no explanation.`;
}

function getDaysLabel(days: number): string {
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule-based Voice Brain Dump Parser — no Claude API needed
// Produces the same output format as the Claude path so the rest of the
// BrainDumpModal flow (conflict checks, review, save) works unchanged.
// ─────────────────────────────────────────────────────────────────────────────
type BrainDumpResult =
  | { intent: 'tasks'; items: any[] }
  | { intent: 'calendar_query'; start: string; end: string; label: string };

const VOICE_MONTHS: Record<string, number> = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11,
};

function resolveVoiceDate(text: string): { date: Date; label: string } | null {
  const t = text.toLowerCase();
  const now = new Date();

  if (/\btoday\b/.test(t))    return { date: new Date(now), label: 'Today' };
  if (/\btomorrow\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate()+1); return { date: d, label: 'Tomorrow' }; }
  if (/\bthis weekend\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() + (6 - d.getDay()));
    return { date: d, label: 'This weekend' };
  }
  if (/\bnext week\b/.test(t)) { const d = new Date(now); d.setDate(d.getDate()+7); return { date: d, label: 'Next week' }; }

  // Named day — "Saturday", "next Monday", etc.
  const DAYS_LIST = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for (let i = 0; i < DAYS_LIST.length; i++) {
    if (t.includes(DAYS_LIST[i])) {
      const d = new Date(now);
      let diff = i - d.getDay();
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return { date: d, label: DAYS_LIST[i].charAt(0).toUpperCase() + DAYS_LIST[i].slice(1) };
    }
  }

  // "in X days"
  const inDays = t.match(/in (\d+) days?/);
  if (inDays) { const d = new Date(now); d.setDate(d.getDate()+parseInt(inDays[1])); return { date: d, label: `In ${inDays[1]} days` }; }

  // Month-name dates: "April 5", "5th April 2026"
  for (const [name, mo] of Object.entries(VOICE_MONTHS)) {
    const r1 = new RegExp(`\\b${name}\\s+(\\d{1,2})`, 'i');
    const r2 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${name}`, 'i');
    const m1 = text.match(r1); const m2 = text.match(r2);
    const day = m1 ? parseInt(m1[1]) : m2 ? parseInt(m2[1]) : 0;
    if (day) {
      const yr  = now.getFullYear();
      const d   = new Date(yr, mo, day);
      if (d < now) d.setFullYear(yr + 1);
      return { date: d, label: `${name.charAt(0).toUpperCase()+name.slice(1)} ${day}` };
    }
  }
  return null;
}

function resolveVoiceTime(text: string): { hours: number; minutes: number } | null {
  // Normalise "p.m." → "pm", "a.m." → "am" (spoken/typed with dots)
  const t = text.toLowerCase()
    .replace(/p\s*\.\s*m\s*\.?/g, 'pm')
    .replace(/a\s*\.\s*m\s*\.?/g, 'am');

  if (/\bnoon\b/.test(t))        return { hours: 12, minutes: 0 };
  if (/\bmidnight\b/.test(t))    return { hours: 0,  minutes: 0 };
  if (/\bmorning\b/.test(t))     return { hours: 9,  minutes: 0 };
  if (/\bafternoon\b/.test(t))   return { hours: 14, minutes: 0 };
  if (/\bevening\b/.test(t))     return { hours: 18, minutes: 0 };
  if (/\bnight\b/.test(t))       return { hours: 20, minutes: 0 };

  // "at 7pm", "at 7:30 pm", "7pm", "7:30pm"
  const m = t.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (m) {
    let h = parseInt(m[1]);
    const min = parseInt(m[2] ?? '0');
    if (m[3] === 'pm' && h !== 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return { hours: h, minutes: min };
  }
  // "at 7" without am/pm — assume PM for 1–6
  const bare = t.match(/\bat (\d{1,2})(?::(\d{2}))?\b/);
  if (bare) {
    let h = parseInt(bare[1]);
    const min = parseInt(bare[2] ?? '0');
    if (h >= 1 && h <= 6) h += 12;
    return { hours: h, minutes: min };
  }
  return null;
}

function buildScheduledISO(dateRes: { date: Date } | null, timeRes: { hours: number; minutes: number } | null): string | null {
  if (!dateRes && !timeRes) return null;
  const base = dateRes ? new Date(dateRes.date) : new Date();
  if (timeRes) base.setHours(timeRes.hours, timeRes.minutes, 0, 0);
  else base.setHours(9, 0, 0, 0); // default 9 AM if only date given
  return base.toISOString();
}

function detectVoiceObligationType(text: string): { type: string; emoji: string } {
  const t = text.toLowerCase();
  if (/\bvisa\b|residence permit|gdrfa/.test(t))                                   return { type: 'visa',             emoji: '🛂' };
  if (/emirates id|identity card/.test(t))                                         return { type: 'emirates_id',      emoji: '🪪' };
  if (/car.*registr|vehicle.*registr|mulkiya|\brta\b/.test(t))                     return { type: 'car_registration', emoji: '🚗' };
  if (/\binsurance\b|policy renewal/.test(t))                                      return { type: 'insurance',        emoji: '🛡️' };
  if (/school fee|tuition|university fee/.test(t))                                 return { type: 'school_fee',       emoji: '🎓' };
  if (/\bdewa\b|\bsewa\b|electricity.*bill|water.*bill|utility.*bill/.test(t))     return { type: 'bill',             emoji: '💡' };
  if (/invoice|\bpay\b(?!ment)|\bpaid\b|amount.*owed|aed\s*\d/.test(t))           return { type: 'payment',          emoji: '💰' };
  if (/doctor|dentist|hospital|clinic|medical|health check|checkup/.test(t))       return { type: 'medical',          emoji: '🏥' };
  if (/subscription|renew|renewal/.test(t))                                        return { type: 'subscription',     emoji: '🔄' };
  if (/meeting|call|interview|presentation|conference|standup/.test(t))            return { type: 'appointment',      emoji: '📅' };
  if (/party|birthday|dinner|lunch|breakfast|brunch|wedding|attend|event|visit/.test(t)) return { type: 'appointment', emoji: '🎉' };
  if (/appointment|book|schedule/.test(t))                                         return { type: 'appointment',      emoji: '📅' };
  return { type: 'task', emoji: '📌' };
}

function extractVoiceAmount(text: string): number | null {
  const m = text.match(/(?:aed|AED)\s*([\d,]+(?:\.\d{1,2})?)/i)
         ?? text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:aed|dirhams?)/i)
         ?? text.match(/\bpay\s+([\d,]+(?:\.\d{1,2})?)\b/i);
  if (m) { const n = parseFloat(m[1].replace(/,/g, '')); if (n > 0 && n < 10_000_000) return n; }
  return null;
}

function cleanVoiceTitle(segment: string): string {
  return segment
    // Strip conversational openers — "hey buddy", "ok so", "hey", etc.
    .replace(/^(hey\s+buddy|hey\s+wyle|hey\s+there|ok\s+so|okay\s+so|so\s+basically|alright|ok|okay|hi|hello)\s*/i, '')
    // Strip task-creation filler anywhere in the sentence
    .replace(/\b(i need to|i have to|i should|remind me to|don'?t forget to|remember to|make sure to|please|can you|could you)\s+/i, '')
    // Remove time expressions (handle "p.m." dots too)
    .replace(/\bat \d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?\b/gi, '')
    .replace(/\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/gi, '')
    // Remove relative date words
    .replace(/\b(today|tomorrow|this weekend|next week|next month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bin \d+ days?\b/i, '')
    .replace(/\bfor \d+ (minutes?|hours?|mins?|hrs?)\b/i, '')
    // Clean leftover punctuation and whitespace
    .replace(/[,;]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isCalendarQueryText(text: string): boolean {
  return /\b(what|do i have|show me|list|tell me|any)\b.*(meeting|event|appointment|schedule|calendar|plan)/i.test(text)
    || /\bmy (schedule|calendar|meetings|events|appointments)\b/i.test(text);
}

function splitVoiceSegments(text: string): string[] {
  // Split on "and also", "also,", " and ", comma-and patterns
  const parts = text.split(/,?\s+and also\s+|,?\s+also\s+|;\s*|\s*,\s+(?=[a-z])/i)
    .map(s => s.trim()).filter(s => s.split(' ').length >= 2);
  return parts.length > 0 ? parts : [text];
}

/** Pure rule-based fallback — same output shape as Claude response */
function parseVoiceWithRules(text: string): BrainDumpResult {
  // ── Calendar query ───────────────────────────────────────────────────────
  if (isCalendarQueryText(text)) {
    const dateRes = resolveVoiceDate(text);
    const base    = dateRes ? dateRes.date : new Date();
    const start   = new Date(base); start.setHours(0, 0, 0, 0);
    const end     = new Date(base); end.setHours(23, 59, 59, 999);
    return { intent: 'calendar_query', start: start.toISOString(), end: end.toISOString(), label: dateRes?.label ?? 'Today' };
  }

  // ── Task creation ────────────────────────────────────────────────────────
  const segments = splitVoiceSegments(text);
  const items: any[] = segments.map((seg, i) => {
    const { type, emoji }   = detectVoiceObligationType(seg);
    const dateRes           = resolveVoiceDate(seg);
    const timeRes           = resolveVoiceTime(seg);
    const amount            = extractVoiceAmount(seg);
    const scheduledDateTime = buildScheduledISO(dateRes, timeRes);

    let daysUntil = 0;
    if (dateRes) daysUntil = Math.max(0, Math.round((dateRes.date.getTime() - Date.now()) / 86_400_000));

    const risk: 'high' | 'medium' | 'low' = daysUntil <= 1 ? 'high' : daysUntil <= 7 ? 'medium' : 'low';
    const rawTitle  = cleanVoiceTitle(seg);
    const title     = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1) || `${type.replace(/_/g,' ')} task`;

    let executionPath = '';
    if (scheduledDateTime) {
      const dt = new Date(scheduledDateTime);
      const fmt = dt.toLocaleString('en-AE', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      executionPath = `Scheduled for ${fmt}`;
    } else if (type === 'payment') {
      executionPath = `Process payment${amount ? ` of AED ${amount.toLocaleString()}` : ''}`;
    } else {
      executionPath = `Handle: ${title}`;
    }

    return {
      _id:              `dump_${i}_${Date.now()}`,
      emoji, title, type,
      daysUntil, risk,
      amount:           amount ?? null,
      status:           'active',
      executionPath,
      notes:            'via voice brain dump',
      scheduledDateTime,
      scheduledDuration: scheduledDateTime ? 60 : null,
    };
  }).filter(item => item.title.length > 1);

  return { intent: 'tasks', items };
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated Hologram Orb — exact copy from HomeScreen
// ─────────────────────────────────────────────────────────────────────────────
const ORB_SIZE = 58;

// Styles used by HologramOrb and TabBar — must be defined BEFORE those components
// so Hermes (which does not hoist const initialisations) can resolve them at render time.
const s = StyleSheet.create({
  // Tab bar
  tabBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111111',
    borderTopWidth: 1, borderColor: C.border,
    paddingBottom: 20, paddingTop: 8, height: 80,
  },
  tabItem:  { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon:  { fontSize: 20, color: C.textTer },
  tabLabel: { fontSize: 10, color: C.textTer, fontWeight: '500' },
  tabDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: C.verdigris, marginTop: 2 },
  // Hologram orb
  orbWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -24 },
  orb: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orbWave:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  orbWaveBar: { width: 2.5, backgroundColor: '#FFFFFF', borderRadius: 2, opacity: 0.9 },
});

function HologramOrb({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tilt  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.14, duration: 1800, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 1800, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(tilt, { toValue: 1,  duration: 2200, useNativeDriver: true }),
      Animated.timing(tilt, { toValue: -1, duration: 2200, useNativeDriver: true }),
    ])).start();
  }, []);

  const rotate = tilt.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] });

  return (
    <TouchableOpacity onPress={onPress} style={s.orbWrap} activeOpacity={0.9}>
      <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
        <LinearGradient
          colors={['#00C8FF', '#1B998B', '#A8FF3E', '#FF6B35']}
          start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 0.9 }}
          style={s.orb}
        >
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.3)']}
            start={{ x: 0.3, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.orbWave}>
            {[1, 1, 3, 6, 3, 1, 1].map((h, i) => (
              <View key={i} style={[s.orbWaveBar, { height: h * 3 }]} />
            ))}
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-item Tab Bar — consistent with all screens
// ─────────────────────────────────────────────────────────────────────────────
const TAB_ITEMS = [
  { key: 'home',        icon: '⊙',  label: 'Home'        },
  { key: 'obligations', icon: '✦',  label: 'Automations' },
  { key: 'buddy',       icon: 'orb', label: ''            },
  { key: 'insights',    icon: '▦',  label: 'Insights'    },
  { key: 'connect',     icon: '◈',  label: 'Profile'     },
];

function TabBar({ active, onTab }: { active: string; onTab: (s: any) => void }) {
  return (
    <View style={s.tabBar}>
      {TAB_ITEMS.map((t) => {
        if (t.icon === 'orb') {
          return <HologramOrb key={t.key} onPress={() => onTab(t.key)} />;
        }
        const isActive = active === t.key;
        return (
          <TouchableOpacity key={t.key} style={s.tabItem} onPress={() => onTab(t.key)}>
            <Text style={[s.tabIcon, isActive && { color: C.verdigris }]}>{t.icon}</Text>
            <Text style={[s.tabLabel, isActive && { color: C.verdigris }]}>{t.label}</Text>
            {isActive && <View style={s.tabDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Obligation Card
// ─────────────────────────────────────────────────────────────────────────────
function ObligationCard({ item, onPress, onResolve, onReply }: any) {
  const riskColor   = RISK_COLORS[(item.risk ?? 'medium') as Risk] ?? RISK_COLORS['medium'];
  const isReplyType = item.type === 'reply_needed';
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start(() => onPress(item));
  };
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: riskColor }]}
        onPress={handlePress}
        activeOpacity={1}
      >
        <View style={[styles.cardIcon, { backgroundColor: `${riskColor}15` }]}>
          <Text style={styles.cardEmoji}>{item.emoji}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.notes && <Text style={styles.cardNotes} numberOfLines={1}>{item.notes}</Text>}
          <View style={styles.cardMeta}>
            <View style={[styles.riskPill, { backgroundColor: `${riskColor}18`, borderColor: `${riskColor}38` }]}>
              <Text style={[styles.riskPillText, { color: riskColor }]}>{(item.risk ?? 'medium').toUpperCase()}</Text>
            </View>
            <Text style={[styles.daysText, { color: riskColor }]}>{getDaysLabel(item.daysUntil)}</Text>
            {item.amount && <Text style={styles.amount}>AED {item.amount.toLocaleString()}</Text>}
          </View>
        </View>
        {/* Reply button for reply_needed obligations */}
        {isReplyType && !!onReply && (
          <TouchableOpacity
            style={[styles.resolveBtn, { backgroundColor: `${C.verdigris}18`, marginRight: 6 }]}
            onPress={() => onReply(item)}
          >
            <Text style={{ fontSize: 14 }}>✉️</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.resolveBtn} onPress={() => onResolve(item)}>
          <Text style={styles.resolveBtnText}>✓</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function DetailModal({ item, visible, onClose, onResolve, onReply }: any) {
  if (!item) return null;
  const riskColor   = RISK_COLORS[item.risk as Risk];
  const isReplyType = item.type === 'reply_needed';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.overlay}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={modal.header}>
              <View style={[modal.icon, { backgroundColor: `${riskColor}18` }]}>
                <Text style={{ fontSize: 32 }}>{item.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modal.title}>{item.title}</Text>
                <View style={[modal.riskBadge, { backgroundColor: `${riskColor}18` }]}>
                  <Text style={[modal.riskText, { color: riskColor }]}>
                    {item.risk === 'high' ? '🔴' : item.risk === 'medium' ? '🟡' : '🟢'} {item.risk.toUpperCase()} RISK
                  </Text>
                </View>
              </View>
            </View>

            {/* Info grid */}
            <View style={modal.infoGrid}>
              <View style={modal.infoItem}>
                <Text style={modal.infoLabel}>Due in</Text>
                <Text style={[modal.infoValue, { color: riskColor }]}>{getDaysLabel(item.daysUntil)}</Text>
              </View>
              {item.amount && (
                <View style={modal.infoItem}>
                  <Text style={modal.infoLabel}>Amount</Text>
                  <Text style={modal.infoValue}>AED {item.amount.toLocaleString()}</Text>
                </View>
              )}
              {isReplyType && item.replyTo && (
                <View style={modal.infoItem}>
                  <Text style={modal.infoLabel}>Reply to</Text>
                  <Text style={[modal.infoValue, { fontSize: 11 }]} numberOfLines={1}>{item.replyTo}</Text>
                </View>
              )}
            </View>

            {/* Key message — AI-extracted plain-English summary */}
            {!!item.keyMessage && (
              <View style={modal.sectionBlock}>
                <Text style={modal.sectionLabel}>💡 KEY MESSAGE</Text>
                <Text style={modal.sectionText}>{item.keyMessage}</Text>
              </View>
            )}

            {/* How to resolve */}
            {!!item.executionPath && (
              <View style={modal.executionBlock}>
                <Text style={modal.executionLabel}>HOW TO RESOLVE</Text>
                <Text style={modal.executionText}>{item.executionPath}</Text>
              </View>
            )}

            {/* Meeting link — join button */}
            {!!item.meetingLink && (
              <TouchableOpacity
                style={modal.meetingBtn}
                onPress={() => Linking.openURL(item.meetingLink!).catch(() => {})}
              >
                <Text style={modal.meetingBtnText}>📹  Join Meeting</Text>
              </TouchableOpacity>
            )}

            {/* Attachments list */}
            {Array.isArray(item.attachments) && item.attachments.length > 0 && (
              <View style={modal.sectionBlock}>
                <Text style={modal.sectionLabel}>📎 ATTACHMENTS</Text>
                {item.attachments.map((att: any, idx: number) => (
                  <View key={idx} style={modal.attachmentRow}>
                    <Text style={modal.attachmentName} numberOfLines={1}>{att.name}</Text>
                    <Text style={modal.attachmentSize}>
                      {att.size > 1024 * 1024
                        ? `${(att.size / 1024 / 1024).toFixed(1)} MB`
                        : `${Math.round(att.size / 1024)} KB`}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Email body */}
            {!!item.emailBody && (
              <View style={modal.sectionBlock}>
                <Text style={modal.sectionLabel}>📧 EMAIL BODY</Text>
                <Text style={modal.bodyText}>{item.emailBody}</Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={modal.actions}>
              {/* Reply button — only for reply_needed type */}
              {isReplyType && !!onReply && (
                <TouchableOpacity
                  style={[modal.primaryBtn, { marginBottom: 10 }]}
                  onPress={() => { onClose(); onReply(item); }}
                >
                  <LinearGradient
                    colors={['#0078D4', C.verdigris]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={modal.primaryBtnGrad}
                  >
                    <Text style={modal.primaryBtnText}>✉️  Compose Reply</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={modal.primaryBtn}
                onPress={() => { onResolve(item); onClose(); }}
              >
                <LinearGradient
                  colors={[C.verdigris, C.chartreuseB]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={modal.primaryBtnGrad}
                >
                  <Text style={modal.primaryBtnText}>Mark as resolved</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={modal.secondaryBtn} onPress={onClose}>
                <Text style={modal.secondaryBtnText}>Remind me later</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Obligation Modal
// ─────────────────────────────────────────────────────────────────────────────
function AddModal({ visible, onClose, onAdd }: any) {
  const [title, setTitle]     = useState('');
  const [days, setDays]       = useState('');
  const [amount, setAmount]   = useState('');
  const [notes, setNotes]     = useState('');
  const [risk, setRisk]       = useState<Risk>('medium');
  const [selType, setSelType] = useState(TYPE_OPTIONS[0]);
  const reset = () => {
    setTitle(''); setDays(''); setAmount(''); setNotes('');
    setRisk('medium'); setSelType(TYPE_OPTIONS[0]);
  };
  const handleAdd = () => {
    if (!title.trim()) return;
    onAdd({
      _id: Date.now().toString(), emoji: selType.emoji,
      title: title.trim(), type: selType.label.toLowerCase().replace(' ', '_'),
      daysUntil: parseInt(days) || 30, risk,
      amount: amount ? parseInt(amount) : null,
      status: 'active', executionPath: '', notes: notes.trim() || null,
    });
    reset(); onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={add.overlay}>
          <TouchableOpacity style={add.backdrop} onPress={onClose} />
          <View style={add.sheet}>
            <View style={add.handle} />
            <View style={add.titleRow}>
              <Text style={add.sheetTitle}>Add obligation</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={add.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={add.label}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {TYPE_OPTIONS.map(t => (
                    <TouchableOpacity
                      key={t.label}
                      style={[add.typePill, selType.label === t.label && add.typePillActive]}
                      onPress={() => setSelType(t)}
                    >
                      <Text style={{ fontSize: 16 }}>{t.emoji}</Text>
                      <Text style={[add.typePillText, selType.label === t.label && { color: C.bg }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={add.label}>Title</Text>
              <TextInput
                style={add.input} value={title} onChangeText={setTitle}
                placeholder="e.g. Emirates ID Renewal" placeholderTextColor={C.textTer}
              />
              <Text style={add.label}>Due in (days)</Text>
              <TextInput
                style={add.input} value={days} onChangeText={setDays}
                placeholder="e.g. 30" placeholderTextColor={C.textTer} keyboardType="number-pad"
              />
              <Text style={add.label}>Amount (AED) — optional</Text>
              <TextInput
                style={add.input} value={amount} onChangeText={setAmount}
                placeholder="e.g. 370" placeholderTextColor={C.textTer} keyboardType="number-pad"
              />
              <Text style={add.label}>Risk level</Text>
              <View style={add.riskRow}>
                {(['low', 'medium', 'high'] as Risk[]).map(r => {
                  const rc = RISK_COLORS[r]; const isActive = risk === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[add.riskBtn, isActive && { backgroundColor: rc, borderColor: rc }]}
                      onPress={() => setRisk(r)}
                    >
                      <Text style={[add.riskBtnText, isActive && { color: r === 'medium' ? C.bg : C.white }]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={add.label}>Notes — optional</Text>
              <TextInput
                style={[add.input, { height: 80, textAlignVertical: 'top' }]}
                value={notes} onChangeText={setNotes}
                placeholder="Any extra details..." placeholderTextColor={C.textTer} multiline
              />
              <TouchableOpacity
                style={[add.addBtn, !title.trim() && { opacity: 0.4 }]}
                onPress={handleAdd} disabled={!title.trim()}
              >
                <Text style={add.addBtnText}>Add obligation</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate Detection Helpers (logic unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}
function isSimilarTitle(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/).filter(w => w.length > 2);
  const wb = new Set(nb.split(/\s+/).filter(w => w.length > 2));
  const shared = wa.filter(w => wb.has(w));
  return wa.length > 0 && shared.length / Math.max(wa.length, wb.size) > 0.4;
}
function findDuplicateObligation(item: UIObligation, existing: UIObligation[]): UIObligation | null {
  return existing.find(e =>
    e.status === 'active' && e.type === item.type && isSimilarTitle(e.title, item.title)
  ) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Completion Intent Helpers (logic unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function hasCompletionIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return ['i paid', 'i have paid', 'i completed', 'i have completed', 'i finished',
    'already paid', 'already done', 'already completed', 'mark as completed',
    'mark as done', 'mark it as completed', 'can you remove', 'remove the task',
    'remove it from', 'mark it completed'].some(p => lower.includes(p));
}
function findObligationInText(text: string, obligations: UIObligation[]): UIObligation | null {
  const lowerText = normalizeTitle(text);
  return obligations.find(ob => {
    const titleWords = normalizeTitle(ob.title).split(/\s+/).filter(w => w.length > 3);
    if (titleWords.length === 0) return false;
    const matched = titleWords.filter(w => lowerText.includes(w));
    return matched.length / titleWords.length >= 0.5;
  }) ?? null;
}

// ───────────────────────────────────────────────────────────────────────────────
// ── Buddy Resolution Card (conflict + overload combined) ─────────────────────
function BuddyResolutionCard({
  item,
  conflictEvents,
  overload,
  onResolved,
  onOpenCancelNote,
}: {
  item: UIObligation;
  conflictEvents: CalendarEvent[];
  overload?: { count: number; events: CalendarEvent[] };
  onResolved: (eventId: string) => void;
  onOpenCancelNote: (ev: CalendarEvent, itemTitle: string, newItem: UIObligation) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const situationParts: string[] = [];
  if (conflictEvents.length > 0) {
    situationParts.push('"' + conflictEvents.map((e: CalendarEvent) => e.title).join('", "') + '" overlaps with "' + item.title + '"');
  }
  if (overload) {
    situationParts.push('this day already has ' + overload.count + ' meetings (overload threshold: ' + OVERLOAD_THRESHOLD + ')');
  }

  return (
    <View style={rc.card}>
      <View style={rc.header}>
        <Text style={rc.headerIcon}>⚡</Text>
        <View style={{ flex: 1 }}>
          <Text style={rc.headerTitle}>Buddy needs your input</Text>
          <Text style={rc.headerSub}>
            {situationParts.join(' · ')}
          </Text>
        </View>
      </View>

      <Text style={rc.question}>What should Buddy do?</Text>

      {conflictEvents.map((ev: CalendarEvent) => (
        <TouchableOpacity
          key={ev.id}
          style={rc.actionBtn}
          onPress={() => onOpenCancelNote(ev, item.title, item)}
        >
          <Text style={rc.actionBtnText}>
            Cancel "{ev.title}" ({fmtTime(ev.startTime)}–{fmtTime(ev.endTime)}) → Add {item.title}
          </Text>
        </TouchableOpacity>
      ))}

      {error && <Text style={rc.errorText}>⚠ {error}</Text>}

      {overload && conflictEvents.length === 0 && (
        <Text style={rc.overloadNote}>
          🔴 This day has {overload.count} meetings. Consider rescheduling "{item.title}" to a lighter day.
        </Text>
      )}

    </View>
  );
}
const rc = StyleSheet.create({
  card:        { backgroundColor: 'rgba(255,149,0,0.08)', borderRadius: 12, padding: 12, marginTop: 6, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,149,0,0.35)' },
  header:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 },
  headerIcon:  { fontSize: 18 },
  headerTitle: { color: C.orange, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  headerSub:   { color: C.textSec, fontSize: 11, lineHeight: 16 },
  question:    { color: C.white, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  actionBtn:   { backgroundColor: C.crimson, borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 6 },
  actionBtnText: { color: C.white, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  errorText:   { color: C.crimson, fontSize: 11, marginTop: 4 },
  overloadNote:{ color: C.textSec, fontSize: 11, lineHeight: 16, marginTop: 4 },
});

// keep ow defined (used nowhere now but avoids TS errors if referenced elsewhere)
const ow = StyleSheet.create({
  card:       { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,59,48,0.10)', borderRadius: 10, padding: 10, marginTop: 4, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,59,48,0.30)' },
  icon:       { fontSize: 16, marginTop: 1 },
  title:      { color: C.crimson, fontSize: 12, fontWeight: '700', marginBottom: 3 },
  detail:     { color: C.textSec, fontSize: 11, lineHeight: 16 },
  banner:     { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,59,48,0.10)', borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(255,59,48,0.30)' },
  bannerText: { color: C.crimson, fontSize: 12, fontWeight: '700', flex: 1 },
});

// Brain Dump Modal (all logic unchanged, dark theme applied)
// ─────────────────────────────────────────────────────────────────────────────
function BrainDumpModal({ visible, onClose, onSave, existingObligations, onResolve, onOpenCancelNote }: {
  visible: boolean;
  onClose: () => void;
  onSave: (items: UIObligation[]) => void;
  existingObligations: UIObligation[];
  onResolve: (id: string) => void;
  onOpenCancelNote: (ev: CalendarEvent, itemTitle: string, newItem: UIObligation) => void;
}) {
  const [voiceState, setVoiceState]         = useState<VoiceState>('idle');
  const [voiceMode, setVoiceMode]           = useState<'task_creation' | 'calendar_query'>('task_creation');
  const [transcript, setTranscript]         = useState('');
  const [parsed, setParsed]                 = useState<UIObligation[]>([]);
  const [showReview, setShowReview]         = useState(false);
  const [freshItems, setFreshItems]         = useState<UIObligation[]>([]);
  const [dupeItems, setDupeItems]           = useState<{ incoming: UIObligation; existing: UIObligation }[]>([]);
  const [completionTarget, setCompletionTarget] = useState<UIObligation | null>(null);
  const [conflictWarnings, setConflictWarnings] = useState<Map<string, CalendarEvent[]>>(new Map());
  const [overloadWarnings, setOverloadWarnings] = useState<Record<string, { count: number; events: CalendarEvent[] }>>({});
  const [calendarEvents, setCalendarEvents]     = useState<CalendarEvent[]>([]);
  const [calendarQueryLabel, setCalendarQueryLabel] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setVoiceState('idle'); setTranscript(''); setParsed([]);
      setShowReview(false); setFreshItems([]); setDupeItems([]); setCompletionTarget(null);
      setConflictWarnings(new Map()); setOverloadWarnings({}); setCalendarEvents([]); setCalendarQueryLabel('');
      setVoiceMode('task_creation');
    }
  }, [visible]);

  useEffect(() => {
    if (voiceState === 'recording') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [voiceState]);

  const checkCalendarConflicts = async (items: UIObligation[]) => {
    const withTime = items.filter(i => (i as any).scheduledDateTime);
    if (withTime.length === 0) return;
    const warnings = new Map<string, CalendarEvent[]>();
    for (const item of withTime) {
      const start = new Date((item as any).scheduledDateTime);
      if (isNaN(start.getTime())) continue;
      const durationMs = ((item as any).scheduledDuration ?? 60) * 60_000;
      const end = new Date(start.getTime() + durationMs);
      const conflicts = await checkTimeConflicts(start, end);
      if (conflicts.length > 0) warnings.set(item._id, conflicts);
    }
    setConflictWarnings(warnings);
    // Announce if conflicts found
    if (warnings.size > 0) {
      Speech.speak(
        `Heads up — ${warnings.size} of your tasks conflict with existing calendar events.`,
        { language: 'en-US', rate: 0.95 }
      );
    }
  };

  // ── Shared handler: takes a parsed BrainDumpResult and updates UI state ──
  const applyParsedResponse = async (response: BrainDumpResult) => {
    // ── Calendar query mode ─────────────────────────────────────────────────
    if (response.intent === 'calendar_query') {
      setVoiceMode('calendar_query');
      setCalendarQueryLabel(response.label ?? '');
      const start  = new Date(response.start);
      const end    = new Date(response.end);
      const result = await fetchEventsForDateRange(start, end);
      setCalendarEvents(result.events);
      setVoiceState('done');
      const n = result.events.length;
      Speech.speak(
        n > 0
          ? `You have ${n} ${n === 1 ? 'meeting' : 'meetings'} for ${response.label}.`
          : `No meetings found for ${response.label}.`,
        { language: 'en-US', rate: 0.95 },
      );
      return;
    }

    // ── Task creation mode ──────────────────────────────────────────────────
    setVoiceMode('task_creation');
    const items: UIObligation[] = response.items ?? [];
    const stamped = items.map((item: UIObligation, i: number) => ({ ...item, _id: `dump_${i}_${Date.now()}` }));
    setParsed(stamped);
    setVoiceState('done');

    // ── Run conflict + overload checks in parallel ────────────────────────
    const [, overloadMap] = await Promise.all([
      checkCalendarConflicts(stamped),
      (async () => {
        const map: Record<string, { count: number; events: CalendarEvent[] }> = {};
        await Promise.all(
          stamped.map(async (item: UIObligation) => {
            const dt = (item as any).scheduledDateTime;
            if (!dt) return;
            const date = new Date(dt);
            if (isNaN(date.getTime())) return;
            const result = await detectDayOverload(date);
            if (result.isOverloaded) map[item._id] = { count: result.count, events: result.events };
          })
        );
        return map;
      })(),
    ]);
    setOverloadWarnings(overloadMap);

    const overloadCount = Object.keys(overloadMap).length;
    if (stamped.length > 0) {
      const parts: string[] = [`Found ${stamped.length} ${stamped.length === 1 ? 'task' : 'tasks'}.`];
      if (overloadCount > 0) parts.push(`Warning — ${overloadCount} ${overloadCount === 1 ? 'task is' : 'tasks are'} scheduled on overloaded days with ${OVERLOAD_THRESHOLD} or more existing meetings.`);
      Speech.speak(parts.join(' '), { language: 'en-US', rate: 0.95 });
    }
  };

  const parseWithClaude = async (text: string) => {
    setVoiceState('parsing');
    setConflictWarnings(new Map());
    setOverloadWarnings({});

    try {
      const { text: raw } = await callAI({
        system:    buildBrainDumpSystem(),
        messages:  [{ role: 'user', content: text }],
        model:     'claude-sonnet-4-20250514',
        maxTokens: 1500,
      });

      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed_json = JSON.parse(clean);

      // Support legacy plain array + new {intent} format
      const response: BrainDumpResult = Array.isArray(parsed_json)
        ? { intent: 'tasks', items: parsed_json }
        : parsed_json;

      await applyParsedResponse(response);
    } catch {
      // Network error / JSON parse failure → rule-based fallback
      console.warn('[BrainDump] Claude call failed — using rule-based parser');
      try {
        await applyParsedResponse(parseVoiceWithRules(text));
      } catch {
        setVoiceState('error');
      }
    }
  };

  const handleMicPress = () => {
    if (voiceState === 'recording') {
      VoiceService.stop(
        (text) => {
          setTranscript(text);
          if (hasCompletionIntent(text)) {
            const match = findObligationInText(text, existingObligations);
            if (match) { setCompletionTarget(match); setVoiceState('done'); return; }
          }
          parseWithClaude(text);
        },
        (state) => { if (state === 'idle') setVoiceState('transcribing'); }
      );
    } else if (voiceState === 'idle') {
      setParsed([]); setTranscript(''); setCompletionTarget(null);
      VoiceService.start(
        (text) => {
          setTranscript(text);
          if (hasCompletionIntent(text)) {
            const match = findObligationInText(text, existingObligations);
            if (match) { setCompletionTarget(match); setVoiceState('done'); return; }
          }
          parseWithClaude(text);
        },
        (state) => { if (state === 'recording') setVoiceState('recording'); }
      );
      setVoiceState('recording');
    }
  };

  const handleSaveAll = () => {
    const fresh: UIObligation[] = [];
    const dupes: { incoming: UIObligation; existing: UIObligation }[] = [];
    for (const item of parsed) {
      const match = findDuplicateObligation(item, existingObligations);
      if (match) dupes.push({ incoming: item, existing: match });
      else fresh.push(item);
    }
    if (dupes.length > 0) {
      setFreshItems(fresh); setDupeItems(dupes); setShowReview(true); return;
    }
    onSave(parsed);
    Speech.speak(`${parsed.length} ${parsed.length === 1 ? 'task' : 'tasks'} added.`, { language: 'en-US', rate: 0.95 });
    onClose();
  };

  const handleSkipDupes = () => {
    if (freshItems.length > 0) {
      onSave(freshItems);
      Speech.speak(`${freshItems.length} new ${freshItems.length === 1 ? 'task' : 'tasks'} added.`, { language: 'en-US', rate: 0.95 });
    }
    onClose();
  };

  const handleAddAll = () => {
    const allItems = [...freshItems, ...dupeItems.map(d => d.incoming)];
    onSave(allItems);
    Speech.speak(`${allItems.length} ${allItems.length === 1 ? 'task' : 'tasks'} added.`, { language: 'en-US', rate: 0.95 });
    onClose();
  };

  const isProcessing     = voiceState === 'transcribing' || voiceState === 'parsing';
  const micBgColor       = voiceState === 'recording' ? `${C.salmon}28` : `${C.salmon}14`;
  const micBorderColor   = voiceState === 'recording' ? C.salmon       : `${C.salmon}40`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={bd.overlay}>
        <TouchableOpacity style={bd.backdrop} onPress={onClose} />
        <View style={bd.sheet}>
          <View style={bd.handle} />
          <View style={bd.header}>
            <View>
              <Text style={bd.title}>Voice Brain Dump</Text>
              <Text style={bd.sub}>Speak freely — Buddy structures your tasks</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={bd.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {transcript.length > 0 && (
            <View style={bd.transcriptBox}>
              <Text style={bd.transcriptLabel}>YOU SAID</Text>
              <Text style={bd.transcriptText}>"{transcript}"</Text>
            </View>
          )}

          {completionTarget && (
            <View>
              <Text style={bd.resultsLabel}>MARK AS COMPLETED?</Text>
              <View style={[bd.parsedCard, { borderLeftColor: RISK_COLORS[completionTarget.risk as Risk] }]}>
                <Text style={bd.parsedEmoji}>{completionTarget.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={bd.parsedTitle}>{completionTarget.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                    <Text style={[bd.parsedRisk, { color: RISK_COLORS[completionTarget.risk as Risk] }]}>{completionTarget.risk.toUpperCase()}</Text>
                    <Text style={bd.parsedDays}>{getDaysLabel(completionTarget.daysUntil)}</Text>
                    {completionTarget.amount && <Text style={bd.parsedAmount}>AED {completionTarget.amount.toLocaleString()}</Text>}
                  </View>
                </View>
              </View>
              <View style={{ gap: 10, marginTop: 8 }}>
                <TouchableOpacity style={bd.saveBtn} onPress={() => {
                  onResolve(completionTarget._id);
                  Speech.speak(`${completionTarget.title} marked as completed.`, { language: 'en-US', rate: 0.95 });
                  onClose();
                }}>
                  <Text style={bd.saveBtnText}>✓ Yes, mark as completed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[bd.saveBtn, { backgroundColor: C.surfaceEl }]} onPress={() => {
                  setCompletionTarget(null); parseWithClaude(transcript);
                }}>
                  <Text style={[bd.saveBtnText, { color: C.textSec }]}>Add as new task instead</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!completionTarget && parsed.length > 0 && (
            <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
              <Text style={bd.resultsLabel}>
                BUDDY FOUND {parsed.length} {parsed.length === 1 ? 'TASK' : 'TASKS'}
                {conflictWarnings.size > 0 ? `  ·  ⚠️ ${conflictWarnings.size} CONFLICT${conflictWarnings.size > 1 ? 'S' : ''}` : ''}
                {Object.keys(overloadWarnings).length > 0 ? `  ·  🔴 OVERLOAD` : ''}
              </Text>
              {parsed.map(item => {
                const riskColor = RISK_COLORS[item.risk as Risk];
                const conflicts = conflictWarnings.get(item._id);
                const overload  = overloadWarnings[item._id];
                const leftColor = conflicts ? C.orange : overload ? C.crimson : riskColor;
                return (
                  <View key={item._id}>
                    <View style={[bd.parsedCard, { borderLeftColor: leftColor }]}>
                      <Text style={bd.parsedEmoji}>{item.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={bd.parsedTitle}>{item.title}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                          <Text style={[bd.parsedRisk, { color: riskColor }]}>{item.risk.toUpperCase()}</Text>
                          <Text style={bd.parsedDays}>{getDaysLabel(item.daysUntil)}</Text>
                          {item.amount && <Text style={bd.parsedAmount}>AED {item.amount.toLocaleString()}</Text>}
                        </View>
                      </View>
                      <View style={bd.newBadge}><Text style={bd.newText}>NEW</Text></View>
                    </View>
                    {(conflicts || overload) && (
                      <BuddyResolutionCard
                        item={item}
                        conflictEvents={conflicts ?? []}
                        overload={overload}
                        onResolved={(eventId) => {
                          setConflictWarnings(prev => {
                            const next = new Map(prev);
                            const remaining = (next.get(item._id) ?? []).filter(e => e.id !== eventId);
                            if (remaining.length === 0) next.delete(item._id);
                            else next.set(item._id, remaining);
                            return next;
                          });
                        }}
                        onOpenCancelNote={onOpenCancelNote}
                      />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {voiceState === 'idle' && parsed.length === 0 && (
            <View style={bd.hintBox}>
              <Text style={bd.hintText}>
                💡 Try: "Hospital bill AED 800 next week, car service overdue, school fees 12,000 end of month..."
              </Text>
            </View>
          )}

          <Text style={[bd.statusText, {
            color: voiceState === 'recording' ? C.salmon :
                   voiceState === 'done'      ? C.chartreuse :
                   voiceState === 'error'     ? C.crimson : C.textSec,
          }]}>
            {voiceState === 'idle'         ? 'Tap the mic and speak your tasks' :
             voiceState === 'recording'    ? '🔴 Listening... tap to stop' :
             voiceState === 'transcribing' ? '⏳ Processing voice...' :
             voiceState === 'parsing'      ? '🤖 Buddy is structuring tasks...' :
             voiceState === 'done'         ? (completionTarget ? '✓ Found matching task — confirm below' : voiceMode === 'calendar_query' ? `📅 ${calendarEvents.length} ${calendarEvents.length === 1 ? 'meeting' : 'meetings'} · ${calendarQueryLabel}` : `✓ ${parsed.length} tasks found — save them below`) :
             voiceState === 'error'        ? 'Could not process. Try again.' : ''}
          </Text>

          {!isProcessing && voiceState !== 'done' && (
            <View style={{ alignItems: 'center', marginVertical: 8 }}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={[bd.micBtn, { backgroundColor: micBgColor, borderColor: micBorderColor }]}
                  onPress={handleMicPress}
                >
                  <Text style={bd.micIcon}>{voiceState === 'recording' ? '⏹' : '🎙️'}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}

          {isProcessing && (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator color={C.verdigris} size="large" />
            </View>
          )}

          {showReview && (
            <View>
              <Text style={bd.resultsLabel}>POSSIBLE DUPLICATES ({dupeItems.length})</Text>
              <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                {dupeItems.map(({ incoming, existing }) => {
                  const rc = RISK_COLORS[existing.risk as Risk];
                  return (
                    <View key={incoming._id} style={bd.dupeCard}>
                      <View style={bd.dupeRow}>
                        <View style={bd.dupeLabelPill}><Text style={bd.dupeLabelText}>EXISTS</Text></View>
                        <Text style={bd.dupeName}>{existing.emoji} {existing.title}</Text>
                        <Text style={[bd.parsedDays, { color: rc }]}>{getDaysLabel(existing.daysUntil)}</Text>
                      </View>
                      <View style={[bd.dupeRow, { opacity: 0.55 }]}>
                        <View style={[bd.dupeLabelPill, { backgroundColor: `${C.salmon}20` }]}>
                          <Text style={[bd.dupeLabelText, { color: C.salmon }]}>NEW</Text>
                        </View>
                        <Text style={bd.dupeName}>{incoming.emoji} {incoming.title}</Text>
                        <Text style={bd.parsedDays}>{getDaysLabel(incoming.daysUntil)}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <Text style={[bd.statusText, { color: C.textSec, marginTop: 8 }]}>
                {freshItems.length > 0 ? `${freshItems.length} new` : 'No new tasks'} · {dupeItems.length} already exist{dupeItems.length !== 1 ? '' : 's'}
              </Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                <TouchableOpacity style={bd.saveBtn} onPress={handleSkipDupes}>
                  <Text style={bd.saveBtnText}>
                    {freshItems.length > 0 ? `Add ${freshItems.length} new, skip duplicates` : 'Skip — already in list'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[bd.saveBtn, { backgroundColor: `${C.chartreuse}15`, borderWidth: 1, borderColor: `${C.chartreuse}35` }]} onPress={handleAddAll}>
                  <Text style={[bd.saveBtnText, { color: C.chartreuse }]}>Add all anyway</Text>
                </TouchableOpacity>
                <TouchableOpacity style={bd.retryBtn} onPress={() => setShowReview(false)}>
                  <Text style={bd.retryBtnText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!showReview && voiceState === 'done' && Object.keys(overloadWarnings).length > 0 && (
            <View style={ow.banner}>
              <Text style={{ fontSize: 16 }}>🔴</Text>
              <Text style={ow.bannerText}>
                {Object.keys(overloadWarnings).length === 1
                  ? '1 task is scheduled on an overloaded day — consider rescheduling to avoid burnout.'
                  : `${Object.keys(overloadWarnings).length} tasks are on overloaded days — consider spreading them out.`}
              </Text>
            </View>
          )}

          {!showReview && voiceState === 'done' && parsed.length > 0 && (
            <View style={{ gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={bd.saveBtn} onPress={handleSaveAll}>
                <Text style={bd.saveBtnText}>Add {parsed.length} {parsed.length === 1 ? 'task' : 'tasks'} to Automations</Text>
              </TouchableOpacity>
              <TouchableOpacity style={bd.retryBtn} onPress={() => {
                setParsed([]); setTranscript(''); setVoiceState('idle');
                setShowReview(false); setFreshItems([]); setDupeItems([]);
              }}>
                <Text style={bd.retryBtnText}>Discard & try again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Calendar query results */}
          {voiceMode === 'calendar_query' && voiceState === 'done' && (
            <View>
              <Text style={bd.resultsLabel}>
                {calendarEvents.length === 0
                  ? `NO MEETINGS · ${calendarQueryLabel.toUpperCase()}`
                  : `${calendarEvents.length} ${calendarEvents.length === 1 ? 'MEETING' : 'MEETINGS'} · ${calendarQueryLabel.toUpperCase()}`}
              </Text>
              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                {calendarEvents.length === 0 ? (
                  <View style={bd.noEventsBox}>
                    <Text style={bd.noEventsText}>📅 No meetings found for {calendarQueryLabel}</Text>
                  </View>
                ) : (
                  calendarEvents.map(ev => (
                    <View key={ev.id} style={bd.eventCard}>
                      <View style={bd.eventTimeCol}>
                        {ev.isAllDay ? (
                          <Text style={bd.eventAllDay}>ALL DAY</Text>
                        ) : (
                          <>
                            <Text style={bd.eventTime}>{fmtTime(ev.startTime)}</Text>
                            <Text style={bd.eventTimeSep}>–</Text>
                            <Text style={bd.eventTime}>{fmtTime(ev.endTime)}</Text>
                          </>
                        )}
                      </View>
                      <View style={bd.eventDivider} />
                      <View style={{ flex: 1 }}>
                        <Text style={bd.eventTitle}>{ev.title}</Text>
                        {!!ev.location  && <Text style={bd.eventSub}>📍 {ev.location}</Text>}
                        {!!ev.meetLink  && <Text style={bd.eventSub}>📹 Google Meet</Text>}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={bd.retryBtn} onPress={() => {
                setVoiceState('idle'); setVoiceMode('task_creation');
                setCalendarEvents([]); setCalendarQueryLabel(''); setTranscript('');
              }}>
                <Text style={bd.retryBtnText}>Ask another question</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showReview && voiceMode === 'task_creation' && voiceState === 'done' && parsed.length === 0 && (
            <TouchableOpacity style={bd.retryBtn} onPress={() => setVoiceState('idle')}>
              <Text style={bd.retryBtnText}>Nothing found — try again</Text>
            </TouchableOpacity>
          )}

          {voiceState === 'error' && (
            <TouchableOpacity style={bd.retryBtn} onPress={() => setVoiceState('idle')}>
              <Text style={bd.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Writing Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Single LanguageTool match returned by the REST API */
interface LTMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
}

/** Call LanguageTool public REST API — no key required, 20 req/min free */
async function checkGrammar(text: string): Promise<LTMatch[]> {
  if (!text.trim() || text.length < 15) return [];
  try {
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `language=en-US&text=${encodeURIComponent(text)}`,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.matches ?? []) as LTMatch[];
  } catch {
    return [];
  }
}

/** Apply a LanguageTool replacement to the text at the match position */
function applyLTFix(text: string, match: LTMatch, replacement: string): string {
  return text.slice(0, match.offset) + replacement + text.slice(match.offset + match.length);
}

/** Rewrite an email body in an authoritative C-suite executive tone via Claude */
async function improveToneWithClaude(
  body: string,
  context: { toAddress: string; subject: string; obligationTitle: string },
): Promise<string> {
  const { text } = await callAI({
    system:
      'You are a senior C-suite executive assistant. ' +
      'Rewrite the following email reply to sound authoritative, polished, and professionally warm. ' +
      'Maintain the original intent and all key details exactly. ' +
      'Be concise — no filler phrases. Use formal but approachable language. ' +
      'Do not add greetings or sign-offs unless already present. ' +
      'Return ONLY the rewritten email body, nothing else.',
    messages: [{
      role: 'user',
      content: `To: ${context.toAddress}\nSubject: ${context.subject}\nRegarding: ${context.obligationTitle}\n\nCurrent draft:\n${body}`,
    }],
    model:     'claude-opus-4-5',
    maxTokens: 1024,
  });
  return (text ?? body).trim();
}

/** Rule-based draft fallback — used when no Claude key or API fails */
function autoDraftWithRules(ob: any): string {
  const title   = ob.title   ?? 'your message';
  const type    = ob.type    ?? '';
  const subject = ob.replySubject ?? ob.title ?? '';

  if (/proposal/i.test(subject) || /proposal/i.test(title)) {
    return (
      `Thank you for sharing the proposal regarding "${title}".\n\n` +
      `I have reviewed the details and will provide comprehensive feedback shortly. ` +
      `Please let me know if there are any immediate action items that require my attention.\n\n` +
      `Best regards`
    );
  }
  if (type === 'payment' || /invoice/i.test(subject)) {
    return (
      `Thank you for the invoice related to "${title}".\n\n` +
      `I am reviewing this with our finance team and will confirm the payment schedule promptly.\n\n` +
      `Best regards`
    );
  }
  if (/follow.?up/i.test(subject) || /follow.?up/i.test(title)) {
    return (
      `Thank you for following up on "${title}".\n\n` +
      `I appreciate your diligence. I will revert with a detailed response by end of business today.\n\n` +
      `Best regards`
    );
  }
  return (
    `Thank you for your email regarding "${title}".\n\n` +
    `I have noted the details and will follow up with the necessary information at the earliest opportunity.\n\n` +
    `Best regards`
  );
}

/** Auto-draft a professional first reply via Claude; falls back to rules */
async function autoDraftReply(ob: any): Promise<string> {
  try {
    const context =
      `Subject: ${ob.replySubject ?? ob.title ?? 'N/A'}\n` +
      `From: ${ob.replyTo ?? 'Unknown sender'}\n` +
      `Context: ${ob.notes ?? ob.executionPath ?? 'No additional context'}\n` +
      `Obligation type: ${ob.type ?? 'reply_needed'}`;
    const { text } = await callAI({
      system:
        'You are a senior C-suite executive assistant drafting a professional email reply. ' +
        'Write a concise, polished reply (3–5 sentences) in the tone of a high-level executive. ' +
        'Be direct and professional. End with "Best regards" on a new line. ' +
        'Return ONLY the email body — no subject, no headers.',
      messages: [{ role: 'user', content: `Draft a reply to this email:\n${context}` }],
      model:     'claude-opus-4-5',
      maxTokens: 512,
    });
    return (text ?? autoDraftWithRules(ob)).trim();
  } catch {
    return autoDraftWithRules(ob);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Reply Modal
// Shown when user taps ✉️ on a reply_needed obligation.
// Drafts a reply to the sender; sends via Gmail or Outlook depending on
// which accounts are connected.
// ─────────────────────────────────────────────────────────────────────────────
function EmailReplyModal({
  visible,
  obligation,
  onClose,
  onSent,
}: {
  visible: boolean;
  obligation: UIObligation | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [toAddress,    setToAddress]    = useState('');
  const [subject,      setSubject]      = useState('');
  const [body,         setBody]         = useState('');
  const [sending,      setSending]      = useState(false);
  const [provider,     setProvider]     = useState<'gmail' | 'outlook'>('gmail');
  const [fromAccount,  setFromAccount]  = useState('');

  // AI / grammar states
  const [drafting,     setDrafting]     = useState(false);   // auto-draft in progress
  const [improving,    setImproving]    = useState(false);   // tone improvement in progress
  const [ltMatches,    setLtMatches]    = useState<LTMatch[]>([]);
  const [ltChecking,   setLtChecking]   = useState(false);
  const [ltExpanded,   setLtExpanded]   = useState(false);
  const ltDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill fields + auto-draft whenever a new obligation is loaded
  useEffect(() => {
    if (!obligation || !visible) return;
    const ob = obligation as any;
    setToAddress(ob.replyTo ?? '');
    setSubject(ob.replySubject ?? (ob.title ? `Re: ${ob.title}` : ''));
    setLtMatches([]);
    setLtExpanded(false);

    // Determine provider from notes field (e.g. "source: email from outlook@...")
    const notes = (ob.notes ?? '').toLowerCase();
    if (notes.includes('outlook')) {
      setProvider('outlook');
      const accs = getAllOutlookAccounts();
      setFromAccount(accs[0] ?? '');
    } else {
      setProvider('gmail');
      getAllGoogleAccounts().then(accs => setFromAccount(accs[0] ?? ''));
    }

    // Auto-draft a professional first reply
    setDrafting(true);
    setBody('');
    autoDraftReply(ob)
      .then(draft => setBody(draft))
      .catch(() => setBody(autoDraftWithRules(ob)))
      .finally(() => setDrafting(false));
  }, [obligation, visible]);

  // Debounced grammar check — fires 600 ms after user stops typing
  useEffect(() => {
    if (ltDebounceRef.current) clearTimeout(ltDebounceRef.current);
    if (!body.trim() || body.length < 20) { setLtMatches([]); return; }
    ltDebounceRef.current = setTimeout(async () => {
      setLtChecking(true);
      const matches = await checkGrammar(body);
      setLtMatches(matches);
      setLtChecking(false);
    }, 600);
    return () => { if (ltDebounceRef.current) clearTimeout(ltDebounceRef.current); };
  }, [body]);

  const handleImproveTone = async () => {
    if (!body.trim()) return;
    setImproving(true);
    try {
      const improved = await improveToneWithClaude(body, {
        toAddress,
        subject,
        obligationTitle: (obligation as any)?.title ?? '',
      });
      setBody(improved);
      setLtMatches([]); // re-check grammar on new text
    } catch (e: any) {
      Alert.alert('Tone improvement failed', e?.message ?? 'Please try again.');
    } finally {
      setImproving(false);
    }
  };

  const handleApplyFix = (match: LTMatch, replacement: string) => {
    const fixed = applyLTFix(body, match, replacement);
    setBody(fixed);
    setLtMatches(prev => prev.filter(m => m !== match));
    if (ltMatches.length <= 1) setLtExpanded(false);
  };

  const handleSend = async () => {
    if (!toAddress.trim() || !subject.trim() || !body.trim()) {
      Alert.alert('Missing fields', 'Please fill in To, Subject, and Message before sending.');
      return;
    }
    setSending(true);
    try {
      if (provider === 'outlook' && fromAccount) {
        const ok = await sendOutlookEmail(fromAccount, toAddress.trim(), subject.trim(), body.trim());
        if (!ok) throw new Error('Outlook send failed — check your connection.');
      } else {
        const token = fromAccount
          ? await getAccessTokenForEmail(fromAccount)
          : await getAccessToken();
        if (!token) throw new Error('No Gmail token. Please reconnect your Google account.');
        await sendGmailEmail(toAddress.trim(), subject.trim(), body.trim(), token);
      }
      Alert.alert('✅ Reply Sent', `Your reply has been sent to ${toAddress.trim()}.`);
      onSent();
      onClose();
    } catch (e: any) {
      Alert.alert('Send failed', e?.message ?? 'Could not send email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (!obligation) return null;
  const ob = obligation as any;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={reply.overlay}>
          <TouchableOpacity style={reply.backdrop} onPress={onClose} />
          <View style={reply.sheet}>
            <View style={reply.handle} />

            {/* Header */}
            <View style={reply.headerRow}>
              <View>
                <Text style={reply.title}>Reply to Email</Text>
                <Text style={reply.sub} numberOfLines={1}>{ob.title}</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={reply.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Provider badge */}
            <View style={reply.providerRow}>
              <View style={[reply.providerBadge, { backgroundColor: provider === 'gmail' ? '#EA433520' : '#0078D420' }]}>
                <Text style={[reply.providerText, { color: provider === 'gmail' ? '#EA4335' : '#0078D4' }]}>
                  {provider === 'gmail' ? '📧 Gmail' : '📨 Outlook'} · {fromAccount || 'No account connected'}
                </Text>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* To */}
              <Text style={reply.label}>To</Text>
              <TextInput
                style={reply.input}
                value={toAddress}
                onChangeText={setToAddress}
                placeholder="recipient@email.com"
                placeholderTextColor={C.textTer}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* Subject */}
              <Text style={reply.label}>Subject</Text>
              <TextInput
                style={reply.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="Re: ..."
                placeholderTextColor={C.textTer}
              />

              {/* Message */}
              <Text style={reply.label}>Message</Text>
              {drafting ? (
                <View style={[reply.input, reply.bodyInput, reply.draftingBox]}>
                  <ActivityIndicator color={C.verdigris} size="small" />
                  <Text style={reply.draftingText}>Drafting professional reply…</Text>
                </View>
              ) : (
                <TextInput
                  style={[reply.input, reply.bodyInput]}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Type your reply here…"
                  placeholderTextColor={C.textTer}
                  multiline
                  textAlignVertical="top"
                />
              )}

              {/* ── AI Action Row ───────────────────────────────────────── */}
              <View style={reply.aiRow}>
                {/* Improve Tone */}
                <TouchableOpacity
                  style={[reply.aiBtn, reply.aiBtnTone, (improving || drafting || !body.trim()) && { opacity: 0.45 }]}
                  onPress={handleImproveTone}
                  disabled={improving || drafting || !body.trim()}
                >
                  {improving
                    ? <ActivityIndicator color={C.bg} size="small" style={{ marginRight: 6 }} />
                    : <Text style={reply.aiBtnIcon}>✨</Text>
                  }
                  <Text style={reply.aiBtnText}>{improving ? 'Improving…' : 'Improve Tone'}</Text>
                </TouchableOpacity>

                {/* Re-draft */}
                <TouchableOpacity
                  style={[reply.aiBtn, reply.aiBtnDraft, (drafting || improving) && { opacity: 0.45 }]}
                  onPress={() => {
                    setDrafting(true);
                    autoDraftReply(ob)
                      .then(d => setBody(d))
                      .catch(() => setBody(autoDraftWithRules(ob)))
                      .finally(() => setDrafting(false));
                  }}
                  disabled={drafting || improving}
                >
                  <Text style={reply.aiBtnIcon}>⚡</Text>
                  <Text style={[reply.aiBtnText, { color: C.chartreuse }]}>Re-Draft</Text>
                </TouchableOpacity>
              </View>

              {/* ── Grammar Suggestions ─────────────────────────────────── */}
              {(ltChecking || ltMatches.length > 0) && (
                <View style={reply.grammarWrap}>
                  <TouchableOpacity
                    style={reply.grammarBadge}
                    onPress={() => setLtExpanded(e => !e)}
                    disabled={ltChecking}
                  >
                    {ltChecking
                      ? <ActivityIndicator color={C.orange} size="small" style={{ marginRight: 6 }} />
                      : <Text style={reply.grammarBadgeIcon}>⚠️</Text>
                    }
                    <Text style={reply.grammarBadgeText}>
                      {ltChecking
                        ? 'Checking grammar…'
                        : `${ltMatches.length} grammar suggestion${ltMatches.length !== 1 ? 's' : ''}`
                      }
                    </Text>
                    {!ltChecking && (
                      <Text style={reply.grammarChevron}>{ltExpanded ? '▲' : '▼'}</Text>
                    )}
                  </TouchableOpacity>

                  {ltExpanded && ltMatches.slice(0, 5).map((m, i) => (
                    <View key={i} style={reply.grammarItem}>
                      <Text style={reply.grammarMsg} numberOfLines={2}>
                        {m.shortMessage || m.message}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                        {m.replacements.slice(0, 4).map((r, j) => (
                          <TouchableOpacity
                            key={j}
                            style={reply.grammarFix}
                            onPress={() => handleApplyFix(m, r.value)}
                          >
                            <Text style={reply.grammarFixText}>{r.value}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  ))}
                </View>
              )}

              {/* Context note (Buddy suggests) */}
              {!!ob.executionPath && (
                <View style={reply.contextBox}>
                  <Text style={reply.contextLabel}>BUDDY SUGGESTS</Text>
                  <Text style={reply.contextText}>{ob.executionPath}</Text>
                </View>
              )}

              {/* Send button */}
              <TouchableOpacity
                style={[reply.sendBtn, (sending || !body.trim() || drafting) && { opacity: 0.5 }]}
                onPress={handleSend}
                disabled={sending || !body.trim() || drafting}
              >
                {sending
                  ? <ActivityIndicator color={C.bg} size="small" />
                  : <Text style={reply.sendBtnText}>Send Reply</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity style={reply.cancelBtn} onPress={onClose}>
                <Text style={reply.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── EmailReplyModal styles ─────────────────────────────────────────────────────
const reply = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: 'flex-end' },
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:         { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%' },
  handle:        { width: 36, height: 4, backgroundColor: C.textTer, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title:         { color: C.white, fontSize: 18, fontWeight: '700' },
  sub:           { color: C.textSec, fontSize: 12, marginTop: 2, maxWidth: 240 },
  closeBtn:      { color: C.textSec, fontSize: 20, paddingLeft: 8 },
  providerRow:   { marginBottom: 14 },
  providerBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  providerText:  { fontSize: 12, fontWeight: '600' },
  label:         { color: C.textSec, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6, marginTop: 2 },
  input:         { backgroundColor: C.surfaceEl, color: C.white, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  bodyInput:     { height: 130 },
  contextBox:    { backgroundColor: `${C.verdigris}12`, borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: `${C.verdigris}28` },
  contextLabel:  { color: C.verdigris, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 4 },
  contextText:   { color: C.textSec, fontSize: 13, lineHeight: 18 },
  sendBtn:       { backgroundColor: C.verdigris, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  sendBtnText:   { color: C.bg, fontSize: 15, fontWeight: '700' },
  cancelBtn:     { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: C.textSec, fontSize: 14 },

  // Drafting placeholder inside body box
  draftingBox:   { justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 10 },
  draftingText:  { color: C.textSec, fontSize: 13, fontStyle: 'italic' },

  // AI action row — Improve Tone + Re-Draft
  aiRow:         { flexDirection: 'row', gap: 8, marginBottom: 12 },
  aiBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 10, gap: 6 },
  aiBtnTone:     { backgroundColor: C.verdigris },
  aiBtnDraft:    { backgroundColor: C.surfaceEl, borderWidth: 1, borderColor: C.chartreuse + '55' },
  aiBtnIcon:     { fontSize: 15 },
  aiBtnText:     { color: C.bg, fontSize: 13, fontWeight: '700' },

  // Grammar suggestions
  grammarWrap:   { marginBottom: 12 },
  grammarBadge:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF950020', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  grammarBadgeIcon: { fontSize: 14 },
  grammarBadgeText: { color: C.orange, fontSize: 13, fontWeight: '600', flex: 1 },
  grammarChevron:   { color: C.orange, fontSize: 11 },
  grammarItem:   { backgroundColor: C.surfaceEl, borderRadius: 8, padding: 10, marginTop: 6, borderWidth: 1, borderColor: C.border },
  grammarMsg:    { color: C.textSec, fontSize: 12, lineHeight: 16 },
  grammarFix:    { backgroundColor: C.verdigris + '22', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, borderWidth: 1, borderColor: C.verdigris + '55' },
  grammarFixText: { color: C.verdigris, fontSize: 12, fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ObligationsScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const obligations       = useAppStore(s => s.obligations);
  const addObligation     = useAppStore(s => s.addObligation);
  const addObligations    = useAppStore(s => s.addObligations);
  const resolveObligation = useAppStore(s => s.resolveObligation);

  const [filter, setFilter]        = useState<'all' | Risk>('all');
  const [selected, setSelected]    = useState<any>(null);
  const [detailVisible, setDetail] = useState(false);
  const [addVisible, setAdd]       = useState(false);
  const [dumpVisible, setDump]     = useState(false);
  // Reply modal state
  const [replyVisible,     setReplyVisible]     = useState(false);
  const [replyObligation,  setReplyObligation]  = useState<UIObligation | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUp  = useRef(new Animated.Value(16)).current;

  // Cancellation note modal state (hoisted from BuddyResolutionCard to avoid nested Modals on web)
  const [cancelNoteModal, setCancelNoteModal] = useState(false);
  const [cancelNoteText, setCancelNoteText]   = useState('');
  const [pendingCancelEvent, setPendingCancelEvent] = useState<{id: string; title: string; time: string; attendeeEmails: string[]; accountEmail?: string; newItem: UIObligation | null} | null>(null);
  const [cancelSending, setCancelSending]     = useState(false);

  const openCancelNoteModal = (ev: CalendarEvent, itemTitle: string, newItem?: UIObligation) => {
    const timeStr = fmtTime(ev.startTime) + ' – ' + fmtTime(ev.endTime);
    const autoMessage =
      'Hi,\n\nI need to cancel our "' + ev.title + '" scheduled for ' + timeStr +
      '. I have a priority appointment ("' + itemTitle + '") that requires my immediate attention.' +
      '\n\nApologies for the short notice. I\'ll reach out to reschedule.\n\nBest regards';
    setPendingCancelEvent({
      id: ev.id,
      title: ev.title,
      time: timeStr,
      attendeeEmails: ev.attendees || [],
      accountEmail: ev.accountEmail,
      newItem: newItem ?? null,
    });
    setCancelNoteText(autoMessage);
    setCancelNoteModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!pendingCancelEvent) return;
    console.log('[CancelNote] Starting cancellation for:', pendingCancelEvent?.title, 'attendees:', pendingCancelEvent?.attendeeEmails);
    setCancelSending(true);
    try {
      // Use the account that owns the event; fall back to primary
      const token = pendingCancelEvent.accountEmail
        ? (await getAccessTokenForEmail(pendingCancelEvent.accountEmail) ?? await getAccessToken())
        : await getAccessToken();
      if (!token) throw new Error('No access token');

      // Cancel the calendar event
      const result = await cancelCalendarEvent(pendingCancelEvent.id, token, pendingCancelEvent.accountEmail);
      if (!result.ok) throw new Error(result.error ?? 'Could not cancel meeting.');

      // Send email to each attendee
      const emails = pendingCancelEvent.attendeeEmails.filter((e: string) => e && e.includes('@'));
      for (const email of emails) {
        console.log('[CancelNote] Sending email to:', email);
        await sendGmailEmail(
          email,
          'Cancelled: ' + pendingCancelEvent.title,
          cancelNoteText,
          token,
        );
      }

      // Capture title/item before clearing state
      const cancelledTitle = pendingCancelEvent.title;
      const newItemToSave  = pendingCancelEvent.newItem;

      // Close the cancellation note modal and clear pending state
      setCancelNoteModal(false);
      setPendingCancelEvent(null);

      // Save the new task that was being added (e.g. "Hospital appointment")
      if (newItemToSave) {
        addObligation(newItemToSave);
      }

      // Close the Brain Dump modal so the conflict card disappears
      setDump(false);

      if (emails.length > 0) {
        Alert.alert('✅ Done', '"' + cancelledTitle + '" has been cancelled and a notification email was sent to ' + emails.length + ' attendee(s).');
      } else {
        Alert.alert('✅ Done', '"' + cancelledTitle + '" has been cancelled. No attendees to notify.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setCancelSending(false);
    }
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideUp,  { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const active    = obligations.filter(o => o.status === 'active');
  const filtered  = filter === 'all' ? active : active.filter(o => o.risk === filter);
  const completed = obligations.filter(o => o.status === 'completed');
  const highCount = active.filter(o => o.risk === 'high').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView edges={['top']}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideUp }] }]}>
          <View>
            <Text style={styles.screenLabel}>LIFE STACK</Text>
            <Text style={styles.screenTitle}>Automations</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {highCount > 0 && (
              <View style={styles.urgentBadge}>
                <View style={styles.urgentDot} />
                <Text style={styles.urgentText}>{highCount} urgent</Text>
              </View>
            )}
            <TouchableOpacity style={styles.micBtn} onPress={() => setDump(true)}>
              <Text style={styles.micIcon}>🎙️</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Filter pills ───────────────────────────────────────────────── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {(['all', 'high', 'medium', 'low'] as const).map((f) => {
            const isActive = filter === f;
            const fColor = f === 'high' ? C.crimson : f === 'medium' ? C.orange : f === 'low' ? C.verdigris : C.white;
            const count = f === 'all' ? active.length : active.filter(o => o.risk === f).length;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, isActive && { backgroundColor: fColor, borderColor: fColor }]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, isActive && { color: f === 'all' ? C.bg : C.white }]}>
                  {f === 'all' ? `All` : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
                <View style={[styles.filterCount, isActive && { backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                  <Text style={[styles.filterCountText, isActive && { color: C.white }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* ── Obligation list ────────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.map((item) => (
          <Animated.View key={item._id} style={{ opacity: fadeAnim }}>
            <ObligationCard
              item={item}
              onPress={(it: any) => { setSelected(it); setDetail(true); }}
              onResolve={(it: any) => resolveObligation(it._id)}
              onReply={(it: UIObligation) => { setReplyObligation(it); setReplyVisible(true); }}
            />
          </Animated.View>
        ))}

        {/* ── Empty states ──────────────────────────────────────────────── */}

        {/* Brand-new user: zero tasks at all → full onboarding card */}
        {active.length === 0 && (
          <View style={es.wrap}>

            {/* Hero */}
            <View style={es.heroRow}>
              <View style={es.heroBadge}>
                <Text style={es.heroBadgeText}>✦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={es.heroTitle}>Your Life Stack is empty</Text>
                <Text style={es.heroSub}>
                  Track every obligation — renewals, bills, appointments — in one place
                  so nothing slips through the cracks.
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={es.divider} />

            {/* Section: How to add */}
            <Text style={es.sectionLabel}>3 WAYS TO ADD TASKS</Text>

            {/* Method 1 — Voice */}
            <TouchableOpacity style={es.methodCard} onPress={() => setDump(true)} activeOpacity={0.82}>
              <View style={[es.methodIcon, { backgroundColor: `${C.salmon}18`, borderColor: `${C.salmon}30` }]}>
                <Text style={es.methodEmoji}>🎙️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={es.methodTitle}>Voice Brain Dump</Text>
                <Text style={es.methodDesc}>
                  Speak freely — "Hospital bill AED 800 next week, car service overdue…"
                  Buddy structures it into tasks automatically.
                </Text>
              </View>
              <View style={[es.methodBadge, { backgroundColor: `${C.salmon}15` }]}>
                <Text style={[es.methodBadgeText, { color: C.salmon }]}>FASTEST</Text>
              </View>
            </TouchableOpacity>

            {/* Method 2 — Manual */}
            <TouchableOpacity style={es.methodCard} onPress={() => setAdd(true)} activeOpacity={0.82}>
              <View style={[es.methodIcon, { backgroundColor: `${C.chartreuse}18`, borderColor: `${C.chartreuse}30` }]}>
                <Text style={es.methodEmoji}>＋</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={es.methodTitle}>Add Manually</Text>
                <Text style={es.methodDesc}>
                  Tap the <Text style={{ color: C.chartreuse, fontWeight: '700' }}>+</Text> button at the bottom-right to
                  fill in the title, due date, risk level and amount.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Method 3 — Buddy chat */}
            <TouchableOpacity style={es.methodCard} onPress={() => nav.navigate('buddy')} activeOpacity={0.82}>
              <View style={[es.methodIcon, { backgroundColor: `${C.verdigris}18`, borderColor: `${C.verdigris}30` }]}>
                <Text style={es.methodEmoji}>✦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={es.methodTitle}>Ask Buddy</Text>
                <Text style={es.methodDesc}>
                  Chat with your AI assistant — say "add my visa renewal due in 45 days"
                  and Buddy adds it here instantly.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Divider */}
            <View style={es.divider} />

            {/* Example categories */}
            <Text style={es.sectionLabel}>WHAT YOU CAN TRACK</Text>
            <View style={es.examplesGrid}>
              {[
                { emoji: '🛂', label: 'Visa Renewal' },
                { emoji: '🪪', label: 'Emirates ID' },
                { emoji: '🚗', label: 'Car Reg.' },
                { emoji: '🛡️', label: 'Insurance' },
                { emoji: '💡', label: 'Utility Bills' },
                { emoji: '🎓', label: 'School Fees' },
                { emoji: '🏥', label: 'Medical' },
                { emoji: '💰', label: 'Payments' },
              ].map(ex => (
                <View key={ex.label} style={es.exampleChip}>
                  <Text style={es.exampleEmoji}>{ex.emoji}</Text>
                  <Text style={es.exampleLabel}>{ex.label}</Text>
                </View>
              ))}
            </View>

          </View>
        )}

        {/* Has tasks but current filter has none */}
        {active.length > 0 && filtered.length === 0 && (
          <View style={es.filterEmptyWrap}>
            <View style={es.filterEmptyIcon}>
              <Text style={{ fontSize: 22, color: C.verdigris }}>✓</Text>
            </View>
            <Text style={es.filterEmptyTitle}>
              No {filter === 'high' ? 'urgent' : filter === 'medium' ? 'medium-risk' : 'low-risk'} tasks
            </Text>
            <Text style={es.filterEmptySub}>
              You have {active.length} task{active.length !== 1 ? 's' : ''} total.
              Switch to <Text style={{ color: C.white, fontWeight: '700' }}>All</Text> to see them.
            </Text>
            <TouchableOpacity style={es.filterEmptyBtn} onPress={() => setFilter('all')}>
              <Text style={es.filterEmptyBtnText}>View all tasks</Text>
            </TouchableOpacity>
          </View>
        )}

        {completed.length > 0 && (
          <View style={styles.completedSection}>
            <Text style={styles.completedLabel}>COMPLETED ({completed.length})</Text>
            {completed.map(item => (
              <View key={item._id} style={styles.completedCard}>
                <Text style={styles.completedEmoji}>{item.emoji}</Text>
                <Text style={styles.completedTitle}>{item.title}</Text>
                <Text style={[styles.completedCheck, { color: C.verdigris }]}>✓</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.fab} onPress={() => setAdd(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <TabBar active="obligations" onTab={(sc) => nav.navigate(sc)} />

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <DetailModal
        item={selected} visible={detailVisible}
        onClose={() => setDetail(false)}
        onResolve={(it: any) => resolveObligation(it._id)}
        onReply={(it: UIObligation) => { setReplyObligation(it); setReplyVisible(true); }}
      />
      <AddModal
        visible={addVisible} onClose={() => setAdd(false)}
        onAdd={(item: any) => addObligation(item)}
      />
      <BrainDumpModal
        visible={dumpVisible} onClose={() => setDump(false)}
        onSave={(items) => addObligations(items)}
        existingObligations={active}
        onResolve={(id) => resolveObligation(id)}
        onOpenCancelNote={openCancelNoteModal}
      />

      {/* Email Reply Modal — shown when user taps ✉️ on a reply_needed obligation */}
      <EmailReplyModal
        visible={replyVisible}
        obligation={replyObligation}
        onClose={() => setReplyVisible(false)}
        onSent={() => {
          // Mark the obligation as resolved after sending reply
          if (replyObligation) resolveObligation(replyObligation._id);
        }}
      />

      {/* Cancellation Note Modal — top-level, not nested inside BrainDumpModal */}
      <Modal
        visible={cancelNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setCancelNoteModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <View style={{
            backgroundColor: '#1A1A1A',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 24,
            maxHeight: '80%',
          }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
              ✉️ Cancellation Note
            </Text>
            <Text style={{ color: '#9A9A9A', fontSize: 13, marginBottom: 16 }}>
              Review and edit the message before sending to attendees.
            </Text>
            <TextInput
              value={cancelNoteText}
              onChangeText={setCancelNoteText}
              multiline
              style={{
                backgroundColor: '#252525',
                color: '#FFFFFF',
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
                minHeight: 160,
                textAlignVertical: 'top',
                marginBottom: 16,
                borderWidth: 1,
                borderColor: '#333',
              }}
            />
            <TouchableOpacity
              onPress={handleConfirmCancel}
              disabled={cancelSending}
              style={{
                backgroundColor: cancelSending ? '#555' : '#FF3B30',
                borderRadius: 12,
                padding: 16,
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              {cancelSending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>
                  Send & Cancel Meeting
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setCancelNoteModal(false)}
              style={{ alignItems: 'center', padding: 12 }}
            >
              <Text style={{ color: '#9A9A9A', fontSize: 14 }}>Go back</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },

  // Header
  header:       {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14,
  },
  screenLabel:  { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: 2 },
  screenTitle:  { color: C.white, fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  urgentBadge:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${C.crimson}18`, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: `${C.crimson}35`,
  },
  urgentDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: C.crimson },
  urgentText:   { color: C.crimson, fontSize: 12, fontWeight: '700' },
  micBtn:       {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: `${C.salmon}14`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${C.salmon}30`,
  },
  micIcon:      { fontSize: 18 },

  // Filter row
  filterRow:    { marginBottom: 8 },
  filterPill:   {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
  },
  filterText:      { color: C.textSec, fontSize: 13, fontWeight: '600' },
  filterCount:     {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: C.surfaceEl,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterCountText: { color: C.textTer, fontSize: 11, fontWeight: '700' },

  // List
  list:         { paddingHorizontal: 16, paddingTop: 4 },
  card:         {
    backgroundColor: C.surface, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 4, gap: 12,
  },
  cardIcon:     { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardEmoji:    { fontSize: 24 },
  cardBody:     { flex: 1, gap: 4 },
  cardTitle:    { color: C.white, fontSize: 15, fontWeight: '600' },
  cardNotes:    { color: C.textTer, fontSize: 12 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  riskPill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  riskPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  daysText:     { fontSize: 12, fontWeight: '700' },
  amount:       { color: C.textSec, fontSize: 12 },
  resolveBtn:   {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: `${C.verdigris}18`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${C.verdigris}35`,
  },
  resolveBtnText: { color: C.verdigris, fontSize: 16, fontWeight: '700' },

  // Empty (kept for any residual refs — real states use es.*)
  emptyState:   { alignItems: 'center', paddingVertical: 64, gap: 10 },
  emptyEmoji:   { fontSize: 44, color: C.verdigris },
  emptyText:    { color: C.white, fontSize: 17, fontWeight: '600' },
  emptySub:     { color: C.textTer, fontSize: 13 },

  // Completed
  completedSection: { marginTop: 20 },
  completedLabel:   { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  completedCard:    {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: `${C.surface}80`, borderRadius: 12, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: `${C.border}50`, opacity: 0.6,
  },
  completedEmoji:   { fontSize: 18 },
  completedTitle:   { flex: 1, color: C.textSec, fontSize: 14, textDecorationLine: 'line-through' },
  completedCheck:   { fontSize: 16, fontWeight: '700' },

  // FAB
  fab:     {
    position: 'absolute', bottom: 90, right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: C.chartreuse,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.chartreuse, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 12,
  },
  fabText: { color: C.bg, fontSize: 30, fontWeight: '300', lineHeight: 34 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111111',
    borderTopWidth: 1, borderColor: C.border,
    paddingBottom: 20, paddingTop: 8, height: 80,
  },
  tabItem:  { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon:  { fontSize: 20, color: C.textTer },
  tabLabel: { fontSize: 10, color: C.textTer, fontWeight: '500' },
  tabDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: C.verdigris, marginTop: 2 },

  // Hologram orb
  orbWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -24 },
  orb: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orbWave:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  orbWaveBar: { width: 2.5, backgroundColor: '#FFFFFF', borderRadius: 2, opacity: 0.9 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty-state styles (onboarding + filter-miss)
// ─────────────────────────────────────────────────────────────────────────────
const es = StyleSheet.create({
  // ── Full onboarding card ─────────────────────────────────────────────────
  wrap: {
    marginTop: 8, marginHorizontal: 0,
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1, borderColor: C.border,
    padding: 20, gap: 16,
  },

  // Hero row
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroBadge: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: `${C.verdigris}18`,
    borderWidth: 1, borderColor: `${C.verdigris}35`,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  heroBadgeText: { color: C.verdigris, fontSize: 20, fontWeight: '800' },
  heroTitle: { color: C.white, fontSize: 16, fontWeight: '700', marginBottom: 6, lineHeight: 22 },
  heroSub:   { color: C.textSec, fontSize: 13, lineHeight: 20 },

  divider: { height: 1, backgroundColor: C.border },

  sectionLabel: {
    color: C.textTer, fontSize: 10, fontWeight: '700',
    letterSpacing: 2, marginBottom: 4,
  },

  // Method cards
  methodCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.surfaceEl,
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  methodIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  methodEmoji: { fontSize: 18 },
  methodTitle: { color: C.white, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  methodDesc:  { color: C.textSec, fontSize: 12, lineHeight: 18 },
  methodBadge: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    alignSelf: 'flex-start', flexShrink: 0,
  },
  methodBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Examples grid
  examplesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exampleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.surfaceEl,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: C.border,
  },
  exampleEmoji: { fontSize: 14 },
  exampleLabel: { color: C.textSec, fontSize: 11, fontWeight: '600' },

  // ── Filter-miss state ────────────────────────────────────────────────────
  filterEmptyWrap: { alignItems: 'center', paddingVertical: 52, gap: 10 },
  filterEmptyIcon: {
    width: 54, height: 54, borderRadius: 16,
    backgroundColor: `${C.verdigris}14`,
    borderWidth: 1, borderColor: `${C.verdigris}30`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  filterEmptyTitle: { color: C.white, fontSize: 16, fontWeight: '700' },
  filterEmptySub:   { color: C.textSec, fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  filterEmptyBtn: {
    marginTop: 6,
    backgroundColor: `${C.verdigris}18`,
    borderRadius: 12, borderWidth: 1, borderColor: `${C.verdigris}35`,
    paddingHorizontal: 22, paddingVertical: 10,
  },
  filterEmptyBtnText: { color: C.verdigris, fontSize: 13, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Modal styles (dark theme)
// ─────────────────────────────────────────────────────────────────────────────
const modal = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.88)' },
  sheet:          {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: C.border,
  },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surfaceHi, alignSelf: 'center', marginBottom: 24 },
  header:         { flexDirection: 'row', gap: 16, marginBottom: 20, alignItems: 'center' },
  icon:           { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:          { color: C.white, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  riskBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  riskText:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  infoGrid:       { flexDirection: 'row', gap: 12, marginBottom: 20 },
  infoItem:       {
    flex: 1, backgroundColor: C.surfaceEl, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  infoLabel:      { color: C.textTer, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  infoValue:      { color: C.white, fontSize: 20, fontWeight: '700' },
  executionBlock: {
    backgroundColor: C.surfaceEl, borderRadius: 14, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: C.border,
  },
  executionLabel: { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  executionText:  { color: C.textSec, fontSize: 14, lineHeight: 20 },
  actions:        { gap: 10 },
  primaryBtn:     { borderRadius: 999, overflow: 'hidden' },
  primaryBtnGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: 999 },
  primaryBtnText: { color: C.bg, fontSize: 16, fontWeight: '800' },
  secondaryBtn:   {
    borderRadius: 999, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  secondaryBtnText: { color: C.textSec, fontSize: 15, fontWeight: '500' },
  // ── New email-content sections ─────────────────────────────────────────────
  sectionBlock: {
    backgroundColor: C.surfaceEl, borderRadius: 14, padding: 14,
    marginBottom: 14, borderWidth: 1, borderColor: C.border,
  },
  sectionLabel: { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  sectionText:  { color: C.textSec, fontSize: 14, lineHeight: 20 },
  bodyText:     { color: C.textSec, fontSize: 13, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  meetingBtn: {
    backgroundColor: '#1a6b5c', borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: C.verdigris,
  },
  meetingBtnText: { color: C.chartreuse, fontSize: 15, fontWeight: '700' },
  attachmentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  attachmentName: { color: C.white, fontSize: 13, flex: 1, marginRight: 8 },
  attachmentSize: { color: C.textTer, fontSize: 12 },
});

const add = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.88)' },
  sheet:          {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 20, maxHeight: '90%',
    borderTopWidth: 1, borderColor: C.border,
  },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surfaceHi, alignSelf: 'center', marginBottom: 20 },
  titleRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle:     { color: C.white, fontSize: 20, fontWeight: '700' },
  closeBtn:       { color: C.textSec, fontSize: 20, padding: 4 },
  label:          { color: C.textSec, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  input:          {
    backgroundColor: C.surfaceEl, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingVertical: 13, paddingHorizontal: 16, color: C.white, fontSize: 15, marginBottom: 16,
  },
  typePill:       {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: C.surfaceEl, borderWidth: 1, borderColor: C.border,
  },
  typePillActive: { backgroundColor: C.verdigris, borderColor: C.verdigris },
  typePillText:   { color: C.textSec, fontSize: 13, fontWeight: '600' },
  riskRow:        { flexDirection: 'row', gap: 10, marginBottom: 16 },
  riskBtn:        {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: C.surfaceEl, borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  riskBtnText:    { color: C.textSec, fontSize: 13, fontWeight: '600' },
  addBtn:         { backgroundColor: C.chartreuse, borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  addBtnText:     { color: C.bg, fontSize: 16, fontWeight: '700' },
});

const bd = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.90)' },
  sheet:          {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36, borderTopWidth: 1, borderColor: C.border,
  },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.surfaceHi, alignSelf: 'center', marginBottom: 20 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title:          { color: C.white, fontSize: 20, fontWeight: '700' },
  sub:            { color: C.textSec, fontSize: 12, marginTop: 2 },
  closeBtn:       { color: C.textSec, fontSize: 20, padding: 4 },
  hintBox:        {
    backgroundColor: `${C.verdigris}10`, borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: `${C.verdigris}20`,
  },
  hintText:       { color: C.textSec, fontSize: 12, lineHeight: 18 },
  transcriptBox:  { backgroundColor: C.surfaceEl, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  transcriptLabel:{ color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  transcriptText: { color: C.textSec, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  resultsLabel:   { color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  parsedCard:     {
    backgroundColor: C.surfaceEl, borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
    borderWidth: 1, borderColor: C.border, borderLeftWidth: 3,
  },
  parsedEmoji:    { fontSize: 20, width: 28, textAlign: 'center' },
  parsedTitle:    { color: C.white, fontSize: 13, fontWeight: '600' },
  parsedRisk:     { fontSize: 10, fontWeight: '800' },
  parsedDays:     { color: C.textSec, fontSize: 11 },
  parsedAmount:   { color: C.textSec, fontSize: 11 },
  newBadge:       { backgroundColor: `${C.chartreuse}18`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: `${C.chartreuse}35` },
  newText:        { color: C.chartreuse, fontSize: 8, fontWeight: '800' },
  statusText:     { textAlign: 'center', fontSize: 13, fontWeight: '500', marginBottom: 8, minHeight: 20 },
  micBtn:         { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  micIcon:        { fontSize: 28 },
  saveBtn:        { backgroundColor: C.chartreuse, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  saveBtnText:    { color: C.bg, fontSize: 15, fontWeight: '700' },
  retryBtn:       { alignItems: 'center', paddingVertical: 10 },
  retryBtnText:   { color: C.textTer, fontSize: 13 },
  noEventsBox:    { backgroundColor: C.surfaceEl, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 8 },
  noEventsText:   { color: C.textSec, fontSize: 13, textAlign: 'center' },
  eventCard:      { flexDirection: 'row', backgroundColor: C.surfaceEl, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.verdigris, gap: 10, alignItems: 'flex-start' },
  eventTimeCol:   { alignItems: 'center', minWidth: 60 },
  eventTime:      { color: C.textSec, fontSize: 10, fontWeight: '600' },
  eventTimeSep:   { color: C.textTer, fontSize: 9 },
  eventAllDay:    { color: C.verdigris, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  eventDivider:   { width: 1, alignSelf: 'stretch', backgroundColor: C.border },
  eventTitle:     { color: C.white, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  eventSub:       { color: C.textTer, fontSize: 11, marginTop: 1 },
  dupeCard:       { backgroundColor: C.surfaceEl, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 6 },
  dupeRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dupeLabelPill:  { backgroundColor: `${C.verdigris}18`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  dupeLabelText:  { color: C.verdigris, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  dupeName:       { flex: 1, color: C.white, fontSize: 12, fontWeight: '600' },
});

