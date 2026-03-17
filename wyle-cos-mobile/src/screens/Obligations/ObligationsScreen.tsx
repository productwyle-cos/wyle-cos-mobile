// src/screens/Obligations/ObligationsScreen.tsx
// Automations screen — dark palette, no back button, 5-tab footer
// All functionality retained: filter · cards · detail modal · add modal · brain dump voice

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Modal, TextInput, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { VoiceService } from '../../services/voiceService';
import { UIObligation } from '../../types';

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

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

const BRAIN_DUMP_SYSTEM = `You are Buddy inside Wyle — a life management app for busy professionals in Dubai, UAE.
The user has done a voice brain dump. Extract ALL obligations, tasks, payments, renewals, deadlines from what they said.
Return ONLY a JSON array, no explanation, no markdown, no preamble.

Each item must have:
- _id: unique string like "dump_0_1234567890"
- emoji: relevant emoji
- title: short title (max 5 words)
- type: one of: visa, emirates_id, car_registration, insurance, bill, school_fee, medical, appointment, payment, task, other
- daysUntil: number ("next week"=7, "end of month"=estimate, "tomorrow"=1, "today"=0, "soon"=14)
- risk: "high" if <7 days, "medium" if 7-30 days, "low" if >30 days
- amount: AED number if mentioned, else null
- status: "active"
- executionPath: one short sentence on how to handle it
- notes: extra detail mentioned, or null

Return ONLY the JSON array. Example: [{"_id":"dump_0_123","emoji":"💡","title":"DEWA Bill","type":"bill","daysUntil":7,"risk":"medium","amount":500,"status":"active","executionPath":"Pay via DEWA app","notes":null}]
If nothing actionable, return: []`;

function getDaysLabel(days: number): string {
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
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
function ObligationCard({ item, onPress, onResolve }: any) {
  const riskColor = RISK_COLORS[item.risk as Risk];
  const scaleAnim = useRef(new Animated.Value(1)).current;
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
              <Text style={[styles.riskPillText, { color: riskColor }]}>{item.risk.toUpperCase()}</Text>
            </View>
            <Text style={[styles.daysText, { color: riskColor }]}>{getDaysLabel(item.daysUntil)}</Text>
            {item.amount && <Text style={styles.amount}>AED {item.amount.toLocaleString()}</Text>}
          </View>
        </View>
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
function DetailModal({ item, visible, onClose, onResolve }: any) {
  if (!item) return null;
  const riskColor = RISK_COLORS[item.risk as Risk];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modal.overlay}>
        <TouchableOpacity style={modal.backdrop} onPress={onClose} />
        <View style={modal.sheet}>
          <View style={modal.handle} />
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
          </View>
          {item.executionPath && (
            <View style={modal.executionBlock}>
              <Text style={modal.executionLabel}>HOW TO RESOLVE</Text>
              <Text style={modal.executionText}>{item.executionPath}</Text>
            </View>
          )}
          <View style={modal.actions}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Brain Dump Modal (all logic unchanged, dark theme applied)
// ─────────────────────────────────────────────────────────────────────────────
function BrainDumpModal({ visible, onClose, onSave, existingObligations, onResolve }: {
  visible: boolean;
  onClose: () => void;
  onSave: (items: UIObligation[]) => void;
  existingObligations: UIObligation[];
  onResolve: (id: string) => void;
}) {
  const [voiceState, setVoiceState]         = useState<VoiceState>('idle');
  const [transcript, setTranscript]         = useState('');
  const [parsed, setParsed]                 = useState<UIObligation[]>([]);
  const [showReview, setShowReview]         = useState(false);
  const [freshItems, setFreshItems]         = useState<UIObligation[]>([]);
  const [dupeItems, setDupeItems]           = useState<{ incoming: UIObligation; existing: UIObligation }[]>([]);
  const [completionTarget, setCompletionTarget] = useState<UIObligation | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setVoiceState('idle'); setTranscript(''); setParsed([]);
      setShowReview(false); setFreshItems([]); setDupeItems([]); setCompletionTarget(null);
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

  const parseWithClaude = async (text: string) => {
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
          system: BRAIN_DUMP_SYSTEM,
          messages: [{ role: 'user', content: text }],
        }),
      });
      const data = await res.json();
      const raw   = data.content?.[0]?.text ?? '[]';
      const clean = raw.replace(/```json|```/g, '').trim();
      const items: UIObligation[] = JSON.parse(clean);
      const stamped = items.map((item, i) => ({ ...item, _id: `dump_${i}_${Date.now()}` }));
      setParsed(stamped);
      setVoiceState('done');
      if (stamped.length > 0) {
        Speech.speak(`Found ${stamped.length} ${stamped.length === 1 ? 'task' : 'tasks'}.`, { language: 'en-US', rate: 0.95 });
      }
    } catch {
      setVoiceState('error');
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
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              <Text style={bd.resultsLabel}>BUDDY FOUND {parsed.length} {parsed.length === 1 ? 'TASK' : 'TASKS'}</Text>
              {parsed.map(item => {
                const rc = RISK_COLORS[item.risk as Risk];
                return (
                  <View key={item._id} style={[bd.parsedCard, { borderLeftColor: rc }]}>
                    <Text style={bd.parsedEmoji}>{item.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={bd.parsedTitle}>{item.title}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                        <Text style={[bd.parsedRisk, { color: rc }]}>{item.risk.toUpperCase()}</Text>
                        <Text style={bd.parsedDays}>{getDaysLabel(item.daysUntil)}</Text>
                        {item.amount && <Text style={bd.parsedAmount}>AED {item.amount.toLocaleString()}</Text>}
                      </View>
                    </View>
                    <View style={bd.newBadge}><Text style={bd.newText}>NEW</Text></View>
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
             voiceState === 'done'         ? (completionTarget ? '✓ Found matching task — confirm below' : `✓ ${parsed.length} tasks found — save them below`) :
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

          {!showReview && voiceState === 'done' && parsed.length === 0 && (
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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUp  = useRef(new Animated.Value(16)).current;

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
            />
          </Animated.View>
        ))}

        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✓</Text>
            <Text style={styles.emptyText}>
              {filter === 'all' ? 'No active obligations' : `No ${filter} risk items`}
            </Text>
            <Text style={styles.emptySub}>Tap 🎙️ to add tasks by voice</Text>
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
      />
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

  // Empty
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
  dupeCard:       { backgroundColor: C.surfaceEl, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 6 },
  dupeRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dupeLabelPill:  { backgroundColor: `${C.verdigris}18`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  dupeLabelText:  { color: C.verdigris, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  dupeName:       { flex: 1, color: C.white, fontSize: 12, fontWeight: '600' },
});

