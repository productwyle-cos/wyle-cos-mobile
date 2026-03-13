// src/screens/Insights/InsightsScreen.tsx
// LOS Dashboard — value proof layer per PRD Section I
// Shows: LOS score breakdown, time saved, decisions handled, money saved, reliability %, ATS

import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, StatusBar, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavProp } from '../../../app/index';

const { width } = Dimensions.get('window');

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

// ── Mock data — matches PRD LOS Component Model ───────────────────────────────
const LOS_SCORE = 74;

const LOS_DIMENSIONS = [
  { label: 'Time Management',      weight: 25, score: 20, color: C.verdigris,  icon: '⏱️', desc: 'Decisions offloaded + time saved' },
  { label: 'Obligation Health',    weight: 25, score: 19, color: C.salmon,     icon: '🛂', desc: '2 high-risk items need attention' },
  { label: 'Execution Reliability',weight: 20, score: 16, color: C.chartreuse, icon: '⚡', desc: 'Order accuracy + on-time rate' },
  { label: 'Financial Awareness',  weight: 15, score: 11, color: C.verdigris,  icon: '💰', desc: 'Savings flagged + subs managed' },
  { label: 'Personal Time',        weight: 15, score: 8,  color: C.salmon,     icon: '🛡️', desc: '1 conflict detected this week' },
];

const WEEKLY_STATS = [
  { label: 'Time Saved',       value: '4h 20m', sub: 'this week',    icon: '⏱️', color: C.verdigris,  trend: '+12%' },
  { label: 'Decisions Handled',value: '12',     sub: 'this week',    icon: '🧠', color: C.chartreuse, trend: '+3'   },
  { label: 'Money Saved',      value: 'AED 0',  sub: 'this week',    icon: '💰', color: C.salmon,     trend: '—'    },
  { label: 'Reliability',      value: '91%',    sub: 'rolling 30d',  icon: '✓',  color: C.verdigris,  trend: '+2%'  },
];

const LIFETIME_STATS = [
  { label: 'Total Time Saved',   value: '18h 40m', color: C.verdigris  },
  { label: 'Total Decisions',    value: '47',       color: C.chartreuse },
  { label: 'Obligations Handled',value: '6',        color: C.salmon     },
  { label: 'Miss Rate',          value: '0%',       color: C.verdigris  },
];

// Weekly trend bars (Mon–Sun, hours saved)
const WEEKLY_TREND = [
  { day: 'M', val: 0.5 },
  { day: 'T', val: 1.2 },
  { day: 'W', val: 0.8 },
  { day: 'T', val: 1.5 },
  { day: 'F', val: 0.3 },
  { day: 'S', val: 0.0 },
  { day: 'S', val: 0.0 },
];
const MAX_TREND = Math.max(...WEEKLY_TREND.map(d => d.val), 1);

