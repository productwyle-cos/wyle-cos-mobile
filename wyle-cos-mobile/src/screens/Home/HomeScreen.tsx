import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions, Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// ─── Brand colors (from PDF) ───────────────────────────────────────────────────
const C = {
  bg: '#002F3A',
  surface: '#0A3D4A',
  surfaceEl: '#0F4A5A',
  verdigris: '#1B998B',
  chartreuse: '#D5FF3F',
  salmon: '#FF9F8A',
  crimson: '#D7263D',
  white: '#FEFFFE',
  textSec: '#8FB8BF',
  textTer: '#4A7A85',
  border: '#1A5060',
};

// ─── Mock data (replace with real API) ────────────────────────────────────────
const MOCK_USER = { name: 'Amrutha' };
const MOCK_LOS = 74;
const MOCK_ALERTS = [
  { id: '1', type: 'visa', title: 'UAE Residence Visa', daysUntil: 8, risk: 'high', emoji: '🛂' },
  { id: '2', type: 'car_reg', title: 'Car Registration', daysUntil: 22, risk: 'medium', emoji: '🚗' },
  { id: '3', type: 'emirates_id', title: 'Emirates ID', daysUntil: 45, risk: 'low', emoji: '🪪' },
];
const MOCK_STATS = { timeSaved: '4h 20m', decisions: 12, moneySaved: 'AED 0' };

// ─── LOS Ring Component ────────────────────────────────────────────────────────
function LOSRing({ score }: { score: number }) {
  const animVal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animVal, { toValue: score, duration: 1200, useNativeDriver: false }).start();
  }, []);

  const ringColor = score >= 70 ? C.verdigris : score >= 40 ? C.chartreuse : C.crimson;

  return (
    <View style={losStyles.container}>
      {/* Outer ring */}
      <View style={[losStyles.outerRing, { borderColor: `${ringColor}22` }]}>
        <View style={[losStyles.innerRing, { borderColor: `${ringColor}44` }]}>
          <View style={[losStyles.center, { backgroundColor: `${ringColor}11` }]}>
            <Text style={[losStyles.score, { color: ringColor }]}>{score}</Text>
            <Text style={losStyles.scoreLabel}>LOS</Text>
          </View>
        </View>
      </View>
      {/* Ring arc fill — simplified (use SVG in real app) */}
      <View style={[losStyles.arcFill, { borderColor: ringColor }]} />
    </View>
  );
}
const losStyles = StyleSheet.create({
  container: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  outerRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  innerRing: { width: 112, height: 112, borderRadius: 56, borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
  center: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 30, fontWeight: '800', lineHeight: 34 },
  scoreLabel: { fontSize: 11, color: C.textSec, fontWeight: '600', letterSpacing: 1 },
  arcFill: { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 8, borderTopColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: 'transparent', transform: [{ rotate: '-45deg' }] },
});

// ─── Obligation Alert Card ─────────────────────────────────────────────────────
function AlertCard({ item, onPress }: { item: typeof MOCK_ALERTS[0]; onPress: () => void }) {
  const riskColor = item.risk === 'high' ? C.crimson : item.risk === 'medium' ? C.chartreuse : C.verdigris;
  const riskBg = item.risk === 'high' ? '#D7263D18' : item.risk === 'medium' ? '#D5FF3F15' : '#1B998B15';

  return (
    <TouchableOpacity style={[styles.alertCard, { borderLeftColor: riskColor }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.alertIcon, { backgroundColor: riskBg }]}>
        <Text style={styles.alertEmoji}>{item.emoji}</Text>
      </View>
      <View style={styles.alertContent}>
        <Text style={styles.alertTitle}>{item.title}</Text>
        <Text style={[styles.alertDays, { color: riskColor }]}>
          {item.daysUntil === 0 ? 'Due today' : item.daysUntil < 0 ? `Overdue ${Math.abs(item.daysUntil)}d` : `${item.daysUntil} days`}
        </Text>
      </View>
      <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
    </TouchableOpacity>
  );
}

