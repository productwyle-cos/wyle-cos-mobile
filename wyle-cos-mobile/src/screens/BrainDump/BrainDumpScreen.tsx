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
import { checkTimeConflicts, CalendarEvent, fmtTime, fmtDate } from '../../services/calendarService';
import type { NavProp } from '../../../app/index';

const C = {
  bg:         '#002F3A',
  surface:    '#0A3D4A',
  surfaceEl:  '#0F4A5A',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  salmon:     '#FF9F8A',
  crimson:    '#D7263D',
  white:      '#FEFFFE',
  textSec:    '#8FB8BF',
  textTer:    '#4A7A85',
  border:     '#1A5060',
};

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

type VoiceState = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'done' | 'error';
type Risk = 'high' | 'medium' | 'low';

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
// Injected at call time so the date is always current
function buildBrainDumpSystem(): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const year = now.getFullYear();

  return `You are Buddy, the AI chief of staff inside Wyle — a life management app for busy professionals in Dubai, UAE.

The user has just done a voice brain dump — they spoke freely about everything on their mind that needs to be handled.

TODAY'S DATE: ${todayStr}
Use this date to calculate accurate daysUntil values. For example if today is March 19, 2026 and the user says "March 21st", daysUntil = 2.

Your job: Extract ALL obligations, tasks, payments, renewals, deadlines, or to-dos from what they said. Return them as a JSON array and NOTHING else — no explanation, no markdown, no preamble.

Each obligation must have:
- _id: unique string (use timestamp + index like "dump_1_1234567890")
- emoji: relevant emoji for the type
- title: short clear title (max 5 words)
- type: one of: visa, emirates_id, car_registration, insurance, bill, school_fee, medical, appointment, payment, task, other
- daysUntil: number of days from TODAY until due. Calculate precisely using today's date above. "next week" = 7, "end of month" = days remaining in month, "soon" = 14, "tomorrow" = 1, "today" = 0. For a specific date like "March 21st" calculate exactly.
- risk: "high" if due < 7 days or urgent, "medium" if 7-30 days, "low" if > 30 days
- amount: AED amount as number if mentioned, otherwise null
- status: always "active"
- executionPath: brief instruction on how to handle (1 short sentence)
- notes: any extra detail mentioned, or null
- scheduledTime: if the user mentions a SPECIFIC TIME for this task (e.g. "9:30 AM", "2 PM", "at noon"), return the full ISO 8601 datetime string combining the date and time (e.g. "${year}-03-21T09:30:00"). Use the year ${year}. If no specific time is mentioned, return null.

Example output for "I need to pay my DEWA bill, it's about 500 dirhams, and also my hospital appointment is on March 21st at 9:30 AM":
[
  {
    "_id": "dump_1_1234567890",
    "emoji": "💡",
    "title": "DEWA Bill Payment",
    "type": "bill",
    "daysUntil": 7,
    "risk": "medium",
    "amount": 500,
    "status": "active",
    "executionPath": "Pay via DEWA app or website",
    "notes": null,
    "scheduledTime": null
  },
  {
    "_id": "dump_2_1234567890",
    "emoji": "🏥",
    "title": "Hospital Appointment",
    "type": "appointment",
    "daysUntil": 2,
    "risk": "high",
    "amount": null,
    "status": "active",
    "executionPath": "Attend hospital appointment on time",
    "notes": "March 21st at 9:30 AM",
    "scheduledTime": "${year}-03-21T09:30:00"
  }
]

If nothing actionable is mentioned, return an empty array: []
Return ONLY the JSON array. No other text.`;
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
function ObligationPreview({ item, conflictEvents = [] }: { item: ParsedObligation; conflictEvents?: CalendarEvent[] }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 100, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const hasConflict = conflictEvents.length > 0;
  const riskColor   = hasConflict ? C.crimson : item.risk === 'high' ? C.crimson : item.risk === 'medium' ? C.chartreuse : C.verdigris;

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

      {/* ⚠️ Conflict warning banner */}
      {hasConflict && (
        <View style={op.conflictBanner}>
          <Text style={op.conflictIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={op.conflictTitle}>Calendar Conflict Detected</Text>
            {conflictEvents.map(ev => (
              <Text key={ev.id} style={op.conflictDetail}>
                "{ev.title}" is already scheduled at {fmtTime(ev.startTime)}–{fmtTime(ev.endTime)} on {fmtDate(ev.startTime)}
              </Text>
            ))}
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
  // Conflict banner — attached below the card
  conflictBanner: { backgroundColor: `${C.crimson}18`, borderWidth: 1, borderTopWidth: 0, borderColor: C.crimson, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  conflictIcon:   { fontSize: 14, marginTop: 1 },
  conflictTitle:  { color: C.crimson, fontSize: 11, fontWeight: '700', marginBottom: 3 },
  conflictDetail: { color: `${C.crimson}CC`, fontSize: 11, lineHeight: 16 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BrainDumpScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };
  const addObligations = useAppStore(s => s.addObligations);

  const [voiceState, setVoiceState]     = useState<VoiceState>('idle');
  const [transcript, setTranscript]     = useState('');
  const [parsed, setParsed]             = useState<ParsedObligation[]>([]);
  const [conflicts, setConflicts]       = useState<Record<string, CalendarEvent[]>>({});
  const [savedCount, setSavedCount]     = useState(0);
  const [tipIndex, setTipIndex]         = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

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

      const raw   = data.content?.[0]?.text ?? '[]';
      const clean = raw.replace(/```json|```/g, '').trim();
      const items: ParsedObligation[] = JSON.parse(clean);

      if (!Array.isArray(items)) throw new Error('Invalid response');

      // Give each a unique _id using timestamp
      const stamped = items.map((item, i) => ({
        ...item,
        _id: `dump_${i}_${Date.now()}`,
      }));

      // ── Conflict check: for items with a specific scheduledTime ─────────────
      const conflictsMap: Record<string, CalendarEvent[]> = {};
      await Promise.all(
        stamped.map(async (item) => {
          if (!item.scheduledTime) return;
          try {
            const start = new Date(item.scheduledTime);
            // Default slot = 1 hour; skip if invalid date
            if (isNaN(start.getTime())) return;
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            const clashing = await checkTimeConflicts(start, end);
            if (clashing.length > 0) conflictsMap[item._id] = clashing;
          } catch { /* silently skip if calendar not connected */ }
        })
      );
      setConflicts(conflictsMap);

      setParsed(stamped);
      setVoiceState('done');

      // Announce result (mention conflicts if any)
      const conflictCount = Object.keys(conflictsMap).length;
      if (stamped.length > 0) {
        const msg = conflictCount > 0
          ? `Got it. I found ${stamped.length} ${stamped.length === 1 ? 'item' : 'items'}. Warning — ${conflictCount} ${conflictCount === 1 ? 'has a' : 'have'} calendar conflict.`
          : `Got it. I found ${stamped.length} ${stamped.length === 1 ? 'item' : 'items'} to add.`;
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
    setTranscript('');
    setVoiceState('idle');
    setSavedCount(0);
  };

  // ── Status label ────────────────────────────────────────────────────────────
  const statusLabel = () => {
    switch (voiceState) {
      case 'idle':          return savedCount > 0 ? `✓ ${savedCount} tasks added to Obligations` : 'Tap the mic and speak freely';
      case 'recording':     return RECORDING_TIPS[tipIndex];
      case 'transcribing':  return 'Processing your voice...';
      case 'parsing':       return 'Buddy is structuring your tasks...';
      case 'done':          return `Found ${parsed.length} ${parsed.length === 1 ? 'task' : 'tasks'} — review below`;
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

        {/* Parsed results */}
        {parsed.length > 0 && (
          <View style={s.resultsBlock}>
            <Text style={s.resultsLabel}>
              BUDDY FOUND {parsed.length} {parsed.length === 1 ? 'TASK' : 'TASKS'}
            </Text>
            {parsed.map(item => (
              <ObligationPreview
                key={item._id}
                item={item}
                conflictEvents={conflicts[item._id] ?? []}
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

            {/* Save / Discard actions */}
            <TouchableOpacity style={s.saveBtn} onPress={handleSaveAll}>
              <Text style={s.saveBtnText}>Add {parsed.length} {parsed.length === 1 ? 'task' : 'tasks'} to Automations</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.discardBtn} onPress={handleDiscard}>
              <Text style={s.discardBtnText}>Discard & try again</Text>
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
  saveBtn:      { backgroundColor: C.chartreuse, borderRadius: 999, paddingVertical: 15, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  saveBtnText:  { color: C.bg, fontSize: 15, fontWeight: '700' },
  discardBtn:   { alignItems: 'center', paddingVertical: 10 },
  discardBtnText: { color: C.textTer, fontSize: 14 },

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