// src/screens/BrainDump/BrainDumpScreen.tsx
// Voice Brain Dump — speak freely, Claude structures into obligations
// Flow: Record voice → transcribe → Claude parses → obligations created in store

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { VoiceService } from '../../services/voiceService';
import { useAppStore } from '../../store';
import { checkTimeConflicts, fetchEventsForDateRange, detectDayOverload, cancelCalendarEvent, CalendarEvent, fmtTime, fmtDate, OVERLOAD_THRESHOLD } from '../../services/calendarService';
import type { NavProp } from '../../../app/index';

const C = {
  bg:         '#002F3A',
  surface:    '#0A3D4A',
  surfaceEl:  '#0F4A5A',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  salmon:     '#FF9F8A',
  crimson:    '#D7263D',
  orange:     '#FF7A00',
  white:      '#FEFFFE',
  textSec:    '#8FB8BF',
  textTer:    '#4A7A85',
  border:     '#1A5060',
};

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'done' | 'error';
type Risk = 'high' | 'medium' | 'low';

type VoiceMode = 'task_creation' | 'calendar_query';

type ParsedResponse =
  | { intent: 'tasks'; items: ParsedObligation[] }
  | { intent: 'calendar_query'; start: string; end: string; label: string };

type ParsedObligation = {
  _id: string;
  emoji: string;
  title: string;
  type: string;
  daysUntil: number;
  risk: Risk;
  amount: number | null;
  status: 'active';
  executionPath: string;
  notes: string | null;
  scheduledTime: string | null; // ISO datetime if user mentioned a specific time
};

