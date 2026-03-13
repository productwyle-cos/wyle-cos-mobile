// src/screens/Obligations/ObligationsScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Modal, TextInput, KeyboardAvoidingView,
  Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { VoiceService } from '../../services/voiceService';
import { UIObligation } from '../../types';

const C = {
  bg: '#002F3A', surface: '#0A3D4A', surfaceEl: '#0F4A5A',
  verdigris: '#1B998B', chartreuse: '#D5FF3F', salmon: '#FF9F8A',
  crimson: '#D7263D', white: '#FEFFFE', textSec: '#8FB8BF',
  textTer: '#4A7A85', border: '#1A5060',
};

type Risk = 'high' | 'medium' | 'low';
type VoiceState = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'done' | 'error';

const RISK_COLORS: Record<Risk, string> = {
  high: C.crimson, medium: C.chartreuse, low: C.verdigris,
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

// ── Tab Bar ────────────────────────────────────────────────────────────────────
function TabBar({ active, onTab }: { active: string; onTab: (s: any) => void }) {
  const tabs = [
    { screen: 'home', emoji: '⌂', label: 'Home' },
    { screen: 'obligations', emoji: '📋', label: 'Tasks' },
    { screen: 'buddy', emoji: '◎', label: 'Buddy' },
    { screen: 'insights', emoji: '◈', label: 'Insights' },
  ];
  return (
    <View style={tab.bar}>
      {tabs.map(t => (
        <TouchableOpacity key={t.screen} style={tab.item} onPress={() => onTab(t.screen)}>
          <Text style={[tab.emoji, active === t.screen && { opacity: 1 }]}>{t.emoji}</Text>
          <Text style={[tab.label, active === t.screen && { color: C.verdigris }]}>{t.label}</Text>
          {active === t.screen && <View style={tab.dot} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}
const tab = StyleSheet.create({
  bar:   { flexDirection: 'row', backgroundColor: '#061F28', borderTopWidth: 1, borderColor: C.border, paddingBottom: 20, paddingTop: 10 },
  item:  { flex: 1, alignItems: 'center', gap: 3 },
  emoji: { fontSize: 20, opacity: 0.5 },
  label: { fontSize: 10, color: C.textTer, fontWeight: '500' },
  dot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: C.verdigris, marginTop: 2 },
});

// ── Obligation Card ────────────────────────────────────────────────────────────
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
      <TouchableOpacity style={[styles.card, { borderLeftColor: riskColor }]} onPress={handlePress} activeOpacity={1}>
        <View style={[styles.cardIcon, { backgroundColor: `${riskColor}15` }]}>
          <Text style={styles.cardEmoji}>{item.emoji}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.notes && <Text style={styles.cardNotes}>{item.notes}</Text>}
          <View style={styles.cardMeta}>
            <View style={[styles.riskPill, { backgroundColor: `${riskColor}20`, borderColor: `${riskColor}40` }]}>
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

// ── Detail Modal ───────────────────────────────────────────────────────────────
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
            <View style={[modal.icon, { backgroundColor: `${riskColor}20` }]}>
              <Text style={{ fontSize: 32 }}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={modal.title}>{item.title}</Text>
              <View style={[modal.riskBadge, { backgroundColor: `${riskColor}20` }]}>
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
            <TouchableOpacity style={modal.primaryBtn} onPress={() => { onResolve(item); onClose(); }}>
              <Text style={modal.primaryBtnText}>Mark as resolved</Text>
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

// ── Add Obligation Modal ───────────────────────────────────────────────────────
function AddModal({ visible, onClose, onAdd }: any) {
  const [title, setTitle]     = useState('');
  const [days, setDays]       = useState('');
  const [amount, setAmount]   = useState('');
  const [notes, setNotes]     = useState('');
  const [risk, setRisk]       = useState<Risk>('medium');
  const [selType, setSelType] = useState(TYPE_OPTIONS[0]);
  const reset = () => { setTitle(''); setDays(''); setAmount(''); setNotes(''); setRisk('medium'); setSelType(TYPE_OPTIONS[0]); };
  const handleAdd = () => {
    if (!title.trim()) return;
    onAdd({ _id: Date.now().toString(), emoji: selType.emoji, title: title.trim(), type: selType.label.toLowerCase().replace(' ', '_'), daysUntil: parseInt(days) || 30, risk, amount: amount ? parseInt(amount) : null, status: 'active', executionPath: '', notes: notes.trim() || null });
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
              <TouchableOpacity onPress={onClose}><Text style={add.closeBtn}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={add.label}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {TYPE_OPTIONS.map(t => (
                    <TouchableOpacity key={t.label} style={[add.typePill, selType.label === t.label && add.typePillActive]} onPress={() => setSelType(t)}>
                      <Text style={{ fontSize: 16 }}>{t.emoji}</Text>
                      <Text style={[add.typePillText, selType.label === t.label && { color: C.bg }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={add.label}>Title</Text>
              <TextInput style={add.input} value={title} onChangeText={setTitle} placeholder="e.g. Emirates ID Renewal" placeholderTextColor={C.textTer} />
              <Text style={add.label}>Due in (days)</Text>
              <TextInput style={add.input} value={days} onChangeText={setDays} placeholder="e.g. 30" placeholderTextColor={C.textTer} keyboardType="number-pad" />
              <Text style={add.label}>Amount (AED) — optional</Text>
              <TextInput style={add.input} value={amount} onChangeText={setAmount} placeholder="e.g. 370" placeholderTextColor={C.textTer} keyboardType="number-pad" />
              <Text style={add.label}>Risk level</Text>
              <View style={add.riskRow}>
                {(['low', 'medium', 'high'] as Risk[]).map(r => {
                  const rc = RISK_COLORS[r]; const isActive = risk === r;
                  return (
                    <TouchableOpacity key={r} style={[add.riskBtn, isActive && { backgroundColor: rc, borderColor: rc }]} onPress={() => setRisk(r)}>
                      <Text style={[add.riskBtnText, isActive && { color: r === 'medium' ? C.bg : C.white }]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={add.label}>Notes — optional</Text>
              <TextInput style={[add.input, { height: 80, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Any extra details..." placeholderTextColor={C.textTer} multiline />
              <TouchableOpacity style={[add.addBtn, !title.trim() && { opacity: 0.4 }]} onPress={handleAdd} disabled={!title.trim()}>
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

// ── Duplicate Detection Helpers ────────────────────────────────────────────────
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
    e.status === 'active' &&
    e.type === item.type &&
    isSimilarTitle(e.title, item.title)
  ) ?? null;
}

// ── Brain Dump Modal (inline — no navigation needed) ──────────────────────────
function BrainDumpModal({ visible, onClose, onSave, existingObligations }: {
  visible: boolean;
  onClose: () => void;
  onSave: (items: UIObligation[]) => void;
  existingObligations: UIObligation[];
}) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed]         = useState<UIObligation[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [freshItems, setFreshItems] = useState<UIObligation[]>([]);
  const [dupeItems, setDupeItems]   = useState<{ incoming: UIObligation; existing: UIObligation }[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Reset when modal opens
  useEffect(() => {
    if (visible) { setVoiceState('idle'); setTranscript(''); setParsed([]); setShowReview(false); setFreshItems([]); setDupeItems([]); }
  }, [visible]);

  // Pulse animation while recording
  useEffect(() => {
    if (voiceState === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      ).start();
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
        (text) => { setTranscript(text); parseWithClaude(text); },
        (state) => { if (state === 'idle') setVoiceState('transcribing'); }
      );
    } else if (voiceState === 'idle') {
      setParsed([]); setTranscript('');
      VoiceService.start(
        (text) => { setTranscript(text); parseWithClaude(text); },
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
      setFreshItems(fresh);
      setDupeItems(dupes);
      setShowReview(true);
      return;
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

  const isProcessing = voiceState === 'transcribing' || voiceState === 'parsing';

  const micBgColor     = voiceState === 'recording' ? C.salmon : `${C.salmon}18`;
  const micBorderColor = voiceState === 'recording' ? C.salmon : `${C.salmon}50`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={bd.overlay}>
        <TouchableOpacity style={bd.backdrop} onPress={onClose} />
        <View style={bd.sheet}>
          <View style={bd.handle} />

          {/* Header */}
          <View style={bd.header}>
            <View>
              <Text style={bd.title}>Voice Brain Dump</Text>
              <Text style={bd.sub}>Speak freely — Buddy structures your tasks</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={bd.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Transcript */}
          {transcript.length > 0 && (
            <View style={bd.transcriptBox}>
              <Text style={bd.transcriptLabel}>YOU SAID</Text>
              <Text style={bd.transcriptText}>"{transcript}"</Text>
            </View>
          )}

          {/* Parsed results */}
          {parsed.length > 0 && (
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

          {/* Idle hint */}
          {voiceState === 'idle' && parsed.length === 0 && (
            <View style={bd.hintBox}>
              <Text style={bd.hintText}>
                💡 Try: "Hospital bill AED 800 next week, car service overdue, school fees 12,000 end of month..."
              </Text>
            </View>
          )}

          {/* Status */}
          <Text style={[bd.statusText, {
            color: voiceState === 'recording' ? C.salmon :
                   voiceState === 'done'      ? C.chartreuse :
                   voiceState === 'error'     ? C.crimson : C.textSec
          }]}>
            {voiceState === 'idle'         ? 'Tap the mic and speak your tasks' :
             voiceState === 'recording'    ? '🔴 Listening... tap to stop' :
             voiceState === 'transcribing' ? '⏳ Processing voice...' :
             voiceState === 'parsing'      ? '🤖 Buddy is structuring tasks...' :
             voiceState === 'done'         ? `✓ ${parsed.length} tasks found — save them below` :
             voiceState === 'error'        ? 'Could not process. Try again.' : ''}
          </Text>

          {/* Mic button */}
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

          {/* Spinner */}
          {isProcessing && (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator color={C.verdigris} size="large" />
            </View>
          )}

          {/* Duplicate review step */}
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
                        <View style={[bd.dupeLabelPill, { backgroundColor: `${C.salmon}20` }]}><Text style={[bd.dupeLabelText, { color: C.salmon }]}>NEW</Text></View>
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
                <TouchableOpacity style={[bd.saveBtn, { backgroundColor: `${C.chartreuse}18`, borderWidth: 1, borderColor: `${C.chartreuse}40` }]} onPress={handleAddAll}>
                  <Text style={[bd.saveBtnText, { color: C.chartreuse }]}>Add all anyway</Text>
                </TouchableOpacity>
                <TouchableOpacity style={bd.retryBtn} onPress={() => setShowReview(false)}>
                  <Text style={bd.retryBtnText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Save / Retry buttons */}
          {!showReview && voiceState === 'done' && parsed.length > 0 && (
            <View style={{ gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={bd.saveBtn} onPress={handleSaveAll}>
                <Text style={bd.saveBtnText}>Add {parsed.length} {parsed.length === 1 ? 'task' : 'tasks'} to Obligations</Text>
              </TouchableOpacity>
              <TouchableOpacity style={bd.retryBtn} onPress={() => { setParsed([]); setTranscript(''); setVoiceState('idle'); setShowReview(false); setFreshItems([]); setDupeItems([]); }}>
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

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function ObligationsScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const obligations       = useAppStore(s => s.obligations);
  const addObligation     = useAppStore(s => s.addObligation);
  const addObligations    = useAppStore(s => s.addObligations);
  const resolveObligation = useAppStore(s => s.resolveObligation);

  const [filter, setFilter]         = useState<'all' | Risk>('all');
  const [selected, setSelected]     = useState<any>(null);
  const [detailVisible, setDetail]  = useState(false);
  const [addVisible, setAdd]        = useState(false);
  const [dumpVisible, setDump]      = useState(false);   // ← brain dump modal
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const active    = obligations.filter(o => o.status === 'active');
  const filtered  = filter === 'all' ? active : active.filter(o => o.risk === filter);
  const completed = obligations.filter(o => o.status === 'completed');
  const highCount = active.filter(o => o.risk === 'high').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']}>
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => nav.navigate('home')} style={styles.backBtn}>
              <Text style={styles.backBtnText}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.screenLabel}>LIFE STACK</Text>
              <Text style={styles.screenTitle}>Obligations</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {highCount > 0 && (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentText}>{highCount} urgent</Text>
              </View>
            )}
            {/* Mic button — opens brain dump modal */}
            <TouchableOpacity style={styles.micBtn} onPress={() => setDump(true)}>
              <Text style={styles.micIcon}>🎙️</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {['all', 'high', 'medium', 'low'].map((f) => {
            const isActive = filter === f;
            const fColor = f === 'high' ? C.crimson : f === 'medium' ? C.chartreuse : f === 'low' ? C.verdigris : C.white;
            return (
              <TouchableOpacity key={f} style={[styles.filterPill, isActive && { backgroundColor: fColor }]} onPress={() => setFilter(f as any)}>
                <Text style={[styles.filterText, isActive && { color: f === 'medium' ? C.bg : C.white }]}>
                  {f === 'all' ? `All (${active.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

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
            <Text style={styles.emptyText}>No {filter === 'all' ? '' : filter} obligations</Text>
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

      <TouchableOpacity style={styles.fab} onPress={() => setAdd(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <TabBar active="obligations" onTab={(s) => nav.navigate(s)} />

      <DetailModal item={selected} visible={detailVisible} onClose={() => setDetail(false)} onResolve={(it: any) => resolveObligation(it._id)} />
      <AddModal visible={addVisible} onClose={() => setAdd(false)} onAdd={(item: any) => addObligation(item)} />
      <BrainDumpModal visible={dumpVisible} onClose={() => setDump(false)} onSave={(items) => addObligations(items)} existingObligations={active} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn:      { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  backBtnText:  { color: C.verdigris, fontSize: 18, fontWeight: '600' },
  screenLabel:  { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  screenTitle:  { color: C.white, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  urgentBadge:  { backgroundColor: `${C.crimson}20`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: `${C.crimson}40` },
  urgentText:   { color: C.crimson, fontSize: 13, fontWeight: '700' },
  micBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: `${C.salmon}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${C.salmon}30` },
  micIcon:      { fontSize: 18 },
  filterRow:    { marginBottom: 8 },
  filterPill:   { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterText:   { color: C.textSec, fontSize: 13, fontWeight: '600' },
  list:         { paddingHorizontal: 16, paddingTop: 8 },
  card:         { backgroundColor: C.surface, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, gap: 12 },
  cardIcon:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardEmoji:    { fontSize: 24 },
  cardBody:     { flex: 1, gap: 4 },
  cardTitle:    { color: C.white, fontSize: 15, fontWeight: '600' },
  cardNotes:    { color: C.textTer, fontSize: 12 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  riskPill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  riskPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  daysText:     { fontSize: 12, fontWeight: '700' },
  amount:       { color: C.textSec, fontSize: 12 },
  resolveBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: `${C.verdigris}20`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${C.verdigris}40` },
  resolveBtnText: { color: C.verdigris, fontSize: 16, fontWeight: '700' },
  emptyState:   { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyEmoji:   { fontSize: 40, color: C.verdigris },
  emptyText:    { color: C.white, fontSize: 17, fontWeight: '600' },
  emptySub:     { color: C.textTer, fontSize: 13 },
  completedSection: { marginTop: 16 },
  completedLabel:   { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  completedCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: `${C.surface}80`, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: `${C.border}50`, opacity: 0.6 },
  completedEmoji:   { fontSize: 18 },
  completedTitle:   { flex: 1, color: C.textSec, fontSize: 14, textDecorationLine: 'line-through' },
  completedCheck:   { fontSize: 16, fontWeight: '700' },
  fab:     { position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.chartreuse, alignItems: 'center', justifyContent: 'center', shadowColor: C.chartreuse, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 },
  fabText: { color: C.bg, fontSize: 28, fontWeight: '300', lineHeight: 32 },
});

const modal = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,47,58,0.85)' },
  sheet:          { backgroundColor: '#0A3D4A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: '#1A5060' },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: '#1A5060', alignSelf: 'center', marginBottom: 24 },
  header:         { flexDirection: 'row', gap: 16, marginBottom: 20, alignItems: 'center' },
  icon:           { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:          { color: '#FEFFFE', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  riskBadge:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  riskText:       { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  infoGrid:       { flexDirection: 'row', gap: 12, marginBottom: 20 },
  infoItem:       { flex: 1, backgroundColor: '#0F4A5A', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1A5060' },
  infoLabel:      { color: '#4A7A85', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  infoValue:      { color: '#FEFFFE', fontSize: 20, fontWeight: '700' },
  executionBlock: { backgroundColor: '#0F4A5A', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#1A5060' },
  executionLabel: { color: '#4A7A85', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  executionText:  { color: '#8FB8BF', fontSize: 14, lineHeight: 20 },
  actions:        { gap: 10 },
  primaryBtn:     { backgroundColor: '#D5FF3F', borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#002F3A', fontSize: 16, fontWeight: '700' },
  secondaryBtn:   { backgroundColor: 'transparent', borderRadius: 999, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1A5060' },
  secondaryBtnText: { color: '#8FB8BF', fontSize: 15, fontWeight: '500' },
});

const add = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,47,58,0.85)' },
  sheet:          { backgroundColor: '#0A3D4A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 20, maxHeight: '90%', borderTopWidth: 1, borderColor: C.border },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  titleRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle:     { color: C.white, fontSize: 20, fontWeight: '700' },
  closeBtn:       { color: C.textSec, fontSize: 20, padding: 4 },
  label:          { color: C.textSec, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  input:          { backgroundColor: C.surfaceEl, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingVertical: 13, paddingHorizontal: 16, color: C.white, fontSize: 15, marginBottom: 16 },
  typePill:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.surfaceEl, borderWidth: 1, borderColor: C.border },
  typePillActive: { backgroundColor: C.verdigris, borderColor: C.verdigris },
  typePillText:   { color: C.textSec, fontSize: 13, fontWeight: '600' },
  riskRow:        { flexDirection: 'row', gap: 10, marginBottom: 16 },
  riskBtn:        { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: C.surfaceEl, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  riskBtnText:    { color: C.textSec, fontSize: 13, fontWeight: '600' },
  addBtn:         { backgroundColor: C.chartreuse, borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  addBtnText:     { color: C.bg, fontSize: 16, fontWeight: '700' },
});

// ── Brain Dump Modal Styles ────────────────────────────────────────────────────
const bd = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,47,58,0.88)' },
  sheet:          { backgroundColor: '#0A3D4A', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36, borderTopWidth: 1, borderColor: C.border },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 20 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title:          { color: C.white, fontSize: 20, fontWeight: '700' },
  sub:            { color: C.textSec, fontSize: 12, marginTop: 2 },
  closeBtn:       { color: C.textSec, fontSize: 20, padding: 4 },
  hintBox:        { backgroundColor: `${C.verdigris}10`, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: `${C.verdigris}20` },
  hintText:       { color: C.textSec, fontSize: 12, lineHeight: 18 },
  transcriptBox:  { backgroundColor: C.surfaceEl, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  transcriptLabel:{ color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  transcriptText: { color: C.textSec, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  resultsLabel:   { color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  parsedCard:     { backgroundColor: C.surfaceEl, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3 },
  parsedEmoji:    { fontSize: 20, width: 28, textAlign: 'center' },
  parsedTitle:    { color: C.white, fontSize: 13, fontWeight: '600' },
  parsedRisk:     { fontSize: 10, fontWeight: '800' },
  parsedDays:     { color: C.textSec, fontSize: 11 },
  parsedAmount:   { color: C.textSec, fontSize: 11 },
  newBadge:       { backgroundColor: `${C.chartreuse}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: `${C.chartreuse}40` },
  newText:        { color: C.chartreuse, fontSize: 8, fontWeight: '800' },
  statusText:     { textAlign: 'center', fontSize: 13, fontWeight: '500', marginBottom: 8, minHeight: 20 },
  micBtn:         { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  micIcon:        { fontSize: 28 },
  saveBtn:        { backgroundColor: C.chartreuse, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  saveBtnText:    { color: C.bg, fontSize: 15, fontWeight: '700' },
  retryBtn:       { alignItems: 'center', paddingVertical: 10 },
  retryBtnText:   { color: C.textTer, fontSize: 13 },
  dupeCard:       { backgroundColor: C.surfaceEl, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border, gap: 6 },
  dupeRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dupeLabelPill:  { backgroundColor: `${C.verdigris}20`, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  dupeLabelText:  { color: C.verdigris, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  dupeName:       { flex: 1, color: C.white, fontSize: 12, fontWeight: '600' },
});