// src/screens/Home/HomeScreen.tsx
// Redesigned to match Figma: near-black bg, stats bar, urgent card,
// priority tasks with gradient borders, ready-to-execute, 5-tab bar
// with animated pulsing/tilting hologram centre button.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { generateBrief, getBriefKey, getBriefTimeOfDay, isBriefStale } from '../../services/briefService';

const { width } = Dimensions.get('window');

// ── Colours (Figma palette) ───────────────────────────────────────────────────
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

// ── Time helpers ──────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
function getTimeString() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Mock data (named constants — not inline magic numbers) ────────────────────
const MOCK_STATS = {
  hoursSaved: 4.5,
  running:    7,
  reliable:   99,
};

const MOCK_ALERTS = [
  { id: '1', title: 'Emirates ID expires in 5 days',       subtitle: 'Renewal process takes 3-5 days',  daysUntil: 5,  risk: 'high',   category: '🪪' },
  { id: '2', title: 'Range Rover registration',             subtitle: 'Due February 12, 2026',           daysUntil: 7,  risk: 'high',   category: '🚗' },
  { id: '3', title: 'Driver visa renewal',                  subtitle: 'Process begins Feb 10',           daysUntil: 14, risk: 'medium', category: '🛂' },
  { id: '4', title: 'School fee',                           subtitle: 'AED 24,500',                      daysUntil: 21, risk: 'medium', category: '🏫' },
];

const MOCK_EXECUTE = [
  { id: 'e1', title: 'Draft visa renewal application', confidence: 94, saves: '1.2h', reviewTime: '6m'  },
  { id: 'e2', title: 'Schedule Range Rover service',   confidence: 91, saves: '45m',  reviewTime: '12m' },
];

// ── Urgency colour helper ─────────────────────────────────────────────────────
function riskColor(risk: string, days: number): string {
  if (risk === 'high'   || days <= 7)  return C.crimson;
  if (risk === 'medium' || days <= 21) return C.orange;
  return C.verdigris;
}