// ── Claude prompt — extracts obligations from free speech ─────────────────────
// Injected at call time so the date is always current and unambiguous
function buildBrainDumpSystem(): string {
  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const now   = new Date();
  const yyyy  = now.getFullYear();
  const mm    = String(now.getMonth() + 1).padStart(2, '0');
  const dd    = String(now.getDate()).padStart(2, '0');
  const todayISO    = `${yyyy}-${mm}-${dd}`;
  const todayHuman  = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${yyyy}`;

  // Pre-compute next 14 days so Claude can resolve "Saturday", "next Monday" etc.
  const upcomingDays = Array.from({ length: 14 }, (_, i) => {
    const d    = new Date(now);
    d.setDate(now.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const label = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : DAYS[d.getDay()];
    return `  ${label} = ${y}-${m}-${day} (${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()})`;
  }).join('\n');

  // Last day of current month
  const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
  const daysLeftInMonth = lastDay - now.getDate();

  return `You are Buddy, the AI chief of staff inside Wyle — a life management app for busy professionals in Dubai, UAE.

The user has just done a voice brain dump — they spoke freely about everything on their mind that needs to be handled.

=== DATE CONTEXT (use ONLY these values — do not invent or guess) ===
TODAY'S DATE: ${todayHuman}
TODAY ISO:    ${todayISO}

UPCOMING DATES (use these to resolve day names like "Saturday", "next Monday"):
${upcomingDays}

Days remaining in current month: ${daysLeftInMonth}
=== END DATE CONTEXT ===

Your job: Extract ALL obligations, tasks, payments, renewals, deadlines, or to-dos from what they said. Return them as a JSON array and NOTHING else — no explanation, no markdown, no preamble.

Each obligation must have:
- _id: unique string (use timestamp + index like "dump_1_1234567890")
- emoji: relevant emoji for the type
- title: short clear title (max 5 words)
- type: one of: visa, emirates_id, car_registration, insurance, bill, school_fee, medical, appointment, payment, task, other
- daysUntil: EXACTLY how many days from TODAY (${todayISO}) until the due date. Use the UPCOMING DATES table above to resolve day names. "tomorrow" = 1, "today" = 0, "end of month" = ${daysLeftInMonth}, "next week" = 7, "soon" = 14. For a named day like "Saturday" look it up in the table above.
- risk: "high" if daysUntil < 7 or urgent, "medium" if 7-30, "low" if > 30
- amount: AED amount as number if mentioned, otherwise null
- status: always "active"
- executionPath: brief instruction on how to handle (1 short sentence)
- notes: any extra detail mentioned, or null
- scheduledTime: if the user mentions a SPECIFIC TIME (e.g. "9:30 AM", "2 PM", "at noon"), combine the resolved date + time into a full ISO 8601 string (e.g. "2026-03-21T09:30:00"). If no specific time is mentioned, return null.

CRITICAL RULES:
1. daysUntil must be calculated from ${todayISO}. Do NOT use any other reference date.
2. "coming Saturday" or "this Saturday" = look up Saturday in the UPCOMING DATES table above.
3. Always include scheduledTime when a time of day is mentioned (even with relative dates like "Saturday at 9:30 AM").

Example — if today is 2026-03-19 (Thursday) and user says "hospital appointment coming Saturday at 9:30 AM":
Saturday = 2026-03-21, daysUntil = 2, scheduledTime = "2026-03-21T09:30:00"

[
  {
    "_id": "dump_1_1234567890",
    "emoji": "🏥",
    "title": "Hospital Appointment",
    "type": "appointment",
    "daysUntil": 2,
    "risk": "high",
    "amount": null,
    "status": "active",
    "executionPath": "Attend hospital appointment on time",
    "notes": "Saturday March 21st at 9:30 AM",
    "scheduledTime": "2026-03-21T09:30:00"
  }
]

=== DUAL INTENT DETECTION ===
You must detect whether the user is CREATING tasks OR QUERYING their calendar.

INTENT: "tasks" — user is creating/adding tasks, obligations, reminders
  Return: {"intent": "tasks", "items": [...obligation objects...]}
  If nothing actionable: {"intent": "tasks", "items": []}

INTENT: "calendar_query" — user is ASKING about their schedule, meetings, or events
  Triggered by phrases like:
  - "what meetings do I have next week / tomorrow / on Saturday"
  - "tell me my schedule for..."
  - "do I have anything on Monday"
  - "show me meetings on March 21st"
  - "what's on my calendar"
  - "list my meetings"
  Return: {"intent": "calendar_query", "start": "<ISO datetime>", "end": "<ISO datetime>", "label": "<human period>"}
  Where:
  - start = beginning of queried period (start of day: T00:00:00)
  - end   = end of queried period (end of day: T23:59:59, or end of week)
  - label = short human description e.g. "Saturday, Mar 21", "next week", "tomorrow"

  Examples using today = ${todayISO}:
  - "meetings next week" → {"intent":"calendar_query","start":"${yyyy}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()+1).padStart(2,'0')}T00:00:00","end":"${yyyy}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()+7).padStart(2,'0')}T23:59:59","label":"next 7 days"}
  - "meetings on Saturday" → {"intent":"calendar_query","start":"2026-03-21T00:00:00","end":"2026-03-21T23:59:59","label":"Saturday, Mar 21"}
  - "meetings tomorrow" → compute tomorrow from UPCOMING DATES table

Return ONLY valid JSON. No other text.`;
}

// ── Waveform animation ────────────────────────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  const bars = Array.from({ length: 20 }, (_, i) => useRef(new Animated.Value(0.2)).current);

  useEffect(() => {
    if (active) {
      bars.forEach((bar, i) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 40),
            Animated.timing(bar, { toValue: Math.random() * 0.8 + 0.2, duration: 200 + Math.random() * 200, useNativeDriver: true }),
            Animated.timing(bar, { toValue: 0.2, duration: 200 + Math.random() * 200, useNativeDriver: true }),
          ])
        ).start();
      });
    } else {
      bars.forEach(bar => {
        bar.stopAnimation();
        Animated.timing(bar, { toValue: 0.2, duration: 300, useNativeDriver: true }).start();
      });
    }
  }, [active]);

  return (
    <View style={wv.container}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[wv.bar, {
            transform: [{ scaleY: bar }],
            backgroundColor: active ? C.salmon : C.textTer,
            opacity: active ? 1 : 0.4,
          }]}
        />
      ))}
    </View>
  );
}

const wv = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 60, paddingHorizontal: 8 },
  bar:       { width: 4, height: 40, borderRadius: 2 },
});

// ── Parsed obligation preview card ────────────────────────────────────────────
type OverloadInfo = { count: number; events: CalendarEvent[] };

function ObligationPreview({
  item,
  conflictEvents = [],
  overload = null,
  onCancelConflict,
}: {
  item: ParsedObligation;
  conflictEvents?: CalendarEvent[];
  overload?: OverloadInfo | null;
  onCancelConflict?: (eventId: string, title: string) => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 100, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const hasConflict  = conflictEvents.length > 0;
  const hasOverload  = !!overload;
  const riskColor    = hasConflict ? C.crimson : hasOverload ? C.salmon : item.risk === 'high' ? C.crimson : item.risk === 'medium' ? C.chartreuse : C.verdigris;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], marginBottom: 10 }}>
      {/* Main card */}
      <View style={[op.card, { borderLeftColor: riskColor, marginBottom: hasConflict ? 0 : 0 }]}>
        <Text style={op.emoji}>{item.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={op.title}>{item.title}</Text>
          <View style={op.meta}>
            <View style={[op.riskPill, { backgroundColor: `${riskColor}20` }]}>
              <Text style={[op.riskText, { color: riskColor }]}>{item.risk.toUpperCase()}</Text>
            </View>
            <Text style={op.days}>
              {item.daysUntil === 0 ? 'Due today' : item.daysUntil === 1 ? 'Tomorrow' : `${item.daysUntil} days`}
            </Text>
            {item.amount && <Text style={op.amount}>AED {item.amount.toLocaleString()}</Text>}
          </View>
          {item.notes && <Text style={op.notes}>{item.notes}</Text>}
        </View>
        <View style={op.newBadge}>
          <Text style={op.newText}>NEW</Text>
        </View>
      </View>

      {/* ⚡ Buddy resolution card — shown when conflict or overload detected */}
      {(hasConflict || hasOverload) && (
        <View style={op.resolutionCard}>
          {/* Header */}
          <View style={op.resolutionHeader}>
            <Text style={op.resolutionIcon}>⚡</Text>
            <View style={{ flex: 1 }}>
              <Text style={op.resolutionTitle}>Buddy needs your input</Text>
              <Text style={op.resolutionSub}>
                {hasConflict && hasOverload
                  ? `Conflict detected + ${overload!.count} meetings already on that day`
                  : hasConflict
                  ? 'There\'s a scheduling conflict on that day'
                  : `That day already has ${overload!.count} meetings (overloaded)`}
              </Text>
            </View>
          </View>

          {/* Situation summary */}
          <View style={op.situationBox}>
            <View style={op.situationRow}>
              <View style={[op.situationDot, { backgroundColor: riskColor }]} />
              <Text style={op.situationText}>
                <Text style={{ color: C.white, fontWeight: '700' }}>{item.title}</Text>
                {'  '}
                <Text style={[op.situationBadge, { color: riskColor }]}>{item.risk.toUpperCase()}</Text>
              </Text>
            </View>
            {conflictEvents.map(ev => (
              <View key={ev.id} style={op.situationRow}>
                <View style={[op.situationDot, { backgroundColor: C.textTer }]} />
                <Text style={op.situationText}>
                  <Text style={{ color: C.textSec }}>{ev.title}</Text>
                  {'  '}
                  <Text style={{ color: C.textTer }}>{fmtTime(ev.startTime)}–{fmtTime(ev.endTime)}</Text>
                </Text>
              </View>
            ))}
          </View>

          {/* Question */}
          <Text style={op.resolutionQuestion}>What should Buddy do?</Text>

          {/* Action buttons — one per conflicting event */}
          {hasConflict && onCancelConflict && conflictEvents.map(ev => (
            <TouchableOpacity
              key={ev.id}
              style={op.cancelReplaceBtn}
              onPress={() => onCancelConflict(ev.id, ev.title)}
              activeOpacity={0.8}
            >
              <Text style={op.cancelReplaceBtnText}>
                Cancel "{ev.title}" → Add {item.title}
              </Text>
              <Text style={op.cancelReplaceBtnSub}>Removes conflict · notifies attendees</Text>
            </TouchableOpacity>
          ))}

          {/* Keep both — subtle option */}
          <View style={op.keepBothRow}>
            <Text style={op.keepBothText}>
              Or use the button below to keep all meetings and add task anyway
            </Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const op = StyleSheet.create({
  card:           { backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4 },
  emoji:          { fontSize: 24, width: 32, textAlign: 'center' },
  title:          { color: C.white, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  meta:           { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  riskPill:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  riskText:       { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  days:           { color: C.textSec, fontSize: 12, fontWeight: '600' },
  amount:         { color: C.textSec, fontSize: 12 },
  notes:          { color: C.textTer, fontSize: 11, marginTop: 3 },
  newBadge:       { backgroundColor: `${C.chartreuse}20`, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: `${C.chartreuse}40` },
  newText:        { color: C.chartreuse, fontSize: 9, fontWeight: '800' },
  // ── Buddy resolution card ──────────────────────────────────────────────────
  resolutionCard:     { borderWidth: 1, borderTopWidth: 0, borderColor: C.orange, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 14, backgroundColor: `${C.orange}0D` },
  resolutionHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  resolutionIcon:     { fontSize: 18, marginTop: 1 },
  resolutionTitle:    { color: C.orange, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  resolutionSub:      { color: `${C.orange}BB`, fontSize: 11, lineHeight: 15 },
  situationBox:       { backgroundColor: `${C.white}07`, borderRadius: 10, padding: 10, marginBottom: 12, gap: 6 },
  situationRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  situationDot:       { width: 7, height: 7, borderRadius: 4 },
  situationText:      { color: C.textSec, fontSize: 12, flex: 1 },
  situationBadge:     { fontSize: 10, fontWeight: '800' },
  resolutionQuestion: { color: C.white, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  cancelReplaceBtn:   { backgroundColor: C.crimson, borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'center' },
  cancelReplaceBtnText: { color: C.white, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  cancelReplaceBtnSub:  { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  keepBothRow:        { borderTopWidth: 1, borderColor: `${C.white}12`, paddingTop: 10, marginTop: 2 },
  keepBothText:       { color: C.textTer, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});

// ── Calendar event card (for query results) ───────────────────────────────────
function CalendarEventCard({ event }: { event: CalendarEvent }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, marginBottom: 8 }}>
      <View style={ce.card}>
        <View style={ce.timeCol}>
          {event.isAllDay ? (
            <Text style={ce.allDay}>ALL DAY</Text>
          ) : (
            <>
              <Text style={ce.time}>{fmtTime(event.startTime)}</Text>
              <Text style={ce.timeSep}>–</Text>
              <Text style={ce.time}>{fmtTime(event.endTime)}</Text>
            </>
          )}
        </View>
        <View style={ce.divider} />
        <View style={{ flex: 1 }}>
          <Text style={ce.title}>{event.title}</Text>
          {!!event.location  && <Text style={ce.sub}>📍 {event.location}</Text>}
          {!!event.meetLink  && <Text style={ce.sub}>📹 Google Meet</Text>}
          {event.attendees.length > 0 && (
            <Text style={ce.sub}>👥 {event.attendees.slice(0, 2).join(', ')}{event.attendees.length > 2 ? ` +${event.attendees.length - 2}` : ''}</Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const ce = StyleSheet.create({
  card:    { backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.verdigris },
  timeCol: { alignItems: 'center', minWidth: 64 },
  time:    { color: C.textSec, fontSize: 11, fontWeight: '600' },
  timeSep: { color: C.textTer, fontSize: 10 },
  allDay:  { color: C.verdigris, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: 2 },
  title:   { color: C.white, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  sub:     { color: C.textTer, fontSize: 11, marginTop: 1 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BrainDumpScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };
  const addObligations = useAppStore(s => s.addObligations);

  const [voiceState, setVoiceState]         = useState<VoiceState>('idle');
  const [voiceMode, setVoiceMode]           = useState<VoiceMode>('task_creation');
  const [transcript, setTranscript]         = useState('');
  const [parsed, setParsed]                 = useState<ParsedObligation[]>([]);
  const [conflicts, setConflicts]             = useState<Record<string, CalendarEvent[]>>({});
  const [overloadWarnings, setOverloadWarnings] = useState<Record<string, OverloadInfo>>({});
  const [calendarEvents, setCalendarEvents]   = useState<CalendarEvent[]>([]);
  const [calendarQueryLabel, setCalendarQueryLabel] = useState('');
  const [savedCount, setSavedCount]         = useState(0);
  const [tipIndex, setTipIndex]             = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // ── Cancel a conflicting calendar event ────────────────────────────────────
  const handleCancelConflict = async (eventId: string, title: string) => {
    Alert.alert(
      'Cancel Meeting?',
      `Cancel "${title}" and notify all attendees?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel & Notify',
          style: 'destructive',
          onPress: async () => {
            const result = await cancelCalendarEvent(eventId);
            if (result.ok) {
              Alert.alert('Done', `"${title}" has been cancelled. Attendees will be notified by Google.`);
              // Remove from conflicts map so the banner disappears
              setConflicts(prev => {
                const next = { ...prev };
                for (const key of Object.keys(next)) {
                  next[key] = next[key].filter(ev => ev.id !== eventId);
                  if (next[key].length === 0) delete next[key];
                }
                return next;
              });
            } else {
              Alert.alert('Error', result.error ?? 'Could not cancel the event. Please try again.');
            }
          },
        },
      ],
    );
  };

  const RECORDING_TIPS = [
    'Mention bills, renewals, appointments, fees...',
    'Include amounts if you know them',
    'Say when things are due — "next week", "end of month"',
    'List as many as you want, no need to pause',
  ];

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  // Rotate tips while recording
  useEffect(() => {
    if (voiceState !== 'recording') return;
    const t = setInterval(() => setTipIndex(i => (i + 1) % RECORDING_TIPS.length), 2500);
    return () => clearInterval(t);
  }, [voiceState]);

  // Pulse animation for mic button
  useEffect(() => {
    if (voiceState === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [voiceState]);

  // ── Step 1: Handle voice ────────────────────────────────────────────────────
  const handleMicPress = () => {
    if (voiceState === 'recording') {
      VoiceService.stop(
        (text) => {
          setTranscript(text);
          parseWithClaude(text);
        },
        (state) => {
          if (state === 'idle') setVoiceState('transcribing');
        }
      );
    } else if (voiceState === 'idle') {
      setParsed([]);
      setTranscript('');
      VoiceService.start(
        (text) => {
          setTranscript(text);
          parseWithClaude(text);
        },
        (state) => {
          setVoiceState(state === 'recording' ? 'recording' : voiceState);
        }
      );
      setVoiceState('recording');
    }
  };

  // ── Step 2: Send transcript to Claude ──────────────────────────────────────
  const parseWithClaude = async (text: string) => {
    if (!text.trim()) { setVoiceState('error'); return; }
    setVoiceState('parsing');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: buildBrainDumpSystem(), // uses today's date
          messages: [{ role: 'user', content: text }],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'API error');

      const raw   = data.content?.[0]?.text ?? '{}';
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed_json = JSON.parse(clean);

      // Support both new {intent, items} format and legacy plain array
      const response: ParsedResponse = Array.isArray(parsed_json)
        ? { intent: 'tasks', items: parsed_json }
        : parsed_json;

      // ── Calendar query mode ─────────────────────────────────────────────────
      if (response.intent === 'calendar_query') {
        setVoiceMode('calendar_query');
        setCalendarQueryLabel(response.label);
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
      const items: ParsedObligation[] = response.items;
      if (!Array.isArray(items)) throw new Error('Invalid response');

      // Give each a unique _id using timestamp
      const stamped = items.map((item, i) => ({
        ...item,
        _id: `dump_${i}_${Date.now()}`,
      }));

      // ── Conflict check: for items with a specific scheduledTime ─────────────
      const conflictsMap: Record<string, CalendarEvent[]> = {};
      console.log('[BrainDump] stamped items:', stamped.map(i => ({ id: i._id, title: i.title, scheduledTime: i.scheduledTime })));
      await Promise.all(
        stamped.map(async (item) => {
          if (!item.scheduledTime) {
            console.log('[BrainDump] SKIP conflict check — no scheduledTime for:', item.title);
            return;
          }
          try {
            const start = new Date(item.scheduledTime);
            if (isNaN(start.getTime())) { console.log('[BrainDump] SKIP — invalid date for:', item.title, item.scheduledTime); return; }
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            console.log('[BrainDump] Checking conflicts for:', item.title, 'at', start.toISOString());
            const clashing = await checkTimeConflicts(start, end);
            console.log('[BrainDump] Clashing events for', item.title, ':', clashing);
            if (clashing.length > 0) conflictsMap[item._id] = clashing;
          } catch (e) { console.log('[BrainDump] Conflict check error:', e); }
        })
      );
      console.log('[BrainDump] conflictsMap:', conflictsMap);
      setConflicts(conflictsMap);

      // ── Overload check: detect days with too many meetings ──────────────────
      const overloadMap: Record<string, OverloadInfo> = {};
      await Promise.all(
        stamped.map(async (item) => {
          if (!item.scheduledTime) return;
          try {
            const date = new Date(item.scheduledTime);
            if (isNaN(date.getTime())) return;
            const result = await detectDayOverload(date);
            console.log('[BrainDump] Overload check for', item.title, ':', result);
            if (result.isOverloaded) overloadMap[item._id] = { count: result.count, events: result.events };
          } catch (e) { console.log('[BrainDump] Overload check error:', e); }
        })
      );
      console.log('[BrainDump] overloadMap:', overloadMap);
      setOverloadWarnings(overloadMap);

      setParsed(stamped);
      setVoiceState('done');

      // Announce result (mention conflicts + overload if any)
      const conflictCount = Object.keys(conflictsMap).length;
      const overloadCount = Object.keys(overloadMap).length;
      if (stamped.length > 0) {
        let msg = `Got it. I found ${stamped.length} ${stamped.length === 1 ? 'item' : 'items'}.`;
        if (conflictCount > 0) msg += ` Warning — ${conflictCount} ${conflictCount === 1 ? 'has a' : 'have'} calendar conflict.`;
        if (overloadCount > 0) msg += ` Also, ${overloadCount} ${overloadCount === 1 ? 'day is' : 'days are'} already overloaded with meetings.`;
        if (conflictCount === 0 && overloadCount === 0) msg = `Got it. I found ${stamped.length} ${stamped.length === 1 ? 'item' : 'items'} to add.`;
        Speech.speak(msg, { language: 'en-US', rate: 0.95 });
      }

    } catch (err) {
      console.error('Brain dump parse error:', err);
      setVoiceState('error');
    }
  };

  // ── Step 3: Save to store ───────────────────────────────────────────────────
  const handleSaveAll = () => {
    if (parsed.length === 0) return;
    addObligations(parsed);
    setSavedCount(parsed.length);
    setParsed([]);
    setTranscript('');
    setVoiceState('idle');

    Speech.speak(`${parsed.length} ${parsed.length === 1 ? 'task has' : 'tasks have'} been added to your obligations.`, {
      language: 'en-US', rate: 0.95,
    });
  };

  const handleDiscard = () => {
    setParsed([]);
    setConflicts({});
    setOverloadWarnings({});
    setCalendarEvents([]);
    setCalendarQueryLabel('');
    setTranscript('');
    setVoiceState('idle');
    setVoiceMode('task_creation');
    setSavedCount(0);
  };

  // ── Status label ────────────────────────────────────────────────────────────
  const statusLabel = () => {
    switch (voiceState) {
      case 'idle':          return savedCount > 0 ? `✓ ${savedCount} tasks added to Obligations` : 'Tap the mic and speak freely';
      case 'recording':     return RECORDING_TIPS[tipIndex];
      case 'transcribing':  return 'Processing your voice...';
      case 'parsing':       return 'Buddy is structuring your tasks...';
      case 'done':          return voiceMode === 'calendar_query'
        ? `Found ${calendarEvents.length} ${calendarEvents.length === 1 ? 'meeting' : 'meetings'} — see below`
        : `Found ${parsed.length} ${parsed.length === 1 ? 'task' : 'tasks'} — review below`;
      case 'error':         return 'Could not process. Try again.';
    }
  };

  const statusColor = () => {
    switch (voiceState) {
      case 'recording':    return C.salmon;
      case 'done':         return C.chartreuse;
      case 'error':        return C.crimson;
      default:             return C.textSec;
    }
  };

  const isProcessing = voiceState === 'transcribing' || voiceState === 'parsing';

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView edges={['top']}>
        <Animated.View style={[s.header, { opacity: fadeAnim }]}>
          <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.screenLabel}>BUDDY</Text>
            <Text style={s.screenTitle}>Voice Brain Dump</Text>
          </View>
          {/* Go to obligations */}
          <TouchableOpacity
            style={s.obligationsBtn}
            onPress={() => nav.navigate('obligations')}
          >
            <Text style={s.obligationsBtnText}>View Tasks →</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero instruction */}
        {voiceState === 'idle' && parsed.length === 0 && (
          <Animated.View style={[s.hero, { opacity: fadeAnim }]}>
            <Text style={s.heroEmoji}>🧠</Text>
            <Text style={s.heroTitle}>Dump everything on your mind</Text>
            <Text style={s.heroSub}>
              Speak freely — bills, renewals, appointments, fees.{'\n'}
              Buddy will structure them into your task list automatically.
            </Text>

            <View style={s.exampleBlock}>
              <Text style={s.exampleLabel}>EXAMPLE</Text>
              <Text style={s.exampleText}>
                "I have a hospital bill of AED 800 due next week, my car service is overdue, school fees of 12,000 are due end of the month, and I need to renew my Emirates ID..."
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Transcript display */}
        {transcript.length > 0 && (
          <View style={s.transcriptBlock}>
            <Text style={s.transcriptLabel}>YOU SAID</Text>
            <Text style={s.transcriptText}>"{transcript}"</Text>
          </View>
        )}

        {/* Parsed results — task creation mode */}
        {voiceMode === 'task_creation' && parsed.length > 0 && (
          <View style={s.resultsBlock}>
            <Text style={s.resultsLabel}>
              BUDDY FOUND {parsed.length} {parsed.length === 1 ? 'TASK' : 'TASKS'}
              {Object.keys(conflicts).length > 0 && ` · ⚠️ ${Object.keys(conflicts).length} CONFLICT`}
              {Object.keys(overloadWarnings).length > 0 && ` · 🔴 OVERLOAD`}
            </Text>
            {parsed.map(item => (
              <ObligationPreview
                key={item._id}
                item={item}
                conflictEvents={conflicts[item._id] ?? []}
                overload={overloadWarnings[item._id] ?? null}
                onCancelConflict={handleCancelConflict}
              />
            ))}

            {/* Conflict summary banner */}
            {Object.keys(conflicts).length > 0 && (
              <View style={s.conflictSummary}>
                <Text style={s.conflictSummaryText}>
                  ⚠️ {Object.keys(conflicts).length} {Object.keys(conflicts).length === 1 ? 'task has' : 'tasks have'} a calendar conflict — review before saving
                </Text>
              </View>
            )}

            {/* Overload summary banner */}
            {Object.keys(overloadWarnings).length > 0 && (
              <View style={s.overloadSummary}>
                <Text style={s.overloadSummaryText}>
                  🔴 Day overload detected — {Object.values(overloadWarnings)[0]?.count} meetings already scheduled. Adding more may impact your capacity.
                </Text>
              </View>
            )}

            {/* Save / Discard actions */}
            <TouchableOpacity style={s.saveBtn} onPress={handleSaveAll}>
              <Text style={s.saveBtnText}>Add {parsed.length} {parsed.length === 1 ? 'task' : 'tasks'} to Automations</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.discardBtn} onPress={handleDiscard}>
              <Text style={s.discardBtnText}>Discard & try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Calendar query results */}
        {voiceMode === 'calendar_query' && voiceState === 'done' && (
          <View style={s.resultsBlock}>
            <Text style={s.resultsLabel}>
              {calendarEvents.length === 0
                ? `NO MEETINGS · ${calendarQueryLabel.toUpperCase()}`
                : `${calendarEvents.length} ${calendarEvents.length === 1 ? 'MEETING' : 'MEETINGS'} · ${calendarQueryLabel.toUpperCase()}`}
            </Text>
            {calendarEvents.length === 0 ? (
              <View style={s.noEventsBlock}>
                <Text style={s.noEventsEmoji}>📅</Text>
                <Text style={s.noEventsText}>No meetings found for {calendarQueryLabel}</Text>
              </View>
            ) : (
              calendarEvents.map(ev => <CalendarEventCard key={ev.id} event={ev} />)
            )}
            <TouchableOpacity style={s.discardBtn} onPress={handleDiscard}>
              <Text style={s.discardBtnText}>Ask another question</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Saved confirmation */}
        {savedCount > 0 && voiceState === 'idle' && parsed.length === 0 && (
          <View style={s.savedBlock}>
            <Text style={s.savedIcon}>✓</Text>
            <Text style={s.savedText}>{savedCount} tasks added to Obligations</Text>
            <TouchableOpacity onPress={() => nav.navigate('obligations')} style={s.viewBtn}>
              <Text style={s.viewBtnText}>View in Obligations →</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom mic area */}
      <View style={s.micArea}>
        {/* Status text */}
        <Text style={[s.statusText, { color: statusColor() }]} numberOfLines={2}>
          {statusLabel()}
        </Text>

        {/* Waveform — visible while recording */}
        <View style={s.waveformWrap}>
          <Waveform active={voiceState === 'recording'} />
        </View>

        {/* Mic button */}
        {!isProcessing && voiceState !== 'done' && (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[
                s.micBtn,
                voiceState === 'recording' && { backgroundColor: C.salmon, borderColor: C.salmon },
              ]}
              onPress={handleMicPress}
              activeOpacity={0.85}
            >
              <Text style={s.micIcon}>
                {voiceState === 'recording' ? '⏹' : '🎙️'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Processing spinner */}
        {isProcessing && (
          <View style={s.processingBlock}>
            <ActivityIndicator color={C.verdigris} size="large" />
            <Text style={s.processingText}>
              {voiceState === 'transcribing' ? 'Transcribing...' : 'Buddy is parsing...'}
            </Text>
          </View>
        )}

        {/* Tap mic again hint after done */}
        {voiceState === 'done' && (
          <TouchableOpacity style={s.dumpAgainBtn} onPress={handleDiscard}>
            <Text style={s.dumpAgainText}>Dump more tasks</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: C.bg },
  scroll:     { paddingHorizontal: 20, paddingTop: 8 },

  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backBtn:    { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  backBtnText:{ color: C.verdigris, fontSize: 18, fontWeight: '600' },
  screenLabel:{ color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  screenTitle:{ color: C.white, fontSize: 20, fontWeight: '700' },
  obligationsBtn:     { backgroundColor: `${C.verdigris}15`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: `${C.verdigris}30` },
  obligationsBtnText: { color: C.verdigris, fontSize: 11, fontWeight: '700' },

  hero:       { alignItems: 'center', paddingVertical: 24 },
  heroEmoji:  { fontSize: 56, marginBottom: 16 },
  heroTitle:  { color: C.white, fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  heroSub:    { color: C.textSec, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },

  exampleBlock: { backgroundColor: C.surface, borderRadius: 16, padding: 16, width: '100%', borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.verdigris },
  exampleLabel: { color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  exampleText:  { color: C.textSec, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },

  transcriptBlock: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  transcriptLabel: { color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  transcriptText:  { color: C.textSec, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },

  resultsLabel: { color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  resultsBlock: { marginBottom: 16 },

  conflictSummary:     { backgroundColor: `${C.crimson}18`, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: `${C.crimson}50` },
  conflictSummaryText: { color: C.crimson, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  overloadSummary:     { backgroundColor: `${C.salmon}18`, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: `${C.salmon}50` },
  overloadSummaryText: { color: C.salmon, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  saveBtn:      { backgroundColor: C.chartreuse, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  saveBtnText:  { color: C.bg, fontSize: 15, fontWeight: '700' },
  discardBtn:   { alignItems: 'center', paddingVertical: 10 },
  discardBtnText: { color: C.textTer, fontSize: 14 },

  noEventsBlock: { backgroundColor: C.surface, borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 10, gap: 8 },
  noEventsEmoji: { fontSize: 32 },
  noEventsText:  { color: C.textSec, fontSize: 14, textAlign: 'center' },

  savedBlock: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  savedIcon:  { fontSize: 40, color: C.verdigris },
  savedText:  { color: C.white, fontSize: 17, fontWeight: '700' },
  viewBtn:    { backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
  viewBtnText:{ color: C.verdigris, fontSize: 14, fontWeight: '600' },

  micArea:      { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, paddingTop: 12, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center', gap: 8 },
  statusText:   { fontSize: 13, textAlign: 'center', fontWeight: '500', minHeight: 36 },
  waveformWrap: { height: 60, width: '100%', justifyContent: 'center' },

  micBtn:       { width: 72, height: 72, borderRadius: 36, backgroundColor: `${C.salmon}18`, borderWidth: 2, borderColor: `${C.salmon}50`, alignItems: 'center', justifyContent: 'center' },
  micIcon:      { fontSize: 30 },

  processingBlock: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  processingText:  { color: C.textSec, fontSize: 13 },

  dumpAgainBtn:  { backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
  dumpAgainText: { color: C.textSec, fontSize: 14, fontWeight: '600' },
});