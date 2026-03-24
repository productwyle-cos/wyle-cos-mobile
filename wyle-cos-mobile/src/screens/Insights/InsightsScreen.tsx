// src/screens/Insights/InsightsScreen.tsx
// Redesigned to match Figma: dark bg, scrollable header banner,
// Time Reclaimed · Delegation Impact · System Performance · Value Generated
// Consistent 5-tab footer with animated hologram orb (same as HomeScreen)

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { NavProp } from '../../../app/index';

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

// ── Mock data ─────────────────────────────────────────────────────────────────
const TIME_RECLAIMED = {
  thisWeekHours: 4.5,
  thisWeekMins: 4 * 60 + 30,
  lastWeekHours: 3.2,
  totalHours: 18.5,
  dailyBreakdown: [
    { day: 'M', hrs: 0.5 },
    { day: 'T', hrs: 1.2 },
    { day: 'W', hrs: 0.8 },
    { day: 'T', hrs: 1.5 },
    { day: 'F', hrs: 0.5 },
    { day: 'S', hrs: 0.0 },
    { day: 'S', hrs: 0.0 },
  ],
  categories: [
    { label: 'Document Prep',  hrs: 1.8, color: C.verdigris  },
    { label: 'Scheduling',     hrs: 1.2, color: C.chartreuse },
    { label: 'Renewals',       hrs: 0.9, color: C.orange     },
    { label: 'Research',       hrs: 0.6, color: C.salmon     },
  ],
};

const DELEGATION = {
  tasksHandled:   12,
  autoExecuted:   4,
  pendingApproval:2,
  thisWeekItems: [
    { title: 'Emirates ID reminder sent',          type: 'auto',    time: 'Mon 9:12 AM'  },
    { title: 'Vehicle registration drafted',       type: 'pending', time: 'Tue 2:30 PM'  },
    { title: 'School fee alert triggered',         type: 'auto',    time: 'Wed 8:00 AM'  },
    { title: 'Driver visa checklist compiled',     type: 'pending', time: 'Thu 11:45 AM' },
  ],
};

const SYSTEM_PERF = {
  reliability:     99,
  successRate:     94,
  avgResponseSec:  1.4,
  uptime:          '7 days',
  missRate:        0,
  metrics: [
    { label: 'Deadlines caught',    value: '100%', color: C.verdigris  },
    { label: 'Actions on time',     value: '94%',  color: C.chartreuse },
    { label: 'Avg response',        value: '1.4s', color: C.verdigris  },
    { label: 'Missed obligations',  value: '0',    color: C.chartreuse },
  ],
};