// ── Task card top-border gradient colours ─────────────────────────────────────
function taskGradient(days: number): [string, string, string] {
  if (days <= 7)  return [C.crimson,  C.orange,     C.chartreuse];
  if (days <= 21) return [C.orange,   C.chartreuse, C.verdigris];
  return                 [C.verdigris, C.chartreuse, C.verdigris];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar() {
  return (
    <View style={s.statsBar}>
      <View style={s.statItem}>
        <Text style={s.statValue}>{MOCK_STATS.hoursSaved}</Text>
        <Text style={s.statLabel}>HRS SAVED</Text>
      </View>
      <View style={s.statDivider} />
      <View style={s.statItem}>
        <Text style={[s.statValue, { color: C.verdigris }]}>{MOCK_STATS.running}</Text>
        <Text style={s.statLabel}>RUNNING</Text>
      </View>
      <View style={s.statDivider} />
      <View style={s.statItem}>
        <Text style={[s.statValue, { color: C.chartreuse }]}>{MOCK_STATS.reliable}%</Text>
        <Text style={s.statLabel}>RELIABLE</Text>
      </View>
    </View>
  );
}

// ── Urgent Card (most critical alert) ────────────────────────────────────────
function UrgentCard({ alert, onPress }: { alert: typeof MOCK_ALERTS[0]; onPress: () => void }) {
  return (
    <View style={s.urgentCard}>
      {/* Top row: badge + days */}
      <View style={s.urgentTop}>
        <View style={s.urgentBadge}>
          <View style={s.urgentDot} />
          <Text style={s.urgentBadgeText}>URGENT</Text>
        </View>
        <View style={s.urgentDaysWrap}>
          <Text style={s.urgentDaysNum}>{alert.daysUntil}</Text>
          <Text style={s.urgentDaysLabel}>DAYS</Text>
        </View>
      </View>
      {/* Content */}
      <Text style={s.urgentTitle}>{alert.title}</Text>
      <Text style={s.urgentSub}>{alert.subtitle}</Text>
      {/* CTA */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={[C.salmon, C.crimson]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.urgentBtn}
        >
          <Text style={s.urgentBtnText}>Handle with Buddy</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ── Featured Task Card (largest) ──────────────────────────────────────────────
function FeaturedTaskCard({ item, onPress }: { item: typeof MOCK_ALERTS[0]; onPress: () => void }) {
  const rc = riskColor(item.risk, item.daysUntil);
  const [g1, g2, g3] = taskGradient(item.daysUntil);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.featuredCard}>
      {/* Top gradient border */}
      <LinearGradient colors={[g1, g2, g3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.featuredBorder} />
      <View style={s.featuredInner}>
        <View style={[s.daysBadge, { backgroundColor: `${rc}22`, borderColor: `${rc}44` }]}>
          <Text style={[s.daysBadgeText, { color: rc }]}>{item.daysUntil} DAYS</Text>
        </View>
        <Text style={s.featuredTitle}>{item.title}</Text>
        <Text style={s.featuredSub}>{item.subtitle}</Text>
        <Text style={s.featuredArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Small Task Card ───────────────────────────────────────────────────────────
function SmallTaskCard({ item, onPress }: { item: typeof MOCK_ALERTS[0]; onPress: () => void }) {
  const rc = riskColor(item.risk, item.daysUntil);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.smallCard}>
      <Text style={s.smallCardTitle}>{item.title}</Text>
      <Text style={s.smallCardSub} numberOfLines={1}>{item.subtitle}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 8 }}>
        <Text style={[s.smallDaysNum, { color: rc }]}>{item.daysUntil}</Text>
        <Text style={s.smallDaysLabel}>DAYS</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Execute Card ──────────────────────────────────────────────────────────────
function ExecuteCard({ item, onApprove, onReview }: {
  item: typeof MOCK_EXECUTE[0];
  onApprove: () => void;
  onReview:  () => void;
}) {
  const confColor = item.confidence >= 90 ? C.chartreuse : C.orange;
  return (
    <View style={s.executeCard}>
      <View style={s.executeTop}>
        <Text style={s.executeTitle}>{item.title}</Text>
        <View style={[s.confBadge, { backgroundColor: `${confColor}22` }]}>
          <Text style={[s.confText, { color: confColor }]}>{item.confidence}%</Text>
        </View>
      </View>
      <Text style={s.executeMeta}>
        <Text style={{ color: C.verdigris }}>●</Text>
        {`  saves ${item.saves}  |  ${item.reviewTime} to review`}
      </Text>
      <View style={s.executeBtns}>
        <TouchableOpacity onPress={onApprove} activeOpacity={0.85} style={{ flex: 1 }}>
          <LinearGradient
            colors={[C.chartreuse, C.chartreuseB]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.approveBtn}
          >
            <Text style={s.approveBtnText}>Approve & Execute</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={onReview} activeOpacity={0.85} style={s.reviewBtn}>
          <Text style={s.reviewBtnText}>Review</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Animated Hologram Orb (centre tab) ───────────────────────────────────────
function HologramOrb({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tilt  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Expand / shrink pulse
    Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.14, duration: 1800, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 1800, useNativeDriver: true }),
    ])).start();
    // Slow tilt
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
          {/* Mini waveform */}
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

// ── 5-item Tab Bar ────────────────────────────────────────────────────────────
const TAB_ITEMS = [
  { key: 'home',        icon: '⊙',  label: 'Home'        },
  { key: 'obligations', icon: '✦',  label: 'Automations' },
  { key: 'buddy',       icon: 'orb', label: ''            }, // centre orb
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
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const obligations     = useAppStore(st => st.obligations);
  const morningBrief    = useAppStore(st => st.morningBrief);
  const setMorningBrief = useAppStore(st => st.setMorningBrief);
  const lastBriefKey    = useAppStore(st => st.lastBriefKey);
  const setLastBriefKey = useAppStore(st => st.setLastBriefKey);
  const googleConnected = useAppStore(st => st.googleConnected);

  const [userName, setUserName]   = useState('');
  const [timeStr,  setTimeStr]    = useState(getTimeString());
  const [greeting, setGreeting]   = useState(getGreeting());
  const [briefLoading, setBriefLoading] = useState(false);

  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;

  // Derive data from mock + store
  const urgentAlert    = MOCK_ALERTS.find(a => a.risk === 'high') ?? null;
  const featuredTask   = MOCK_ALERTS[1] ?? null; // second high-priority task
  const gridTasks      = MOCK_ALERTS.slice(2);   // rest in 2-col grid
  const activeCount    = MOCK_ALERTS.filter(a => a.daysUntil <= 30).length;
  const isEvening      = getBriefTimeOfDay() === 'evening';

  useEffect(() => {
    // Load user name
    AsyncStorage.getItem('wyle_user').then(json => {
      if (json) {
        try { setUserName(JSON.parse(json).name?.split(' ')[0] || ''); } catch {}
      }
    });

    // Update clock every minute
    const tick = setInterval(() => {
      setTimeStr(getTimeString());
      setGreeting(getGreeting());
    }, 60_000);

    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();

    // Generate brief once per period
    if (isBriefStale(lastBriefKey)) {
      setBriefLoading(true);
      generateBrief(obligations, MOCK_STATS.reliable)
        .then(brief => { setMorningBrief(brief); setLastBriefKey(getBriefKey()); })
        .catch(() => {})
        .finally(() => setBriefLoading(false));
    }

    return () => clearInterval(tick);
  }, []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']}>
        <Animated.View style={[s.header, { opacity: fadeIn }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.timeText}>{timeStr}</Text>
            <Text style={s.greetingText}>{greeting}</Text>
            {!!userName && <Text style={s.nameText}>{userName}</Text>}
            <Text style={s.subtitleText}>Your digital chief of staff is active</Text>
          </View>
          {/* Status dots */}
          <View style={s.statusDots}>
            <View style={[s.statusDot, { backgroundColor: C.textTer }]} />
            <View style={[s.statusDot, { backgroundColor: C.textTer }]} />
            <View style={[s.statusDot, { backgroundColor: C.white   }]} />
          </View>
        </Animated.View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>

        {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideUp }] }}>
          <StatsBar />
        </Animated.View>

        {/* ── Urgent Card ────────────────────────────────────────────────────── */}
        {urgentAlert && (
          <Animated.View style={{ opacity: fadeIn }}>
            <UrgentCard
              alert={urgentAlert}
              onPress={() => nav.navigate('buddy')}
            />
          </Animated.View>
        )}

        {/* ── Life Signal Banner (if Gmail not connected) ─────────────────── */}
        {!googleConnected && (
          <Animated.View style={{ opacity: fadeIn }}>
            <TouchableOpacity
              style={s.signalBanner}
              onPress={() => nav.navigate('connect')}
              activeOpacity={0.85}
            >
              <Text style={s.signalEmoji}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.signalTitle}>Connect Gmail & Calendar</Text>
                <Text style={s.signalSub}>Let Buddy auto-detect obligations from your inbox</Text>
              </View>
              <Text style={{ color: C.chartreuse, fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Priority Tasks ─────────────────────────────────────────────────── */}
        <Animated.View style={[s.section, { opacity: fadeIn }]}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>PRIORITY TASKS</Text>
            <View style={s.activeBadge}>
              <Text style={s.activeBadgeText}>{activeCount} Active</Text>
            </View>
          </View>

          {featuredTask && (
            <FeaturedTaskCard item={featuredTask} onPress={() => nav.navigate('obligations')} />
          )}

          {/* 2-column grid for remaining tasks */}
          {gridTasks.length > 0 && (
            <View style={s.taskGrid}>
              {gridTasks.map(item => (
                <SmallTaskCard key={item.id} item={item} onPress={() => nav.navigate('obligations')} />
              ))}
            </View>
          )}
        </Animated.View>

        {/* ── Ready to Execute ───────────────────────────────────────────────── */}
        <Animated.View style={[s.section, { opacity: fadeIn }]}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>READY TO EXECUTE</Text>
            <View style={s.activeBadge}>
              <Text style={s.activeBadgeText}>{MOCK_EXECUTE.length}</Text>
            </View>
          </View>
          {MOCK_EXECUTE.map(item => (
            <ExecuteCard
              key={item.id}
              item={item}
              onApprove={() => nav.navigate('buddy')}
              onReview={() => nav.navigate('buddy')}
            />
          ))}
        </Animated.View>

        {/* ── Quick Actions ──────────────────────────────────────────────────── */}
        <Animated.View style={[s.section, { opacity: fadeIn }]}>
          <Text style={s.sectionTitle}>QUICK ACTIONS</Text>
          <View style={s.qaGrid}>
            {[
              { label: 'Automations', icon: '✦', screen: 'obligations' },
              { label: 'Insights',    icon: '▦', screen: 'insights'    },
            ].map(qa => (
              <TouchableOpacity
                key={qa.label}
                style={s.qaCard}
                onPress={() => nav.navigate(qa.screen as any)}
                activeOpacity={0.85}
              >
                <Text style={s.qaIcon}>{qa.icon}</Text>
                <Text style={s.qaLabel}>{qa.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

      </ScrollView>

      {/* ── Tab Bar ────────────────────────────────────────────────────────────── */}
      <TabBar active="home" onTab={(sc) => nav.navigate(sc)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const ORB_SIZE = 58;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12,
  },
  timeText:     { color: C.textTer, fontSize: 12, fontWeight: '500', marginBottom: 2 },
  greetingText: { color: C.white,   fontSize: 28, fontWeight: '300' },
  nameText:     { color: C.verdigris, fontSize: 28, fontWeight: '700', marginBottom: 2 },
  subtitleText: { color: C.textSec, fontSize: 12 },
  statusDots:   { flexDirection: 'row', gap: 5, paddingTop: 6 },
  statusDot:    { width: 8, height: 8, borderRadius: 4 },

  // ── Stats bar
  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, marginHorizontal: 16, borderRadius: 16,
    paddingVertical: 18, marginBottom: 14,
    borderWidth: 1, borderColor: C.border,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: C.border },
  statValue:   { color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 3 },
  statLabel:   { color: C.textSec, fontSize: 10, fontWeight: '600', letterSpacing: 1 },

  // ── Urgent card
  urgentCard: {
    marginHorizontal: 16, marginBottom: 14,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)',
  },
  urgentTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  urgentBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,59,48,0.18)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  urgentDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: C.crimson },
  urgentBadgeText:{ color: C.crimson, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  urgentDaysWrap: { alignItems: 'flex-end' },
  urgentDaysNum:  { color: C.crimson, fontSize: 28, fontWeight: '800', lineHeight: 30 },
  urgentDaysLabel:{ color: C.crimson, fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  urgentTitle:    { color: C.white, fontSize: 18, fontWeight: '600', marginBottom: 5 },
  urgentSub:      { color: C.textSec, fontSize: 13, marginBottom: 16 },
  urgentBtn:      { borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  urgentBtnText:  { color: C.white, fontSize: 15, fontWeight: '700' },

  // ── Section headers
  section:    { paddingHorizontal: 16, marginBottom: 22 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle:{ color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  activeBadge:{ backgroundColor: `${C.verdigris}20`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: `${C.verdigris}40` },
  activeBadgeText: { color: C.verdigris, fontSize: 12, fontWeight: '600' },

  // ── Featured task card
  featuredCard: {
    backgroundColor: C.surface, borderRadius: 16,
    overflow: 'hidden', marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  featuredBorder: { height: 3 },
  featuredInner:  { padding: 16 },
  daysBadge:      { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, marginBottom: 10 },
  daysBadgeText:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  featuredTitle:  { color: C.white, fontSize: 18, fontWeight: '600', marginBottom: 5 },
  featuredSub:    { color: C.textSec, fontSize: 13 },
  featuredArrow:  { position: 'absolute', right: 16, top: 20, color: C.textSec, fontSize: 20 },

  // ── Task grid
  taskGrid: { flexDirection: 'row', gap: 10 },
  smallCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
  },
  smallCardTitle:  { color: C.white, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  smallCardSub:    { color: C.textSec, fontSize: 12 },
  smallDaysNum:    { fontSize: 22, fontWeight: '800' },
  smallDaysLabel:  { color: C.textSec, fontSize: 11, fontWeight: '600' },

  // ── Execute cards
  executeCard: {
    backgroundColor: C.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.border, marginBottom: 10,
  },
  executeTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  executeTitle: { color: C.white, fontSize: 15, fontWeight: '600', flex: 1, marginRight: 10 },
  confBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  confText:     { fontSize: 13, fontWeight: '700' },
  executeMeta:  { color: C.textSec, fontSize: 12, marginBottom: 14 },
  executeBtns:  { flexDirection: 'row', gap: 10 },
  approveBtn:   { borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  approveBtnText:{ color: C.bg, fontSize: 13, fontWeight: '800' },
  reviewBtn:    { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  reviewBtnText:{ color: C.white, fontSize: 13, fontWeight: '600' },

  // ── Quick actions
  qaGrid: { flexDirection: 'row', gap: 10, marginTop: 8 },
  qaCard: {
    flex: 1, backgroundColor: C.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border, gap: 8,
  },
  qaIcon:  { fontSize: 22, color: C.textSec },
  qaLabel: { color: C.white, fontSize: 14, fontWeight: '600' },

  // ── Life signal banner
  signalBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: `${C.chartreuse}10`, borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginBottom: 14,
    borderWidth: 1, borderColor: `${C.chartreuse}28`,
  },
  signalEmoji: { fontSize: 20 },
  signalTitle: { color: C.chartreuse, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  signalSub:   { color: C.textSec, fontSize: 11 },

  // ── Tab bar
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

  // ── Hologram orb (centre tab)
  orbWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    marginTop: -24, // lifts the orb above the tab bar
  },
  orb: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orbWave:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  orbWaveBar: { width: 2.5, backgroundColor: '#FFFFFF', borderRadius: 2, opacity: 0.9 },
});