// ATS = Automation Trust Score
const ATS = {
  tier: 1,
  label: 'Suggester',
  score: 68,
  nextTier: 'Assistant',
  nextAt: 85,
  description: 'Buddy makes recommendations. You approve every action.',
};

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar({ active, onTab }: { active: string; onTab: (s: any) => void }) {
  const tabs = [
    { screen: 'home',        emoji: '⌂',  label: 'Home'     },
    { screen: 'obligations', emoji: '📋', label: 'Tasks'    },
    { screen: 'buddy',       emoji: '◎',  label: 'Buddy'    },
    { screen: 'insights',    emoji: '◈',  label: 'Insights' },
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

// ── Animated Counter ──────────────────────────────────────────────────────────
function AnimatedScore({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setDisplay(target); clearInterval(timer); }
      else setDisplay(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return <Text style={los.scoreNum}>{display}</Text>;
}

// ── LOS Ring (large) ──────────────────────────────────────────────────────────
function LOSRing({ score }: { score: number }) {
  const ringAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(ringAnim, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
  }, []);

  const ringColor = score >= 70 ? C.verdigris : score >= 40 ? C.chartreuse : C.crimson;
  const grade = score >= 80 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 50 ? 'FAIR' : 'NEEDS WORK';

  return (
    <View style={los.container}>
      <View style={[los.outerRing, { borderColor: `${ringColor}20` }]}>
        <View style={[los.middleRing, { borderColor: `${ringColor}40` }]}>
          <View style={[los.innerRing, { borderColor: ringColor, borderWidth: 6 }]}>
            <View style={los.center}>
              <AnimatedScore target={score} />
              <Text style={los.outOf}>/100</Text>
              <Text style={[los.grade, { color: ringColor }]}>{grade}</Text>
            </View>
          </View>
        </View>
      </View>
      <Text style={los.losLabel}>LIFE OPTIMIZATION SCORE</Text>
    </View>
  );
}
const los = StyleSheet.create({
  container:  { alignItems: 'center', paddingVertical: 24 },
  outerRing:  { width: 190, height: 190, borderRadius: 95, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  middleRing: { width: 166, height: 166, borderRadius: 83, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  innerRing:  { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center' },
  center:     { alignItems: 'center' },
  scoreNum:   { color: C.white, fontSize: 44, fontWeight: '800', lineHeight: 50 },
  outOf:      { color: C.textTer, fontSize: 14, fontWeight: '600', marginTop: -4 },
  grade:      { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  losLabel:   { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 14 },
});

// ── LOS Dimension Bar ─────────────────────────────────────────────────────────
function DimensionBar({ dim, delay }: { dim: typeof LOS_DIMENSIONS[0]; delay: number }) {
  const barAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pct = dim.score / dim.weight;

  useEffect(() => {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(barAnim,  { toValue: pct, duration: 800, useNativeDriver: false }),
        Animated.timing(fadeAnim, { toValue: 1,   duration: 400, useNativeDriver: true  }),
      ]).start();
    }, delay);
  }, []);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[db.row, { opacity: fadeAnim }]}>
      <Text style={db.icon}>{dim.icon}</Text>
      <View style={{ flex: 1 }}>
        <View style={db.labelRow}>
          <Text style={db.label}>{dim.label}</Text>
          <Text style={[db.score, { color: dim.color }]}>{dim.score}<Text style={db.weight}>/{dim.weight}</Text></Text>
        </View>
        <View style={db.track}>
          <Animated.View style={[db.fill, { width: barWidth, backgroundColor: dim.color }]} />
        </View>
        <Text style={db.desc}>{dim.desc}</Text>
      </View>
    </Animated.View>
  );
}
const db = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'flex-start' },
  icon:     { fontSize: 18, marginTop: 2, width: 24, textAlign: 'center' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label:    { color: C.white, fontSize: 13, fontWeight: '600' },
  score:    { fontSize: 13, fontWeight: '800' },
  weight:   { color: C.textTer, fontWeight: '400' },
  track:    { height: 6, backgroundColor: C.surfaceEl, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  fill:     { height: '100%', borderRadius: 3 },
  desc:     { color: C.textTer, fontSize: 11 },
});

