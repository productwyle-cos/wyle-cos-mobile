// src/screens/Brief/MorningBriefScreen.tsx
// Morning brief / evening recap — dark palette, real-time from obligations store

import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { generateBrief, getBriefKey, getBriefTimeOfDay } from '../../services/briefService';
import { getDayProgress, saveMorningSnapshot } from '../../services/snapshotService';
import { BriefPriority, BriefCompletedItem } from '../../types';

// ── Colours — unified dark palette ───────────────────────────────────────────
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
const RISK_COLORS: Record<Risk, string> = {
  high: C.crimson, medium: C.orange, low: C.verdigris,
};

function getDaysLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return '';
  if (days < 0)  return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

// ── Priority Card ─────────────────────────────────────────────────────────────
function PriorityCard({ item }: { item: BriefPriority }) {
  const rc = RISK_COLORS[item.riskLevel as Risk] ?? C.verdigris;
  return (
    <View style={[pc.card, { borderLeftColor: rc }]}>
      <View style={[pc.icon, { backgroundColor: `${rc}15` }]}>
        <Text style={pc.emoji}>{item.emoji}</Text>
      </View>
      <View style={pc.body}>
        <Text style={pc.title}>{item.title}</Text>
        {!!item.executionPath && (
          <Text style={pc.path}>{item.executionPath}</Text>
        )}
        <View style={pc.meta}>
          <View style={[pc.riskPill, { backgroundColor: `${rc}20`, borderColor: `${rc}40` }]}>
            <Text style={[pc.riskText, { color: rc }]}>{item.riskLevel.toUpperCase()}</Text>
          </View>
          {item.daysUntil != null && (
            <Text style={[pc.days, { color: rc }]}>{getDaysLabel(item.daysUntil)}</Text>
          )}
        </View>
      </View>
      <View style={[pc.actionPill, { backgroundColor: `${rc}15`, borderColor: `${rc}35` }]}>
        <Text style={[pc.actionText, { color: rc }]}>{item.action}</Text>
      </View>
    </View>
  );
}

