// src/screens/Home/HomeScreen.tsx
// Redesigned to match Figma: near-black bg, stats bar, urgent card,
// priority tasks with gradient borders, ready-to-execute, 5-tab bar
// with animated pulsing/tilting hologram centre button.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, StatusBar, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { UIObligation } from '../../types';
import { generateBrief, getBriefKey, getBriefTimeOfDay, isBriefStale } from '../../services/briefService';
import { signInWithGoogle, isGoogleConnected, handleGoogleOAuthCallback } from '../../services/googleAuthService';
import { runFullSignalScan } from '../../services/signalService';

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

// ── Static stats (will be replaced by real data once backend is live) ─────────
const MOCK_STATS = {
  hoursSaved: 4.5,
  running:    7,
  reliable:   99,
};

// ── Derive a "Ready to Execute" item from a real obligation ───────────────────
// ── Official Google "G" — exact SVG paths from Google's brand assets ─────────
const GOOGLE_G_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 533.5 544.3">
  <path fill="#4285F4"
    d="M533.5 278.4c0-18.5-1.5-37.1-4.7-55.3H272.1v104.8h147
       c-6.1 33.8-25.7 63.7-54.4 82.7v68h87.7
       c51.5-47.4 81.1-117.4 81.1-200.2z"/>
  <path fill="#34A853"
    d="M272.1 544.3c73.4 0 135.3-24.1 180.4-65.7l-87.7-68
       c-24.4 16.6-55.9 26-92.6 26-71 0-131.2-47.9-152.8-112.3H28.9v70.1
       c46.2 91.9 140.3 149.9 243.2 149.9z"/>
  <path fill="#FBBC05"
    d="M119.3 324.3c-11.4-33.8-11.4-70.4 0-104.2V150H28.9
       c-38.6 76.9-38.6 167.5 0 244.4l90.4-70.1z"/>
  <path fill="#EA4335"
    d="M272.1 107.7c38.8-.6 76.3 14 104.4 40.8l77.7-77.7
       C405 24.6 339.7-.8 272.1 0 169.2 0 75.1 58 28.9 150l90.4 70.1
       c21.5-64.5 81.8-112.4 152.8-112.4z"/>