// ── Weekly Stat Card ──────────────────────────────────────────────────────────
function StatCard({ stat, delay }: { stat: typeof WEEKLY_STATS[0]; delay: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 100, friction: 10, useNativeDriver: true }),
      ]).start();
    }, delay);
  }, []);

  return (
    <Animated.View style={[sc.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={sc.icon}>{stat.icon}</Text>
      <Text style={[sc.value, { color: stat.color }]}>{stat.value}</Text>
      <Text style={sc.label}>{stat.label}</Text>
      <Text style={sc.sub}>{stat.sub}</Text>
      <View style={[sc.trend, { backgroundColor: `${stat.color}18` }]}>
        <Text style={[sc.trendText, { color: stat.color }]}>{stat.trend}</Text>
      </View>
    </Animated.View>
  );
}
const sc = StyleSheet.create({
  card:      { width: (width - 48) / 2, backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, gap: 3 },
  icon:      { fontSize: 22, marginBottom: 4 },
  value:     { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  label:     { color: C.white, fontSize: 12, fontWeight: '600' },
  sub:       { color: C.textTer, fontSize: 10 },
  trend:     { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6 },
  trendText: { fontSize: 10, fontWeight: '700' },
});

// ── Trend Chart (bar chart) ───────────────────────────────────────────────────
function TrendChart() {
  const barAnims = WEEKLY_TREND.map(() => useRef(new Animated.Value(0)).current);
  useEffect(() => {
    Animated.stagger(80, barAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: WEEKLY_TREND[i].val / MAX_TREND,
        duration: 500,
        useNativeDriver: false,
      })
    )).start();
  }, []);

  const today = new Date().getDay(); // 0=Sun, 1=Mon...
  const todayIndex = today === 0 ? 6 : today - 1;

  return (
    <View style={tc.container}>
      <Text style={tc.title}>Time saved this week</Text>
      <Text style={tc.sub}>Hours per day</Text>
      <View style={tc.chart}>
        {WEEKLY_TREND.map((d, i) => {
          const isToday = i === todayIndex;
          const barH = barAnims[i].interpolate({ inputRange: [0, 1], outputRange: [2, 72] });
          return (
            <View key={i} style={tc.barCol}>
              <View style={tc.barWrap}>
                <Animated.View style={[
                  tc.bar,
                  { height: barH, backgroundColor: isToday ? C.chartreuse : d.val > 0 ? C.verdigris : C.surfaceEl }
                ]} />
              </View>
              <Text style={[tc.dayLabel, isToday && { color: C.chartreuse, fontWeight: '700' }]}>{d.day}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
const tc = StyleSheet.create({
  container: { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  title:     { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  sub:       { color: C.textTer, fontSize: 11, marginBottom: 16 },
  chart:     { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 88 },
  barCol:    { flex: 1, alignItems: 'center', gap: 6 },
  barWrap:   { flex: 1, justifyContent: 'flex-end', width: '100%' },
  bar:       { width: '100%', borderRadius: 4, minHeight: 2 },
  dayLabel:  { color: C.textTer, fontSize: 10, fontWeight: '500' },
});

// ── ATS Trust Tier Card ───────────────────────────────────────────────────────
function ATSCard() {
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progressAnim, { toValue: ATS.score / 100, duration: 1000, useNativeDriver: false }).start();
  }, []);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const TIERS = ['Observer', 'Suggester', 'Assistant', 'Orchestrator', 'Operator'];

  return (
    <View style={ats.card}>
      <View style={ats.header}>
        <View>
          <Text style={ats.cardLabel}>AUTOMATION TRUST SCORE</Text>
          <Text style={ats.tierName}>Tier {ATS.tier} — {ATS.label}</Text>
        </View>
        <View style={ats.scoreBadge}>
          <Text style={ats.scoreNum}>{ATS.score}</Text>
          <Text style={ats.scoreMax}>/100</Text>
        </View>
      </View>

      <Text style={ats.desc}>{ATS.description}</Text>

      {/* Progress to next tier */}
      <View style={ats.progressBlock}>
        <View style={ats.progressTrack}>
          <Animated.View style={[ats.progressFill, { width: progressWidth }]} />
          <View style={[ats.progressMilestone, { left: `${ATS.nextAt}%` }]} />
        </View>
        <View style={ats.progressLabels}>
          <Text style={ats.progressCurrent}>{ATS.score}%</Text>
          <Text style={ats.progressNext}>{ATS.nextAt}% → {ATS.nextTier}</Text>
        </View>
      </View>

      {/* Tier pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
        <View style={ats.tiersRow}>
          {TIERS.map((t, i) => {
            const active  = i === ATS.tier;
            const done    = i < ATS.tier;
            return (
              <View key={t} style={[
                ats.tierPill,
                done   && { backgroundColor: `${C.verdigris}20`, borderColor: `${C.verdigris}40` },
                active && { backgroundColor: C.verdigris, borderColor: C.verdigris },
              ]}>
                <Text style={[ats.tierPillText, (active || done) && { color: active ? C.bg : C.verdigris }]}>
                  {done ? '✓ ' : ''}{t}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
const ats = StyleSheet.create({
  card:            { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardLabel:       { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  tierName:        { color: C.white, fontSize: 16, fontWeight: '700' },
  scoreBadge:      { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreNum:        { color: C.chartreuse, fontSize: 32, fontWeight: '800' },
  scoreMax:        { color: C.textTer, fontSize: 14 },
  desc:            { color: C.textSec, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  progressBlock:   { gap: 6 },
  progressTrack:   { height: 8, backgroundColor: C.surfaceEl, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  progressFill:    { height: '100%', backgroundColor: C.verdigris, borderRadius: 4 },
  progressMilestone: { position: 'absolute', top: -2, width: 2, height: 12, backgroundColor: C.chartreuse, borderRadius: 1 },
  progressLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressCurrent: { color: C.verdigris, fontSize: 11, fontWeight: '700' },
  progressNext:    { color: C.chartreuse, fontSize: 11, fontWeight: '600' },
  tiersRow:        { flexDirection: 'row', gap: 8 },
  tierPill:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.surfaceEl, borderWidth: 1, borderColor: C.border },
  tierPillText:    { color: C.textTer, fontSize: 11, fontWeight: '600' },
});

// ── Lifetime Stats Row ────────────────────────────────────────────────────────
function LifetimeStats() {
  return (
    <View style={lf.card}>
      <Text style={lf.cardLabel}>ALL TIME</Text>
      <View style={lf.grid}>
        {LIFETIME_STATS.map((s, i) => (
          <View key={i} style={lf.item}>
            <Text style={[lf.value, { color: s.color }]}>{s.value}</Text>
            <Text style={lf.label}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const lf = StyleSheet.create({
  card:      { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardLabel: { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  item:      { width: (width - 84) / 2, gap: 3 },
  value:     { fontSize: 22, fontWeight: '800' },
  label:     { color: C.textSec, fontSize: 12 },
});

// ── Period Toggle ─────────────────────────────────────────────────────────────
type Period = 'week' | 'month' | 'lifetime';

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function InsightsScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };
  const [period, setPeriod] = useState<Period>('week');
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView edges={['top']}>
        <Animated.View style={[s.header, { opacity: fadeAnim }]}>
          <TouchableOpacity onPress={() => nav.navigate('home')} style={s.backBtn}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.screenLabel}>VALUE PROOF</Text>
            <Text style={s.screenTitle}>Insights</Text>
          </View>
          {/* Obligation miss rate badge — 0% is the target */}
          <View style={s.missBadge}>
            <Text style={s.missBadgeText}>0% miss rate</Text>
          </View>
        </Animated.View>

        {/* Period toggle */}
        <View style={s.periodRow}>
          {(['week', 'month', 'lifetime'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[s.periodBtn, period === p && s.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[s.periodText, period === p && s.periodTextActive]}>
                {p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'All time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* LOS Ring */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <LOSRing score={LOS_SCORE} />
        </Animated.View>

        {/* Weekly stat cards — 2x2 grid */}
        <Text style={s.sectionTitle}>This week's impact</Text>
        <View style={s.statGrid}>
          {WEEKLY_STATS.map((stat, i) => (
            <StatCard key={i} stat={stat} delay={i * 80} />
          ))}
        </View>

        {/* Trend chart */}
        <TrendChart />

        {/* LOS breakdown */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>LOS breakdown</Text>
          <Text style={s.sectionSub}>What's driving your score</Text>
          <View style={s.dimensionCard}>
            {LOS_DIMENSIONS.map((dim, i) => (
              <DimensionBar key={i} dim={dim} delay={i * 120} />
            ))}
          </View>
        </View>

        {/* How to improve CTA */}
        <TouchableOpacity
          style={s.improveCTA}
          onPress={() => nav.navigate('buddy')}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.improveLabel}>WANT A HIGHER SCORE?</Text>
            <Text style={s.improveText}>Ask Buddy how to improve your LOS from 74 → 85</Text>
          </View>
          <Text style={{ color: C.verdigris, fontSize: 22 }}>›</Text>
        </TouchableOpacity>

        {/* ATS Trust Score */}
        <Text style={s.sectionTitle}>Trust & autonomy</Text>
        <ATSCard />

        {/* Lifetime stats */}
        <Text style={s.sectionTitle}>All time</Text>
        <LifetimeStats />

        {/* Reliability statement */}
        <View style={s.reliabilityCard}>
          <Text style={s.reliabilityIcon}>✓</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.reliabilityTitle}>Zero obligation misses</Text>
            <Text style={s.reliabilitySub}>Wyle has caught every deadline before it became a crisis</Text>
          </View>
          <Text style={[s.reliabilityPct, { color: C.verdigris }]}>91%</Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <TabBar active="insights" onTab={(sc) => nav.navigate(sc)} />
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  scroll:      { paddingHorizontal: 16, paddingBottom: 20 },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  backBtnText: { color: C.verdigris, fontSize: 18, fontWeight: '600' },
  screenLabel: { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  screenTitle: { color: C.white, fontSize: 20, fontWeight: '700' },
  missBadge:   { backgroundColor: `${C.verdigris}18`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${C.verdigris}35` },
  missBadgeText: { color: C.verdigris, fontSize: 11, fontWeight: '700' },

  periodRow:   { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  periodBtn:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  periodBtnActive: { backgroundColor: C.verdigris, borderColor: C.verdigris },
  periodText:  { color: C.textSec, fontSize: 12, fontWeight: '600' },
  periodTextActive: { color: C.bg },

  sectionTitle:{ color: C.white, fontSize: 16, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  sectionSub:  { color: C.textTer, fontSize: 12, marginBottom: 12 },

  statGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },

  section:     { marginBottom: 8 },
  dimensionCard: { backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 16 },

  improveCTA:  { backgroundColor: `${C.verdigris}10`, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: `${C.verdigris}25` },
  improveLabel:{ color: C.verdigris, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  improveText: { color: C.textSec, fontSize: 13, lineHeight: 18 },

  reliabilityCard:  { backgroundColor: C.surface, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  reliabilityIcon:  { width: 40, height: 40, borderRadius: 20, backgroundColor: `${C.verdigris}20`, textAlign: 'center', lineHeight: 40, fontSize: 18, color: C.verdigris, overflow: 'hidden' },
  reliabilityTitle: { color: C.white, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  reliabilitySub:   { color: C.textSec, fontSize: 12, lineHeight: 17 },
  reliabilityPct:   { fontSize: 22, fontWeight: '800' },
});