const pc = StyleSheet.create({
  card:       {
    backgroundColor: C.surface, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 4, gap: 12,
  },
  icon:       { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  emoji:      { fontSize: 22 },
  body:       { flex: 1, gap: 4 },
  title:      { color: C.white, fontSize: 14, fontWeight: '600' },
  path:       { color: C.textTer, fontSize: 11, lineHeight: 16 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  riskPill:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  riskText:   { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  days:       { fontSize: 11, fontWeight: '700' },
  actionPill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  actionText: { fontSize: 11, fontWeight: '700' },
});

// ── Completed Item Card (evening only) ───────────────────────────────────────
function CompletedCard({ item }: { item: BriefCompletedItem }) {
  return (
    <View style={cc.card}>
      <View style={cc.iconWrap}>
        <Text style={cc.emoji}>{item.emoji}</Text>
      </View>
      <View style={cc.body}>
        <Text style={cc.title}>{item.title}</Text>
        {!!item.completedNote && (
          <Text style={cc.note}>{item.completedNote}</Text>
        )}
      </View>
      <View style={cc.checkWrap}>
        <Text style={cc.check}>✓</Text>
      </View>
    </View>
  );
}

const cc = StyleSheet.create({
  card: {
    backgroundColor: `${C.verdigris}0A`,
    borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 8, borderWidth: 1,
    borderColor: `${C.verdigris}25`,
    gap: 12,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 11,
    backgroundColor: `${C.verdigris}18`,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji:    { fontSize: 20 },
  body:     { flex: 1, gap: 3 },
  title:    { color: C.textSec, fontSize: 13, fontWeight: '600', textDecorationLine: 'line-through' },
  note:     { color: C.verdigris, fontSize: 11, fontWeight: '600' },
  checkWrap:{
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: C.verdigris,
    alignItems: 'center', justifyContent: 'center',
  },
  check: { color: C.white, fontSize: 13, fontWeight: '800' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function MorningBriefScreen({ navigation }: { navigation: NavProp }) {
  const nav            = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };
  const brief          = useAppStore(s => s.morningBrief);
  const setMorningBrief= useAppStore(s => s.setMorningBrief);
  const setLastBriefKey= useAppStore(s => s.setLastBriefKey);
  const obligations    = useAppStore(s => s.obligations);
  const isEvening      = getBriefTimeOfDay() === 'evening';
  const fadeAnim       = useRef(new Animated.Value(0)).current;
  const slideAnim      = useRef(new Animated.Value(28)).current;
  const [genLoading,   setGenLoading]   = useState(false);
  const [genError,     setGenError]     = useState<string | null>(null);
  const [genStatus,    setGenStatus]    = useState('Preparing your brief…');

  // ── Auto-generate if brief is null on mount ───────────────────────────────
  useEffect(() => {
    if (!brief) triggerGenerate();
  }, []);

  async function triggerGenerate() {
    setGenLoading(true);
    setGenError(null);
    try {
      if (isEvening) {
        setGenStatus('Reviewing today\'s progress…');
        const dayProgress = await getDayProgress(obligations);
        setGenStatus('Generating your evening recap…');
        const result = await generateBrief(obligations, 99, dayProgress);
        setMorningBrief(result);
        setLastBriefKey(getBriefKey());
      } else {
        setGenStatus('Saving today\'s task snapshot…');
        await saveMorningSnapshot(obligations);
        setGenStatus('Generating your morning brief…');
        const result = await generateBrief(obligations, 99);
        setMorningBrief(result);
        setLastBriefKey(getBriefKey());
      }
    } catch (e: any) {
      setGenError(e?.message ?? 'Could not generate brief. Check your connection.');
    } finally {
      setGenLoading(false);
    }
  }

  useEffect(() => {
    if (brief) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]).start();
    }
  }, [brief]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!brief) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <SafeAreaView edges={['top']}>
          <View style={s.header}>
            <View>
              <Text style={s.screenLabel}>{isEvening ? '🌙 EVENING RECAP' : '☀️ MORNING BRIEF'}</Text>
              <Text style={s.screenTitle}>{isEvening ? 'Day Wrap-Up' : "Today's Briefing"}</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={() => nav.goBack()}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        <View style={s.emptyState}>
          {genLoading ? (
            <>
              <ActivityIndicator size="large" color={C.verdigris} style={{ marginBottom: 20 }} />
              <Text style={s.emptyTitle}>{genStatus}</Text>
              <Text style={s.emptySub}>Buddy is analysing your obligations…</Text>
            </>
          ) : genError ? (
            <>
              <Text style={s.emptyEmoji}>⚠️</Text>
              <Text style={s.emptyTitle}>Could not generate brief</Text>
              <Text style={s.emptySub}>{genError}</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={triggerGenerate}>
                <Text style={s.emptyBtnText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.emptyEmoji}>{isEvening ? '🌙' : '☀️'}</Text>
              <Text style={s.emptyTitle}>
                {isEvening ? 'Your day at a glance' : "Your morning brief"}
              </Text>
              <Text style={s.emptySub}>Buddy will summarise your obligations and day progress.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={triggerGenerate}>
                <Text style={s.emptyBtnText}>Generate now</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  const losColor = brief.lifeOptimizationScore >= 70 ? C.verdigris
                 : brief.lifeOptimizationScore >= 40 ? C.orange
                 : C.crimson;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']}>
        <Animated.View style={[s.header, { opacity: fadeAnim }]}>
          <View>
            <Text style={s.screenLabel}>{isEvening ? '🌙 EVENING RECAP' : '☀️ MORNING BRIEF'}</Text>
            <Text style={s.screenTitle}>{isEvening ? 'Day Wrap-Up' : "Today's Briefing"}</Text>
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={() => nav.goBack()}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Greeting card ───────────────────────────────────────────────── */}
        <Animated.View style={[s.greetCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Accent gradient bar */}
          <LinearGradient
            colors={[C.verdigris, C.chartreuse]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.greetAccent}
          />
          <Text style={s.greeting}>{brief.greeting}</Text>
          <Text style={s.headline}>{brief.headline}</Text>
          <View style={s.losRow}>
            <Text style={s.losLabel}>LIFE OPTIMIZATION SCORE</Text>
            <View style={[s.losBadge, { backgroundColor: `${losColor}20`, borderColor: `${losColor}40` }]}>
              <Text style={[s.losScore, { color: losColor }]}>{brief.lifeOptimizationScore}</Text>
              <Text style={[s.losOf,    { color: losColor }]}>/100</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Completed Today (evening only) ──────────────────────────────── */}
        {isEvening && (brief.completedItems?.length ?? 0) > 0 && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={s.sectionLabel}>COMPLETED TODAY</Text>
            {brief.completedItems!.map(item => (
              <CompletedCard key={item.id} item={item} />
            ))}
          </Animated.View>
        )}

        {/* ── Pending / All-clear (evening only) ──────────────────────────── */}
        {isEvening && (
          <Animated.View style={{ opacity: fadeAnim }}>
            {(brief.topPriorities?.length ?? 0) > 0 ? (
              <>
                <Text style={s.sectionLabel}>STILL NEEDS ATTENTION</Text>
                {brief.topPriorities.map(item => (
                  <PriorityCard key={item.id} item={item} />
                ))}
              </>
            ) : (
              <View style={s.allClearBanner}>
                <Text style={s.allClearIcon}>🎉</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.allClearTitle}>All clear for today!</Text>
                  <Text style={s.allClearSub}>No pending items. You handled everything.</Text>
                </View>
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Today's Priorities (morning only) ───────────────────────────── */}
        {!isEvening && (brief.topPriorities?.length ?? 0) > 0 && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={s.sectionLabel}>TODAY'S PRIORITIES</Text>
            {brief.topPriorities.map(item => (
              <PriorityCard key={item.id} item={item} />
            ))}
          </Animated.View>
        )}

        {/* ── Tomorrow Preview (evening only) ─────────────────────────────── */}
        {isEvening && !!brief.tomorrowPreview && (
          <Animated.View style={[s.tomorrowCard, { opacity: fadeAnim }]}>
            <Text style={s.tomorrowIcon}>🌅</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.tomorrowLabel}>TOMORROW</Text>
              <Text style={s.tomorrowText}>{brief.tomorrowPreview}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Stats Row ───────────────────────────────────────────────────── */}
        <Animated.View style={[s.statsRow, { opacity: fadeAnim }]}>
          {[
            { label: 'Tracked',    value: String(brief.stats?.obligationsTracked ?? 0), color: C.salmon },
            { label: 'Time Saved', value: brief.stats?.timeSavedThisWeek ?? '—',         color: C.verdigris },
            { label: 'Decisions',  value: String(brief.stats?.decisionsHandled ?? 0),    color: C.chartreuse },
          ].map((stat, i) => (
            <View key={i} style={s.statCard}>
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── Buddy Tip ───────────────────────────────────────────────────── */}
        {!!brief.tip && (
          <Animated.View style={[s.tipCard, { opacity: fadeAnim }]}>
            <Text style={s.tipIcon}>💡</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.tipLabel}>BUDDY'S TIP</Text>
              <Text style={s.tipText}>{brief.tip}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={s.ctaWrap}
          onPress={() => nav.navigate('buddy')}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[C.verdigris, C.chartreuseB]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.ctaGrad}
          >
            <Text style={s.ctaText}>Talk to Buddy  →</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },

  // Header
  header:       {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14,
  },
  screenLabel:  { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2.5, marginBottom: 2 },
  screenTitle:  { color: C.white, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  closeBtn:     {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  closeBtnText: { color: C.textSec, fontSize: 16, fontWeight: '600' },

  scroll:       { paddingHorizontal: 16, paddingTop: 4 },

  // Greeting card
  greetCard:    {
    backgroundColor: C.surface, borderRadius: 20, padding: 20,
    marginBottom: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  greetAccent:  { height: 3, borderRadius: 2, marginBottom: 16, marginHorizontal: -20, marginTop: -20 },
  greeting:     { color: C.textSec, fontSize: 14, fontWeight: '500', marginBottom: 8 },
  headline:     {
    color: C.white, fontSize: 20, fontWeight: '700',
    lineHeight: 28, letterSpacing: -0.3, marginBottom: 14,
  },
  losRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  losLabel:     { color: C.textTer, fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  losBadge:     {
    flexDirection: 'row', alignItems: 'baseline', gap: 2,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  losScore:     { fontSize: 18, fontWeight: '800' },
  losOf:        { fontSize: 10, fontWeight: '600' },

  sectionLabel: { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },

  // Stats
  statsRow:     { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 14 },
  statCard:     {
    flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
  },
  statValue:    { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  statLabel:    { color: C.textTer, fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center' },

  // Tip
  tipCard:      {
    backgroundColor: `${C.chartreuse}10`, borderRadius: 14, padding: 14,
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    borderWidth: 1, borderColor: `${C.chartreuse}25`, marginBottom: 14,
  },
  tipIcon:      { fontSize: 20, marginTop: 2 },
  tipLabel:     { color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  tipText:      { color: C.textSec, fontSize: 13, lineHeight: 19 },

  // CTA
  ctaWrap:      { borderRadius: 999, overflow: 'hidden', marginBottom: 4 },
  ctaGrad:      { paddingVertical: 16, alignItems: 'center', borderRadius: 999 },
  ctaText:      { color: C.bg, fontSize: 15, fontWeight: '800' },

  // All-clear banner (evening — no pending items)
  allClearBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: `${C.verdigris}12`,
    borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: `${C.verdigris}30`,
  },
  allClearIcon:  { fontSize: 28 },
  allClearTitle: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  allClearSub:   { color: C.textSec, fontSize: 12, lineHeight: 17 },

  // Tomorrow preview card (evening only)
  tomorrowCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: C.surface, borderRadius: 14, padding: 14,
    marginBottom: 14, borderWidth: 1, borderColor: C.border,
  },
  tomorrowIcon:  { fontSize: 20, marginTop: 2 },
  tomorrowLabel: { color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  tomorrowText:  { color: C.textSec, fontSize: 13, lineHeight: 19 },

  // Empty state
  emptyState:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyEmoji:   { fontSize: 48 },
  emptyTitle:   { color: C.white, fontSize: 18, fontWeight: '700' },
  emptySub:     { color: C.textSec, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  emptyBtn:     {
    marginTop: 8, backgroundColor: C.surface, borderRadius: 999,
    paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: C.border,
  },
  emptyBtnText: { color: C.verdigris, fontSize: 14, fontWeight: '600' },
});