const VALUE_GENERATED = {
  timeValueAED:   2160,   // 4.5h × AED 480/hr (avg Dubai exec rate)
  hourlyRate:     480,
  totalAED:       8880,   // lifetime
  weeklyTrend:    '+41%', // vs last week
  breakdown: [
    { label: 'Time freed (4.5h)',   aed: 2160,  color: C.verdigris  },
    { label: 'Stress avoided',      aed: 500,   color: C.chartreuse },
    { label: 'Late fees prevented', aed: 0,     color: C.textTer    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Animated Hologram Orb (centre tab) — exact copy from HomeScreen
// ─────────────────────────────────────────────────────────────────────────────
const ORB_SIZE = 58;

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
// 5-item Tab Bar — consistent with HomeScreen
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
// Section 1 — Time Reclaimed
// ─────────────────────────────────────────────────────────────────────────────
function TimeReclaimedSection() {
  const barAnims = TIME_RECLAIMED.dailyBreakdown.map(() =>
    useRef(new Animated.Value(0)).current
  );
  const MAX = Math.max(...TIME_RECLAIMED.dailyBreakdown.map(d => d.hrs), 1);
  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;

  useEffect(() => {
    Animated.stagger(70, barAnims.map((a, i) =>
      Animated.timing(a, {
        toValue: TIME_RECLAIMED.dailyBreakdown[i].hrs / MAX,
        duration: 500,
        useNativeDriver: false,
      })
    )).start();
  }, []);

  const weekChange = ((TIME_RECLAIMED.thisWeekHours - TIME_RECLAIMED.lastWeekHours) / TIME_RECLAIMED.lastWeekHours * 100).toFixed(0);
  const isPositive = Number(weekChange) >= 0;

  return (
    <View style={s.card}>
      {/* Card header */}
      <View style={s.cardHeader}>
        <View>
          <Text style={s.cardLabel}>TIME RECLAIMED</Text>
          <Text style={s.cardTitle}>This week</Text>
        </View>
        <View style={[s.trendBadge, { backgroundColor: isPositive ? `${C.verdigris}18` : `${C.crimson}18`, borderColor: isPositive ? `${C.verdigris}35` : `${C.crimson}35` }]}>
          <Text style={[s.trendText, { color: isPositive ? C.verdigris : C.crimson }]}>
            {isPositive ? '+' : ''}{weekChange}% vs last week
          </Text>
        </View>
      </View>

      {/* Big stat */}
      <View style={s.bigStatRow}>
        <Text style={[s.bigStatNum, { color: C.verdigris }]}>4h</Text>
        <Text style={[s.bigStatNum, { color: C.verdigris }]}> 30m</Text>
        <Text style={s.bigStatSub}>freed this week</Text>
      </View>

      {/* Bar chart */}
      <View style={s.miniChart}>
        {TIME_RECLAIMED.dailyBreakdown.map((d, i) => {
          const barH = barAnims[i].interpolate({ inputRange: [0, 1], outputRange: [3, 60] });
          const isToday = i === todayIdx;
          const color = isToday ? C.chartreuse : d.hrs > 0 ? C.verdigris : C.surfaceEl;
          return (
            <View key={i} style={s.barCol}>
              <View style={s.barWrap}>
                <Animated.View style={[s.bar, { height: barH, backgroundColor: color }]} />
              </View>
              <Text style={[s.barDay, isToday && { color: C.chartreuse, fontWeight: '700' }]}>{d.day}</Text>
            </View>
          );
        })}
      </View>

      {/* Category breakdown */}
      <View style={s.catGrid}>
        {TIME_RECLAIMED.categories.map((cat, i) => (
          <View key={i} style={s.catItem}>
            <View style={[s.catDot, { backgroundColor: cat.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.catLabel}>{cat.label}</Text>
              <Text style={[s.catVal, { color: cat.color }]}>{cat.hrs}h</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Lifetime total */}
      <View style={s.lifetimeRow}>
        <Text style={s.lifetimeLabel}>ALL TIME RECLAIMED</Text>
        <Text style={[s.lifetimeVal, { color: C.chartreuse }]}>{TIME_RECLAIMED.totalHours}h</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Delegation Impact
// ─────────────────────────────────────────────────────────────────────────────
function DelegationImpactSection() {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View>
          <Text style={s.cardLabel}>DELEGATION IMPACT</Text>
          <Text style={s.cardTitle}>What Wyle handled</Text>
        </View>
        <View style={[s.trendBadge, { backgroundColor: `${C.chartreuse}14`, borderColor: `${C.chartreuse}30` }]}>
          <Text style={[s.trendText, { color: C.chartreuse }]}>{DELEGATION.tasksHandled} tasks</Text>
        </View>
      </View>

      {/* 3-stat row */}
      <View style={s.triStatRow}>
        <View style={s.triStat}>
          <Text style={[s.triNum, { color: C.verdigris }]}>{DELEGATION.tasksHandled}</Text>
          <Text style={s.triLabel}>Handled</Text>
        </View>
        <View style={s.triDivider} />
        <View style={s.triStat}>
          <Text style={[s.triNum, { color: C.chartreuse }]}>{DELEGATION.autoExecuted}</Text>
          <Text style={s.triLabel}>Auto-executed</Text>
        </View>
        <View style={s.triDivider} />
        <View style={s.triStat}>
          <Text style={[s.triNum, { color: C.orange }]}>{DELEGATION.pendingApproval}</Text>
          <Text style={s.triLabel}>Awaiting you</Text>
        </View>
      </View>

      {/* Activity list */}
      <Text style={s.subSectionLabel}>THIS WEEK</Text>
      {DELEGATION.thisWeekItems.map((item, i) => {
        const isPending = item.type === 'pending';
        return (
          <View key={i} style={[s.activityRow, i < DELEGATION.thisWeekItems.length - 1 && s.activityRowBorder]}>
            <View style={[s.activityDot, { backgroundColor: isPending ? C.orange : C.verdigris }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.activityTitle}>{item.title}</Text>
              <Text style={s.activityTime}>{item.time}</Text>
            </View>
            <View style={[s.activityBadge, { backgroundColor: isPending ? `${C.orange}15` : `${C.verdigris}15` }]}>
              <Text style={[s.activityBadgeText, { color: isPending ? C.orange : C.verdigris }]}>
                {isPending ? 'Pending' : 'Done'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — System Performance
// ─────────────────────────────────────────────────────────────────────────────
function SystemPerformanceSection() {
  const reliabilityAnim = useRef(new Animated.Value(0)).current;
  const successAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(reliabilityAnim, { toValue: SYSTEM_PERF.reliability / 100, duration: 900, useNativeDriver: false }),
      Animated.timing(successAnim,     { toValue: SYSTEM_PERF.successRate   / 100, duration: 900, useNativeDriver: false }),
    ]).start();
  }, []);

  const reliabilityWidth = reliabilityAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const successWidth     = successAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View>
          <Text style={s.cardLabel}>SYSTEM PERFORMANCE</Text>
          <Text style={s.cardTitle}>How well Wyle is running</Text>
        </View>
        <View style={[s.trendBadge, { backgroundColor: `${C.verdigris}18`, borderColor: `${C.verdigris}35` }]}>
          <Text style={[s.trendText, { color: C.verdigris }]}>↑ Optimal</Text>
        </View>
      </View>

      {/* Reliability bar */}
      <View style={s.perfRow}>
        <View style={s.perfLabelRow}>
          <Text style={s.perfLabel}>Reliability</Text>
          <Text style={[s.perfVal, { color: C.verdigris }]}>{SYSTEM_PERF.reliability}%</Text>
        </View>
        <View style={s.perfTrack}>
          <Animated.View style={[s.perfFill, { width: reliabilityWidth, backgroundColor: C.verdigris }]} />
        </View>
      </View>

      {/* Success rate bar */}
      <View style={[s.perfRow, { marginTop: 14 }]}>
        <View style={s.perfLabelRow}>
          <Text style={s.perfLabel}>Actions completed on time</Text>
          <Text style={[s.perfVal, { color: C.chartreuse }]}>{SYSTEM_PERF.successRate}%</Text>
        </View>
        <View style={s.perfTrack}>
          <Animated.View style={[s.perfFill, { width: successWidth, backgroundColor: C.chartreuse }]} />
        </View>
      </View>

      {/* 4-metric grid */}
      <View style={s.metricGrid}>
        {SYSTEM_PERF.metrics.map((m, i) => (
          <View key={i} style={s.metricItem}>
            <Text style={[s.metricVal, { color: m.color }]}>{m.value}</Text>
            <Text style={s.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {/* Zero miss badge */}
      <View style={s.zeroBadge}>
        <Text style={s.zeroIcon}>✓</Text>
        <Text style={s.zeroText}>Zero obligation misses — Wyle caught every deadline before it became a crisis</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Value Generated
// ─────────────────────────────────────────────────────────────────────────────
function ValueGeneratedSection() {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View>
          <Text style={s.cardLabel}>VALUE GENERATED</Text>
          <Text style={s.cardTitle}>Your ROI this week</Text>
        </View>
        <View style={[s.trendBadge, { backgroundColor: `${C.chartreuse}14`, borderColor: `${C.chartreuse}30` }]}>
          <Text style={[s.trendText, { color: C.chartreuse }]}>{VALUE_GENERATED.weeklyTrend} vs last week</Text>
        </View>
      </View>

      {/* Big AED number */}
      <View style={s.aedWrap}>
        <Text style={s.aedCurrency}>AED</Text>
        <Text style={s.aedAmount}>{VALUE_GENERATED.timeValueAED.toLocaleString()}</Text>
      </View>
      <Text style={s.aedNote}>
        Based on {VALUE_GENERATED.thisWeekHours ?? TIME_RECLAIMED.thisWeekHours}h freed × AED {VALUE_GENERATED.hourlyRate}/hr avg Dubai executive rate
      </Text>

      {/* Breakdown rows */}
      <View style={s.breakdownList}>
        {VALUE_GENERATED.breakdown.map((b, i) => (
          <View key={i} style={[s.breakdownRow, i < VALUE_GENERATED.breakdown.length - 1 && s.breakdownBorder]}>
            <Text style={s.breakdownLabel}>{b.label}</Text>
            <Text style={[s.breakdownAed, { color: b.aed > 0 ? b.color : C.textTer }]}>
              {b.aed > 0 ? `AED ${b.aed.toLocaleString()}` : '—'}
            </Text>
          </View>
        ))}
      </View>

      {/* Lifetime value */}
      <LinearGradient
        colors={[`${C.chartreuse}15`, `${C.verdigris}10`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={s.lifetimeValueCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.lifetimeValueLabel}>ALL-TIME VALUE GENERATED</Text>
          <Text style={s.lifetimeValueNote}>Since you started using Wyle</Text>
        </View>
        <Text style={s.lifetimeValueAed}>AED {VALUE_GENERATED.totalAED.toLocaleString()}</Text>
      </LinearGradient>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function InsightsScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
        >
          {/* ── Header banner (scrolls away with content) ──────────────────── */}
          <Animated.View style={[s.headerBanner, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            {/* Top gradient accent line */}
            <LinearGradient
              colors={[C.verdigris, C.chartreuse, C.orange]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.headerAccentLine}
            />
            <Text style={s.screenLabel}>WYLE INTELLIGENCE</Text>
            <Text style={s.screenTitle}>Insights</Text>
            <Text style={s.screenSubtitle}>your life optimization intelligence</Text>

            {/* Quick stats row under title */}
            <View style={s.headerStats}>
              <View style={s.headerStat}>
                <Text style={[s.headerStatVal, { color: C.verdigris }]}>4.5h</Text>
                <Text style={s.headerStatLabel}>SAVED</Text>
              </View>
              <View style={s.headerStatDivider} />
              <View style={s.headerStat}>
                <Text style={[s.headerStatVal, { color: C.chartreuse }]}>12</Text>
                <Text style={s.headerStatLabel}>HANDLED</Text>
              </View>
              <View style={s.headerStatDivider} />
              <View style={s.headerStat}>
                <Text style={[s.headerStatVal, { color: C.verdigris }]}>99%</Text>
                <Text style={s.headerStatLabel}>RELIABLE</Text>
              </View>
              <View style={s.headerStatDivider} />
              <View style={s.headerStat}>
                <Text style={[s.headerStatVal, { color: C.chartreuse }]}>AED 2,160</Text>
                <Text style={s.headerStatLabel}>VALUE</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Section 1: Time Reclaimed ─────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionTitle}>TIME RECLAIMED</Text>
            <TimeReclaimedSection />
          </Animated.View>

          {/* ── Section 2: Delegation Impact ─────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionTitle}>DELEGATION IMPACT</Text>
            <DelegationImpactSection />
          </Animated.View>

          {/* ── Section 3: System Performance ────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionTitle}>SYSTEM PERFORMANCE</Text>
            <SystemPerformanceSection />
          </Animated.View>

          {/* ── Section 4: Value Generated ───────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionTitle}>VALUE GENERATED</Text>
            <ValueGeneratedSection />
          </Animated.View>

          {/* ── Improve CTA ───────────────────────────────────────────────── */}
          <TouchableOpacity
            style={s.improveCTA}
            onPress={() => nav.navigate('buddy')}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.improveLabel}>WANT BETTER NUMBERS?</Text>
              <Text style={s.improveText}>Ask Buddy how to reclaim even more time this week</Text>
            </View>
            <Text style={{ color: C.verdigris, fontSize: 22 }}>›</Text>
          </TouchableOpacity>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <TabBar active="insights" onTab={(sc) => nav.navigate(sc)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  scrollContent:{ paddingHorizontal: 16, paddingBottom: 24 },

  // ── Header banner
  headerBanner: {
    marginBottom: 24,
    marginTop: 4,
    backgroundColor: C.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  headerAccentLine: { height: 3 },
  screenLabel:  {
    color: C.textTer, fontSize: 10, fontWeight: '700',
    letterSpacing: 2.5, marginTop: 18, marginHorizontal: 18,
  },
  screenTitle:  {
    color: C.white, fontSize: 34, fontWeight: '800',
    marginHorizontal: 18, marginTop: 4, letterSpacing: -0.5,
  },
  screenSubtitle: {
    color: C.textSec, fontSize: 13, marginHorizontal: 18,
    marginTop: 4, marginBottom: 20, lineHeight: 18,
  },
  headerStats:  {
    flexDirection: 'row', borderTopWidth: 1,
    borderColor: C.border, paddingVertical: 14,
  },
  headerStat:        { flex: 1, alignItems: 'center' },
  headerStatVal:     { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  headerStatLabel:   { color: C.textTer, fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  headerStatDivider: { width: 1, backgroundColor: C.border },

  // ── Section title
  sectionTitle: {
    color: C.textSec, fontSize: 11, fontWeight: '700',
    letterSpacing: 2, marginBottom: 8, marginTop: 8,
  },

  // ── Generic card
  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: 18, paddingBottom: 12,
  },
  cardLabel: { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  cardTitle: { color: C.white, fontSize: 16, fontWeight: '700' },
  trendBadge:{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  trendText: { fontSize: 11, fontWeight: '700' },

  // ── Time Reclaimed
  bigStatRow: {
    flexDirection: 'row', alignItems: 'baseline',
    paddingHorizontal: 18, marginBottom: 16,
  },
  bigStatNum: { fontSize: 42, fontWeight: '800', lineHeight: 46 },
  bigStatSub: { color: C.textSec, fontSize: 13, marginLeft: 8 },

  miniChart: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: 78, paddingHorizontal: 18, gap: 6, marginBottom: 18,
  },
  barCol:  { flex: 1, alignItems: 'center', gap: 5 },
  barWrap: { flex: 1, justifyContent: 'flex-end', width: '100%' },
  bar:     { width: '100%', borderRadius: 4, minHeight: 3 },
  barDay:  { color: C.textTer, fontSize: 10, fontWeight: '500' },

  catGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 18, gap: 10, marginBottom: 14,
  },
  catItem:  { flexDirection: 'row', alignItems: 'center', width: (width - 72) / 2, gap: 8 },
  catDot:   { width: 8, height: 8, borderRadius: 4 },
  catLabel: { color: C.textSec, fontSize: 12, flex: 1 },
  catVal:   { fontSize: 13, fontWeight: '700' },

  lifetimeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
    borderTopWidth: 1, borderColor: C.border,
  },
  lifetimeLabel: { color: C.textTer, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  lifetimeVal:   { fontSize: 18, fontWeight: '800' },

  // ── Delegation Impact
  triStatRow: {
    flexDirection: 'row', paddingHorizontal: 18,
    marginBottom: 20, paddingBottom: 18,
    borderBottomWidth: 1, borderColor: C.border,
  },
  triStat:    { flex: 1, alignItems: 'center' },
  triDivider: { width: 1, backgroundColor: C.border },
  triNum:     { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  triLabel:   { color: C.textSec, fontSize: 11, fontWeight: '500', textAlign: 'center' },

  subSectionLabel: {
    color: C.textTer, fontSize: 9, fontWeight: '700',
    letterSpacing: 2, paddingHorizontal: 18, marginBottom: 6,
  },

  activityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 12, gap: 12,
  },
  activityRowBorder: { borderBottomWidth: 1, borderColor: C.border },
  activityDot:   { width: 8, height: 8, borderRadius: 4 },
  activityTitle: { color: C.white, fontSize: 13, fontWeight: '500', marginBottom: 2 },
  activityTime:  { color: C.textTer, fontSize: 11 },
  activityBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activityBadgeText: { fontSize: 11, fontWeight: '600' },

  // ── System Performance
  perfRow:      { paddingHorizontal: 18 },
  perfLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  perfLabel:    { color: C.textSec, fontSize: 13, fontWeight: '500' },
  perfVal:      { fontSize: 13, fontWeight: '800' },
  perfTrack:    { height: 7, backgroundColor: C.surfaceEl, borderRadius: 4, overflow: 'hidden' },
  perfFill:     { height: '100%', borderRadius: 4 },

  metricGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 18, gap: 0, marginTop: 18,
    borderTopWidth: 1, borderColor: C.border,
  },
  metricItem:  {
    width: '50%', paddingVertical: 14, paddingHorizontal: 4,
    alignItems: 'center',
  },
  metricVal:   { fontSize: 22, fontWeight: '800', marginBottom: 3 },
  metricLabel: { color: C.textSec, fontSize: 11, textAlign: 'center' },

  zeroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 18, marginTop: 0, padding: 14,
    backgroundColor: `${C.verdigris}10`,
    borderRadius: 12, borderWidth: 1, borderColor: `${C.verdigris}25`,
  },
  zeroIcon: { color: C.verdigris, fontSize: 16, fontWeight: '700' },
  zeroText: { color: C.textSec, fontSize: 12, lineHeight: 17, flex: 1 },

  // ── Value Generated
  aedWrap: {
    flexDirection: 'row', alignItems: 'baseline',
    paddingHorizontal: 18, gap: 6, marginBottom: 4,
  },
  aedCurrency: { color: C.textSec, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  aedAmount:   { color: C.chartreuse, fontSize: 48, fontWeight: '800', lineHeight: 52 },
  aedNote:     { color: C.textTer, fontSize: 11, paddingHorizontal: 18, lineHeight: 16, marginBottom: 18 },

  breakdownList: {
    marginHorizontal: 18, marginBottom: 18,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  breakdownRow:   {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 13, backgroundColor: C.surfaceEl,
  },
  breakdownBorder:{ borderBottomWidth: 1, borderColor: C.border },
  breakdownLabel: { color: C.textSec, fontSize: 13 },
  breakdownAed:   { fontSize: 13, fontWeight: '700' },

  lifetimeValueCard: {
    flexDirection: 'row', alignItems: 'center',
    margin: 18, marginTop: 0, padding: 16,
    borderRadius: 14, borderWidth: 1, borderColor: `${C.chartreuse}25`,
  },
  lifetimeValueLabel: { color: C.white, fontSize: 12, fontWeight: '700', marginBottom: 3 },
  lifetimeValueNote:  { color: C.textSec, fontSize: 11 },
  lifetimeValueAed:   { color: C.chartreuse, fontSize: 20, fontWeight: '800' },

  // ── Improve CTA
  improveCTA: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: `${C.verdigris}10`, borderRadius: 16,
    padding: 16, marginBottom: 4,
    borderWidth: 1, borderColor: `${C.verdigris}25`,
  },
  improveLabel: { color: C.verdigris, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  improveText:  { color: C.textSec, fontSize: 13, lineHeight: 18 },

  // ── Tab bar (copied from HomeScreen)
  tabBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111111',
    borderTopWidth: 1, borderColor: C.border,
    paddingBottom: 20, paddingTop: 8,
    height: 80,
  },
  tabItem:  { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon:  { fontSize: 20, color: C.textTer },
  tabLabel: { fontSize: 10, color: C.textTer, fontWeight: '500' },
  tabDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: C.verdigris, marginTop: 2 },

  // ── Hologram orb
  orbWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    marginTop: -24,
  },
  orb: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orbWave:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  orbWaveBar: { width: 2.5, backgroundColor: '#FFFFFF', borderRadius: 2, opacity: 0.9 },
});