// ─── Quick Action Button ───────────────────────────────────────────────────────
function QuickAction({ emoji, label, color, onPress }: { emoji: string; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.quickAction, { borderColor: `${color}33` }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.quickActionIcon, { backgroundColor: `${color}15` }]}>
        <Text style={styles.quickActionEmoji}>{emoji}</Text>
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: any) {
  const headerFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(30)).current;
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(contentSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const highRiskCount = MOCK_ALERTS.filter(a => a.risk === 'high').length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <SafeAreaView>
        <Animated.View style={[styles.header, { opacity: headerFade }]}>
          <View>
            {/* Montserrat subtitle usage from brand doc */}
            <Text style={styles.headerGreeting}>{greeting}</Text>
            {/* Poppins headline usage from brand doc */}
            <Text style={styles.headerName}>{MOCK_USER.name} ✦</Text>
          </View>
          <TouchableOpacity style={styles.notifBell}>
            {highRiskCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{highRiskCount}</Text>
              </View>
            )}
            <Text style={{ fontSize: 22 }}>🔔</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── LOS + Stats strip ───────────────────────────────────────────────── */}
        <Animated.View style={[styles.losSection, { opacity: headerFade, transform: [{ translateY: contentSlide }] }]}>
          <LOSRing score={MOCK_LOS} />
          <View style={styles.statsColumn}>
            <Text style={styles.statsTitle}>This week</Text>
            {[
              { label: 'Time saved', value: MOCK_STATS.timeSaved, color: C.verdigris },
              { label: 'Decisions', value: String(MOCK_STATS.decisions), color: C.chartreuse },
              { label: 'Saved', value: MOCK_STATS.moneySaved, color: C.salmon },
            ].map((s, i) => (
              <View key={i} style={styles.statRow}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Morning brief banner ─────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.briefBanner} activeOpacity={0.85}>
          <View style={styles.briefLeft}>
            <Text style={styles.briefLabel}>MORNING BRIEF</Text>
            <Text style={styles.briefText}>
              You have {MOCK_ALERTS.length} items requiring attention. Visa renewal is most urgent.
            </Text>
          </View>
          <Text style={styles.briefArrow}>›</Text>
        </TouchableOpacity>

        {/* ── Urgent obligations ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            {/* Section label uses Montserrat per brand doc */}
            <Text style={styles.sectionTitle}>Needs attention</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Obligations')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {MOCK_ALERTS.map(item => (
            <AlertCard key={item.id} item={item} onPress={() => {}} />
          ))}
        </View>

        {/* ── Quick actions ────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.quickActionsGrid}>
            <QuickAction emoji="🍽️" label="Order food" color={C.salmon} onPress={() => navigation.navigate('Food')} />
            <QuickAction emoji="◎" label="Ask Buddy" color={C.verdigris} onPress={() => navigation.navigate('Buddy')} />
            <QuickAction emoji="📋" label="Obligations" color={C.chartreuse} onPress={() => navigation.navigate('Obligations')} />
            <QuickAction emoji="◈" label="Insights" color={C.textSec} onPress={() => navigation.navigate('Insights')} />
          </View>
        </View>

        {/* ── Slogan strip ─────────────────────────────────────────────────────── */}
        <View style={styles.sloganStrip}>
          <Text style={styles.sloganText}>From 'I need to' → </Text>
          <Text style={[styles.sloganText, { color: C.chartreuse, fontWeight: '700' }]}>done.</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 20 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerGreeting: {
    color: C.textSec,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
    // fontFamily: 'Montserrat_400Regular'
  },
  headerName: {
    color: C.white,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    // fontFamily: 'Poppins_700Bold'
  },
  notifBell: { position: 'relative', padding: 4 },
  notifBadge: {
    position: 'absolute',
    top: 0, right: 0,
    width: 16, height: 16,
    borderRadius: 8,
    backgroundColor: C.crimson,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  notifBadgeText: { color: C.white, fontSize: 9, fontWeight: '800' },

  // ── LOS section ─────────────────────────────────────────────────────────────
  losSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: C.surface,
    marginHorizontal: 16,
    borderRadius: 20,
    gap: 20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  statsColumn: { flex: 1, gap: 8 },
  statsTitle: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
    // fontFamily: 'Inter_600SemiBold'
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statLabel: { color: C.textSec, fontSize: 13 },
  statValue: { fontSize: 14, fontWeight: '700' },

  // ── Brief banner ─────────────────────────────────────────────────────────────
  briefBanner: {
    backgroundColor: `${C.verdigris}15`,
    borderWidth: 1,
    borderColor: `${C.verdigris}30`,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  briefLeft: { flex: 1 },
  briefLabel: {
    color: C.verdigris,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
    // fontFamily: 'Inter_700Bold'
  },
  briefText: {
    color: C.textSec,
    fontSize: 13,
    lineHeight: 18,
    // fontFamily: 'Inter_400Regular'
  },
  briefArrow: { color: C.verdigris, fontSize: 28, fontWeight: '300' },

  // ── Section ──────────────────────────────────────────────────────────────────
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: {
    color: C.white,
    fontSize: 17,
    fontWeight: '600',
    // fontFamily: 'Montserrat_600SemiBold'
  },
  seeAll: { color: C.verdigris, fontSize: 13, fontWeight: '500' },

  // ── Alert card ────────────────────────────────────────────────────────────────
  alertCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderLeftWidth: 3,
    gap: 12,
  },
  alertIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  alertEmoji: { fontSize: 22 },
  alertContent: { flex: 1 },
  alertTitle: {
    color: C.white,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    // fontFamily: 'Inter_600SemiBold'
  },
  alertDays: { fontSize: 12, fontWeight: '700' },
  riskDot: { width: 8, height: 8, borderRadius: 4 },

  // ── Quick actions ──────────────────────────────────────────────────────────
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  quickAction: {
    width: (width - 52) / 2,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
  },
  quickActionIcon: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActionEmoji: { fontSize: 26 },
  quickActionLabel: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
    // fontFamily: 'Inter_600SemiBold'
  },

  // ── Slogan strip ───────────────────────────────────────────────────────────
  sloganStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: `${C.surface}88`,
    borderRadius: 12,
  },
  sloganText: {
    color: C.textSec,
    fontSize: 15,
    fontWeight: '500',
    // fontFamily: 'Montserrat_400Regular'
  },
});