</svg>`;

function GoogleLogo() {
  return <SvgXml xml={GOOGLE_G_SVG} width={22} height={22} />;
}

function toExecuteItem(ob: UIObligation) {
  const conf  = ob.risk === 'high' ? 94 : ob.risk === 'medium' ? 88 : 76;
  const saves = ['visa', 'emirates_id'].includes(ob.type)           ? '1.2h'
              : ['car_registration', 'insurance'].includes(ob.type) ? '45m'
              : '20m';
  return { id: ob._id, title: ob.executionPath, confidence: conf, saves, reviewTime: '8m' };
}

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
function UrgentCard({ alert, onPress }: { alert: UIObligation; onPress: () => void }) {
  const dueLabel = alert.daysUntil === 0 ? 'TODAY' : `${alert.daysUntil}d`;
  const subtitle = alert.notes ?? alert.executionPath;
  return (
    <View style={s.urgentCard}>
      {/* Top row: emoji + badge + days */}
      <View style={s.urgentTop}>
        <View style={s.urgentBadge}>
          <View style={s.urgentDot} />
          <Text style={s.urgentBadgeText}>URGENT</Text>
        </View>
        <View style={s.urgentDaysWrap}>
          <Text style={s.urgentDaysNum}>{dueLabel}</Text>
          {alert.daysUntil > 0 && <Text style={s.urgentDaysLabel}>DAYS</Text>}
        </View>
      </View>
      {/* Content */}
      <Text style={s.urgentTitle}>{alert.emoji}  {alert.title}</Text>
      <Text style={s.urgentSub}>{subtitle}</Text>
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
function FeaturedTaskCard({ item, onPress }: { item: UIObligation; onPress: () => void }) {
  const rc = riskColor(item.risk, item.daysUntil);
  const [g1, g2, g3] = taskGradient(item.daysUntil);
  const subtitle = item.notes ?? item.executionPath;
  const dueLabel = item.daysUntil === 0 ? 'TODAY' : `${item.daysUntil} DAYS`;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.featuredCard}>
      {/* Top gradient border */}
      <LinearGradient colors={[g1, g2, g3]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.featuredBorder} />
      <View style={s.featuredInner}>
        <View style={[s.daysBadge, { backgroundColor: `${rc}22`, borderColor: `${rc}44` }]}>
          <Text style={[s.daysBadgeText, { color: rc }]}>{dueLabel}</Text>
        </View>
        <Text style={s.featuredTitle}>{item.emoji}  {item.title}</Text>
        <Text style={s.featuredSub}>{subtitle}</Text>
        <Text style={s.featuredArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Small Task Card ───────────────────────────────────────────────────────────
function SmallTaskCard({ item, onPress }: { item: UIObligation; onPress: () => void }) {
  const rc = riskColor(item.risk, item.daysUntil);
  const dueLabel = item.daysUntil === 0 ? 'TODAY' : `${item.daysUntil}`;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.smallCard}>
      <Text style={s.smallCardTitle}>{item.emoji}  {item.title}</Text>
      <Text style={s.smallCardSub} numberOfLines={1}>{item.notes ?? item.executionPath}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 8 }}>
        <Text style={[s.smallDaysNum, { color: rc }]}>{dueLabel}</Text>
        {item.daysUntil > 0 && <Text style={s.smallDaysLabel}>DAYS</Text>}
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
  { key: 'wallet',     icon: '🗂️', label: 'Wallet'      },
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

  const obligations        = useAppStore(st => st.obligations);
  const addObligations     = useAppStore(st => st.addObligations);
  const morningBrief       = useAppStore(st => st.morningBrief);
  const setMorningBrief    = useAppStore(st => st.setMorningBrief);
  const lastBriefKey       = useAppStore(st => st.lastBriefKey);
  const setLastBriefKey    = useAppStore(st => st.setLastBriefKey);
  const googleConnected    = useAppStore(st => st.googleConnected);
  const googleEmail        = useAppStore(st => st.googleEmail);
  const setGoogleConnected = useAppStore(st => st.setGoogleConnected);
  const setGoogleEmail     = useAppStore(st => st.setGoogleEmail);

  const [userName,        setUserName]        = useState('');
  const [timeStr,         setTimeStr]         = useState(getTimeString());
  const [greeting,        setGreeting]        = useState(getGreeting());
  const [briefLoading,    setBriefLoading]    = useState(false);
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [scanSummary,     setScanSummary]     = useState<string | null>(null);

  const fadeIn        = useRef(new Animated.Value(0)).current;
  const slideUp       = useRef(new Animated.Value(20)).current;
  // Track obligations fingerprint — regenerate brief whenever tasks change
  const prevObsKey    = useRef<string>('');

  // ── Derive everything from the live obligations store ──────────────────────
  // Active (non-completed) sorted by urgency: daysUntil asc, then risk weight
  const riskWeight = (r: string) => r === 'high' ? 0 : r === 'medium' ? 1 : 2;
  const active = obligations
    .filter(o => o.status !== 'completed')
    .slice()
    .sort((a, b) => a.daysUntil - b.daysUntil || riskWeight(a.risk) - riskWeight(b.risk));

  const urgentAlert  = active[0] ?? null;          // most critical
  const featuredTask = active[1] ?? null;           // second most critical
  const gridTasks    = active.slice(2, 6);          // up to 4 more in grid
  const activeCount  = active.length;

  // "Ready to Execute" — top 2 high/medium risk items mapped to action cards
  const executeItems = active
    .filter(o => o.risk === 'high' || o.risk === 'medium')
    .slice(0, 2)
    .map(toExecuteItem);
  const isEvening      = getBriefTimeOfDay() === 'evening';

  useEffect(() => {
    // Load user name
    AsyncStorage.getItem('wyle_user').then(json => {
      if (json) {
        try { setUserName(JSON.parse(json).name?.split(' ')[0] || ''); } catch {}
      }
    });

    // ── Web: complete OAuth redirect callback (if returning from Google) ──────
    // Must run BEFORE isGoogleConnected so the new token is in storage first.
    handleGoogleOAuthCallback().then(async callbackResult => {
      if (callbackResult && callbackResult.success === true) {
        setGoogleConnected(true);
        setGoogleEmail(callbackResult.email);
        // Background inbox/calendar scan
        try {
          const scan = await runFullSignalScan(
            callbackResult.accessToken,
            useAppStore.getState().obligations.filter(o => o.status !== 'completed'),
          );
          if (scan.obligations.length > 0) {
            useAppStore.getState().addObligations(scan.obligations);
          }
          setScanSummary(scan.summary);
          Alert.alert('Connected ✓', `Signed in as ${callbackResult.email}.\n\n${scan.summary}`);
        } catch {
          Alert.alert('Connected ✓', `Signed in as ${callbackResult.email}.\nCalendar & Gmail synced.`);
        }
      } else if (callbackResult && callbackResult.success === false) {
        Alert.alert('Sign-in failed', callbackResult.error);
      }

      // Always re-check stored token after potential callback
      isGoogleConnected().then(({ connected, email }) => {
        if (connected) { setGoogleConnected(true); setGoogleEmail(email); }
      });
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

  // ── Google OAuth connect ──────────────────────────────────────────────────
  const handleGoogleConnect = async () => {
    // On web use EXPO_PUBLIC_GOOGLE_CLIENT_ID; on native use platform-specific IDs
    const clientIdSet = !!(
      (Platform.OS === 'web'     && process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID) ||
      (Platform.OS === 'android' && (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID)) ||
      (Platform.OS === 'ios'     && (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS     || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID))
    );
    if (!clientIdSet) {
      Alert.alert(
        'Setup required',
        'Google Client ID is not configured.\n\nAdd EXPO_PUBLIC_GOOGLE_CLIENT_ID to your .env file.',
      );
      return;
    }

    setGoogleConnecting(true);
    setScanSummary(null);
    try {
      const result = await signInWithGoogle();

      // Web: page is navigating to Google — button stays in loading state until redirect
      if (result.success === 'redirect') return;

      if (!result.success) {
        if (result.error !== 'Cancelled') {
          Alert.alert('Sign-in failed', result.error || 'Could not connect to Google.');
        }
        return;
      }

      // Native: OAuth popup completed — mark connected immediately
      setGoogleConnected(true);
      setGoogleEmail(result.email);

      // Background: parse Gmail + Calendar → add obligations to store
      try {
        const scan = await runFullSignalScan(
          result.accessToken,
          obligations.filter(o => o.status !== 'completed'),
        );
        if (scan.obligations.length > 0) addObligations(scan.obligations);
        setScanSummary(scan.summary);
        Alert.alert('Connected ✓', `Signed in as ${result.email}.\n\n${scan.summary}`);
      } catch {
        Alert.alert('Connected ✓', `Signed in as ${result.email}.\nInbox scan will run in the background.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setGoogleConnecting(false);
    }
  };

  // ── Re-generate brief whenever obligations change ─────────────────────────
  // Fingerprint = "<total>:<active>:<high-risk titles>" so any add/resolve/
  // new voice brain-dump triggers a fresh Claude-generated brief immediately.
  useEffect(() => {
    const activeObs  = obligations.filter(o => o.status !== 'completed');
    const fingerprint = `${obligations.length}:${activeObs.length}:` +
      activeObs.filter(o => o.risk === 'high').map(o => o._id).sort().join(',');

    if (fingerprint === prevObsKey.current) return; // nothing changed
    prevObsKey.current = fingerprint;

    if (briefLoading) return; // already in-flight
    setBriefLoading(true);
    generateBrief(obligations, MOCK_STATS.reliable)
      .then(b => { setMorningBrief(b); setLastBriefKey(getBriefKey()); })
      .catch(() => {})
      .finally(() => setBriefLoading(false));
  }, [obligations]);

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

        {/* ── Morning Brief / Evening Recap Banner ───────────────────────── */}
        <Animated.View style={{ opacity: fadeIn }}>
          <TouchableOpacity
            style={s.briefBanner}
            onPress={() => nav.navigate('morningBrief')}
            activeOpacity={0.85}
          >
            {briefLoading ? (
              <ActivityIndicator color={C.verdigris} size="small" style={{ width: 32 }} />
            ) : (
              <Text style={s.briefBannerIcon}>{isEvening ? '🌙' : '☀️'}</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.briefBannerLabel}>
                {isEvening ? 'EVENING RECAP' : 'MORNING BRIEF'} · LIVE
              </Text>
              <Text style={s.briefBannerHeadline} numberOfLines={1}>
                {briefLoading
                  ? 'Buddy is preparing your brief…'
                  : morningBrief?.headline ?? 'Tap to view today\'s priorities'}
              </Text>
            </View>
            <Text style={s.briefBannerArrow}>›</Text>
          </TouchableOpacity>
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

        {/* ── Google Calendar Card ──────────────────────────────────────────── */}
        {!googleConnected ? (
          <Animated.View style={[s.googleCard, { opacity: fadeIn }]}>
            <Text style={s.googleCardLabel}>SYNC YOUR SCHEDULE</Text>

            {/* Official-style Google button */}
            <TouchableOpacity
              style={[s.googleBtn, googleConnecting && s.googleBtnDisabled]}
              onPress={handleGoogleConnect}
              disabled={googleConnecting}
              activeOpacity={0.92}
            >
              {/* G logo box */}
              <View style={s.googleLogoBox}>
                {googleConnecting
                  ? <ActivityIndicator color="#4285F4" size="small" />
                  : <GoogleLogo />
                }
              </View>
              {/* Divider */}
              <View style={s.googleBtnDivider} />
              {/* Label */}
              <Text style={s.googleBtnLabel}>
                {googleConnecting ? 'Connecting calendar…' : 'Connect Google Calendar & Gmail'}
              </Text>
            </TouchableOpacity>

            <Text style={s.googleCardSub}>
              Detects meeting conflicts · alerts you before clashes · read-only access
            </Text>
          </Animated.View>
        ) : (
          /* Connected state — tap to open calendar view */
          <Animated.View style={{ opacity: fadeIn }}>
            <TouchableOpacity
              style={s.googleConnectedCard}
              onPress={() => nav.navigate('calendar')}
              activeOpacity={0.85}
            >
              <View style={s.googleConnectedIcon}>
                <Text style={{ fontSize: 16 }}>📅</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.googleConnectedTitle}>Calendar & Gmail connected</Text>
                <Text style={s.googleConnectedSub}>Tap to view upcoming meetings · {googleEmail}</Text>
              </View>
              <Text style={s.connectedArrow}>›</Text>
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
              <Text style={s.activeBadgeText}>{executeItems.length}</Text>
            </View>
          </View>
          {executeItems.map(item => (
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

  // ── Morning / Evening brief banner
  briefBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 16, padding: 14,
    marginHorizontal: 16, marginBottom: 14,
    borderWidth: 1, borderColor: C.border,
    borderLeftWidth: 3, borderLeftColor: C.verdigris,
  },
  briefBannerIcon:     { fontSize: 22, width: 32, textAlign: 'center' },
  briefBannerLabel:    { color: C.verdigris, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  briefBannerHeadline: { color: C.white, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  briefBannerArrow:    { color: C.chartreuse, fontSize: 20, fontWeight: '300' },

  // ── Google account card (replaces old signal banner)
  googleCard: {
    marginHorizontal: 16, marginBottom: 14,
  },
  googleCardLabel: {
    color: C.textTer, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 8,
  },
  // White button — matches Google's official "Sign in with Google" button spec
  googleBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: 48,
    overflow: 'hidden',
    // Subtle elevation so it lifts off the dark bg
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 4, elevation: 4,
  },
  googleBtnDisabled: { opacity: 0.65 },
  // Logo box — same height as button, slight right padding for optical balance
  googleLogoBox: {
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  // 1px vertical divider between logo and label (Google spec)
  googleBtnDivider: {
    width: 1, height: 28, backgroundColor: 'rgba(0,0,0,0.12)',
  },
  // Label — Roboto Medium, Google's recommended colour on white
  googleBtnLabel: {
    flex: 1, textAlign: 'center',
    color: '#1F1F1F', fontSize: 15, fontWeight: '600',
    letterSpacing: 0.2, paddingRight: 48, // balance the logo box width
  },
  googleCardSub: {
    color: C.textTer, fontSize: 10, marginTop: 8, textAlign: 'center',
  },
  // Connected state
  googleConnectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: `${C.verdigris}0D`,
    borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginBottom: 14,
    borderWidth: 1, borderColor: `${C.verdigris}35`,
  },
  googleConnectedIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: `${C.verdigris}22`,
    alignItems: 'center', justifyContent: 'center',
  },
  googleConnectedTitle: { color: C.verdigris, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  googleConnectedSub:   { color: C.textSec, fontSize: 11 },
  connectedArrow: { color: C.chartreuse, fontSize: 20, fontWeight: '300' },

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
