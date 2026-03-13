// src/screens/Home/HomeScreen.tsx
// Fixed: navigation prop is now safely handled

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions, Animated, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { generateBrief, getBriefKey, getBriefTimeOfDay, isBriefStale } from '../../services/briefService';

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

const MOCK_LOS = 74;
const MOCK_ALERTS = [
  { id: '1', emoji: '🛂', title: 'UAE Residence Visa',  daysUntil: 8,  risk: 'high'   },
  { id: '2', emoji: '🚗', title: 'Car Registration',    daysUntil: 22, risk: 'medium' },
  { id: '3', emoji: '🪪', title: 'Emirates ID',         daysUntil: 45, risk: 'low'    },
];

// ── LOS Ring ──────────────────────────────────────────────────────────────────
function LOSRing({ score }: { score: number }) {
  const ringColor = score >= 70 ? C.verdigris : score >= 40 ? C.chartreuse : C.crimson;
  return (
    <View style={ring.container}>
      <View style={[ring.outer, { borderColor: `${ringColor}22` }]}>
        <View style={[ring.inner, { borderColor: ringColor }]}>
          <View style={ring.center}>
            <Text style={[ring.score, { color: ringColor }]}>{score}</Text>
            <Text style={ring.label}>LOS</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
const ring = StyleSheet.create({
  container: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  outer:  { width: 130, height: 130, borderRadius: 65, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inner:  { width: 106, height: 106, borderRadius: 53, borderWidth: 7, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  score:  { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  label:  { fontSize: 10, color: C.textSec, fontWeight: '700', letterSpacing: 1 },
});

// ── Alert Card ────────────────────────────────────────────────────────────────
function AlertCard({ item }: { item: typeof MOCK_ALERTS[0] }) {
  const riskColor = item.risk === 'high' ? C.crimson : item.risk === 'medium' ? C.chartreuse : C.verdigris;
  return (
    <View style={[styles.alertCard, { borderLeftColor: riskColor }]}>
      <View style={[styles.alertIcon, { backgroundColor: `${riskColor}18` }]}>
        <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle}>{item.title}</Text>
        <Text style={[styles.alertDays, { color: riskColor }]}>
          {item.daysUntil === 0 ? 'Due today' : `${item.daysUntil} days`}
        </Text>
      </View>
      <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
    </View>
  );
}

// ── Quick Action ──────────────────────────────────────────────────────────────
function QuickAction({ emoji, label, color, onPress }: any) {
  return (
    <TouchableOpacity
      style={[styles.quickAction, { borderColor: `${color}33` }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.qaIcon, { backgroundColor: `${color}15` }]}>
        <Text style={{ fontSize: 24 }}>{emoji}</Text>
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Bottom Tab Bar ────────────────────────────────────────────────────────────
function TabBar({ active, onTab }: { active: string; onTab: (s: any) => void }) {
  const tabs = [
    { screen: 'home',        emoji: '⌂', label: 'Home'    },
    { screen: 'obligations', emoji: '📋', label: 'Tasks'   },
    { screen: 'buddy',       emoji: '◎',  label: 'Buddy'   },
    { screen: 'insights',    emoji: '◈',  label: 'Insights'},
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

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: { navigation: NavProp }) {
  // Safe navigation — won't crash if null
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const obligations    = useAppStore(s => s.obligations);
  const morningBrief   = useAppStore(s => s.morningBrief);
  const setMorningBrief= useAppStore(s => s.setMorningBrief);
  const lastBriefKey   = useAppStore(s => s.lastBriefKey);
  const setLastBriefKey= useAppStore(s => s.setLastBriefKey);

  const fadeIn    = useRef(new Animated.Value(0)).current;
  const slideUp   = useRef(new Animated.Value(24)).current;
  const [greeting, setGreeting]       = useState('Good morning');
  const [briefLoading, setBriefLoading] = useState(false);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();

    // Auto-generate brief once per morning/evening period
    if (isBriefStale(lastBriefKey)) {
      setBriefLoading(true);
      generateBrief(obligations, MOCK_LOS)
        .then(brief => {
          setMorningBrief(brief);
          setLastBriefKey(getBriefKey());
        })
        .catch(() => {/* keep existing brief on error */})
        .finally(() => setBriefLoading(false));
    }
  }, []);

  const isEvening = getBriefTimeOfDay() === 'evening';
  const highCount = MOCK_ALERTS.filter(a => a.risk === 'high').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']}>
        <Animated.View style={[styles.header, { opacity: fadeIn }]}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.name}>Amrutha ✦</Text>
          </View>
          <View style={styles.bellWrap}>
            {highCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{highCount}</Text>
              </View>
            )}
            <Text style={{ fontSize: 22 }}>🔔</Text>
          </View>
        </Animated.View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── LOS + Stats ─────────────────────────────────────────────────── */}
        <Animated.View style={[styles.losCard, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          <LOSRing score={MOCK_LOS} />
          <View style={styles.statsCol}>
            <Text style={styles.statsHeading}>This week</Text>
            {[
              { label: 'Time saved',  value: '4h 20m',  color: C.verdigris  },
              { label: 'Decisions',   value: '12',       color: C.chartreuse },
              { label: 'AED saved',   value: '0',        color: C.salmon     },
            ].map((s, i) => (
              <View key={i} style={styles.statRow}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Morning / Evening Brief ─────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeIn }}>
          <TouchableOpacity
            style={styles.brief}
            onPress={() => nav.navigate('morningBrief')}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.briefLabel}>
                {isEvening ? '🌙 EVENING RECAP' : '☀️ MORNING BRIEF'}
              </Text>
              {briefLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <ActivityIndicator color={C.verdigris} size="small" />
                  <Text style={[styles.briefText, { color: C.textTer }]}>Buddy is preparing your brief…</Text>
                </View>
              ) : morningBrief ? (
                <Text style={styles.briefText} numberOfLines={2}>{morningBrief.headline}</Text>
              ) : (
                <Text style={styles.briefText}>
                  {highCount} urgent item{highCount !== 1 ? 's' : ''} need your attention.
                </Text>
              )}
            </View>
            <Text style={{ color: C.verdigris, fontSize: 26 }}>›</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Alerts ──────────────────────────────────────────────────────── */}
        <Animated.View style={[styles.section, { opacity: fadeIn }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <TouchableOpacity onPress={() => nav.navigate('obligations')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {MOCK_ALERTS.map(item => <AlertCard key={item.id} item={item} />)}
        </Animated.View>

        {/* ── Quick Actions ────────────────────────────────────────────────── */}
        <Animated.View style={[styles.section, { opacity: fadeIn }]}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.qaGrid}>
            <QuickAction emoji="◎"  label="Ask Buddy"    color={C.verdigris}  onPress={() => nav.navigate('buddy')}       />
            <QuickAction emoji="📋" label="Obligations"  color={C.chartreuse} onPress={() => nav.navigate('obligations')} />
            <QuickAction emoji="◈"  label="Insights"     color={C.textSec}    onPress={() => nav.navigate('insights')}    />
          </View>
        </Animated.View>

        {/* ── Slogan ───────────────────────────────────────────────────────── */}
        <View style={styles.slogan}>
          <Text style={styles.sloganText}>From 'I need to' → </Text>
          <Text style={[styles.sloganText, { color: C.chartreuse, fontWeight: '700' }]}>done.</Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Bottom Tab Bar ───────────────────────────────────────────────────── */}
      <TabBar active="home" onTab={(s) => nav.navigate(s)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  greeting:{ color: C.textSec, fontSize: 13, fontWeight: '500' },
  name:    { color: C.white,   fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  bellWrap:{ position: 'relative', padding: 4 },
  badge:   { position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: C.crimson, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  badgeText: { color: C.white, fontSize: 9, fontWeight: '800' },

  losCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, marginHorizontal: 16, borderRadius: 20, padding: 20, gap: 20, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  statsCol:{ flex: 1, gap: 8 },
  statsHeading: { color: C.textSec, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel:{ color: C.textSec, fontSize: 13 },
  statValue:{ fontSize: 13, fontWeight: '700' },

  brief: { backgroundColor: `${C.verdigris}12`, borderWidth: 1, borderColor: `${C.verdigris}28`, marginHorizontal: 16, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  briefLabel: { color: C.verdigris, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  briefText:  { color: C.textSec, fontSize: 13, lineHeight: 18 },

  section:      { paddingHorizontal: 16, marginBottom: 22 },
  sectionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: C.white, fontSize: 16, fontWeight: '600' },
  seeAll:       { color: C.verdigris, fontSize: 13 },

  alertCard: { backgroundColor: C.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, gap: 12 },
  alertIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alertTitle:{ color: C.white, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  alertDays: { fontSize: 12, fontWeight: '700' },
  riskDot:   { width: 8, height: 8, borderRadius: 4 },

  qaGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  quickAction:{ width: (width - 52) / 2, backgroundColor: C.surface, borderRadius: 16, padding: 16, alignItems: 'center', gap: 10, borderWidth: 1 },
  qaIcon:    { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  qaLabel:   { color: C.white, fontSize: 13, fontWeight: '600' },

  slogan:    { flexDirection: 'row', justifyContent: 'center', paddingVertical: 14, marginHorizontal: 16, backgroundColor: `${C.surface}88`, borderRadius: 12 },
  sloganText:{ color: C.textSec, fontSize: 14, fontWeight: '500' },
});
