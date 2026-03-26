// src/screens/Connect/ConnectScreen.tsx
// Profile screen — redesigned to match Figma
// Sections: User card · Membership · Personal Info · Preferences ·
//           Your Performance · Account (with Google connect)
// Consistent 5-tab footer with animated hologram orb

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import {
  signInWithGoogle, isGoogleConnected, disconnectGoogle,
} from '../../services/googleAuthService';
import { runFullSignalScan } from '../../services/signalService';

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

// ── Mock / computed data ──────────────────────────────────────────────────────
const MEMBER_STATS = [
  { label: 'DAYS ACTIVE', value: '86',  color: C.verdigris  },
  { label: 'OPT. SCORE',  value: '742', color: C.chartreuse },
  { label: 'TIME SAVED',  value: '64h', color: C.salmon     },
];

const PREFERENCES = [
  { icon: '🔔', label: 'Notifications',    sub: 'All enabled'       },
  { icon: '🌐', label: 'Language',         sub: 'English'           },
  { icon: '🔒', label: 'Privacy & Security', sub: 'High protection' },
  { icon: '💳', label: 'Payment Methods',  sub: '2 cards linked'    },
];

const PERFORMANCE = [
  { icon: '⚡', label: 'AUTOMATIONS',  value: '7',    trend: '+2 this week',  trendUp: true,  color: C.verdigris  },
  { icon: '⏱',  label: 'AVG RESPONSE', value: '12m',  trend: '-4m this week', trendUp: false, color: C.chartreuse },
  { icon: '📈', label: 'EFFICIENCY',   value: '94%',  trend: '+6% this week', trendUp: true,  color: C.verdigris  },
  { icon: '✓',  label: 'COMPLETED',    value: '142',  trend: '+18 this week', trendUp: true,  color: C.chartreuse },
];

// ─────────────────────────────────────────────────────────────────────────────
// Animated Hologram Orb — exact copy from HomeScreen
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
// 5-item Tab Bar — consistent with HomeScreen / InsightsScreen
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
// Avatar component — square with gradient border + person silhouette
// ─────────────────────────────────────────────────────────────────────────────
function UserAvatar({ initials }: { initials: string }) {
  return (
    <View style={s.avatarOuter}>
      <LinearGradient
        colors={[C.verdigris, C.chartreuse]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.avatarGradBorder}
      >
        <View style={s.avatarInner}>
          {/* Person silhouette using text approximation */}
          <Text style={s.avatarIcon}>👤</Text>
        </View>
      </LinearGradient>
      {/* Edit pencil badge */}
      <View style={s.avatarEditBadge}>
        <Text style={s.avatarEditIcon}>✏</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row item (Personal Info / Preferences)
// ─────────────────────────────────────────────────────────────────────────────
function RowItem({
  icon, label, value, isLast = false, onPress,
}: {
  icon: string;
  label: string;
  value: string;
  isLast?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={[s.rowItem, !isLast && s.rowItemBorder]}
    >
      <View style={s.rowIconWrap}>
        <Text style={s.rowIconText}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowValue}>{value}</Text>
      </View>
      <Text style={s.rowChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance mini-card
// ─────────────────────────────────────────────────────────────────────────────
function PerfCard({ item }: { item: typeof PERFORMANCE[0] }) {
  return (
    <View style={s.perfCard}>
      <Text style={s.perfCardIcon}>{item.icon}</Text>
      <Text style={[s.perfCardValue, { color: item.color }]}>{item.value}</Text>
      <Text style={s.perfCardLabel}>{item.label}</Text>
      <View style={s.perfTrendRow}>
        <View style={[
          s.perfTrendDot,
          { backgroundColor: item.trendUp ? C.verdigris : C.crimson },
        ]} />
        <Text style={[s.perfTrendText, { color: item.trendUp ? C.verdigris : C.crimson }]}>
          {item.trend}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ConnectScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  // Store
  const obligations        = useAppStore(st => st.obligations);
  const addObligations     = useAppStore(st => st.addObligations);
  const googleConnected    = useAppStore(st => st.googleConnected);
  const googleEmail        = useAppStore(st => st.googleEmail);
  const setGoogleConnected = useAppStore(st => st.setGoogleConnected);
  const setGoogleEmail     = useAppStore(st => st.setGoogleEmail);

  // Local state
  const [userName,  setUserName]  = useState('Mohammed Al Rashid');
  const [userEmail, setUserEmail] = useState('mohammed@example.ae');
  const [userPhone, setUserPhone] = useState('+971 50 123 4567');
  const [location,  setLocation]  = useState('Dubai, UAE');
  const [connecting, setConnecting] = useState(false);

  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;

  // Derive initials
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    // Load stored user
    AsyncStorage.getItem('wyle_user').then(json => {
      if (json) {
        try {
          const u = JSON.parse(json);
          if (u.name)     setUserName(u.name);
          if (u.email)    setUserEmail(u.email);
          if (u.phone)    setUserPhone(u.phone);
          if (u.location) setLocation(u.location);
        } catch {}
      }
    });

    // Check Google connection
    isGoogleConnected().then(({ connected, email }) => {
      if (connected) { setGoogleConnected(true); setGoogleEmail(email); }
    });

    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Google connect ──────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setConnecting(true);
    const result = await signInWithGoogle();

    if (result.success === 'redirect') {
      // Web: page is navigating to Google sign-in.
      // Keep the spinner; app/index.tsx will handle the callback on return
      // and isGoogleConnected() will reflect the new token when this screen remounts.
      return; // do NOT call setConnecting(false) — page is redirecting away
    }

    if (result.success === true) {
      setGoogleConnected(true);
      setGoogleEmail(result.email);
      try {
        const scan = await runFullSignalScan(
          result.accessToken,
          obligations.filter(o => o.status === 'active'),
        );
        if (scan.obligations.length > 0) addObligations(scan.obligations);
      } catch {}
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    await disconnectGoogle();
    setGoogleConnected(false);
    setGoogleEmail('');
  };

  // ── Sign out ────────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await disconnectGoogle().catch(() => {});
    await AsyncStorage.removeItem('wyle_user').catch(() => {});
    setGoogleConnected(false);
    nav.navigate('login' as any);
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ── Top bar ───────────────────────────────────────────────────────── */}
        <Animated.View style={[s.topBar, { opacity: fadeIn }]}>
          <Text style={s.topTitle}>Profile</Text>
          <TouchableOpacity style={s.gearBtn}>
            <Text style={s.gearIcon}>⚙</Text>
          </TouchableOpacity>
        </Animated.View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
        >
          {/* ── User Card ──────────────────────────────────────────────────── */}
          <Animated.View style={[s.userCard, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
            <UserAvatar initials={initials} />
            <View style={s.userInfo}>
              <Text style={s.userName}>{userName}</Text>
              <Text style={s.userRole}>Premium Member</Text>
              <View style={s.eliteBadge}>
                <Text style={s.eliteIcon}>🏆</Text>
                <Text style={s.eliteText}>Elite Status</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Membership ─────────────────────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionLabel}>MEMBERSHIP</Text>
            <View style={s.membershipCard}>
              {/* Stats row */}
              <View style={s.memberStatsRow}>
                {MEMBER_STATS.map((st, i) => (
                  <React.Fragment key={st.label}>
                    <View style={s.memberStat}>
                      <Text style={[s.memberStatVal, { color: st.color }]}>{st.value}</Text>
                      <Text style={s.memberStatLabel}>{st.label}</Text>
                    </View>
                    {i < MEMBER_STATS.length - 1 && <View style={s.memberStatDivider} />}
                  </React.Fragment>
                ))}
              </View>

              {/* Plan row */}
              <View style={s.planRow}>
                <View>
                  <Text style={s.planName}>Premium Annual</Text>
                  <Text style={s.planRenew}>Renews Mar 15, 2026</Text>
                </View>
                <View style={s.planPriceWrap}>
                  <Text style={s.planPrice}>AED 500</Text>
                  <Text style={s.planPriceSub}>/month</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* ── Personal Information ───────────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionLabel}>PERSONAL INFORMATION</Text>
            <View style={s.listCard}>
              <RowItem icon="✉"  label="EMAIL"        value={userEmail} />
              <RowItem icon="📞" label="PHONE"        value={userPhone} />
              <RowItem icon="📍" label="LOCATION"     value={location}  />
              <RowItem icon="📅" label="MEMBER SINCE" value="December 2025" isLast />
            </View>
          </Animated.View>

          {/* ── Preferences ────────────────────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionLabel}>PREFERENCES</Text>
            <View style={s.listCard}>
              {PREFERENCES.map((pref, i) => (
                <RowItem
                  key={pref.label}
                  icon={pref.icon}
                  label={pref.label}
                  value={pref.sub}
                  isLast={i === PREFERENCES.length - 1}
                />
              ))}
            </View>
          </Animated.View>

          {/* ── Your Performance ───────────────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionLabel}>YOUR PERFORMANCE</Text>
            <View style={s.perfGrid}>
              {PERFORMANCE.map((item) => (
                <PerfCard key={item.label} item={item} />
              ))}
            </View>
          </Animated.View>

          {/* ── Document Wallet ─────────────────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionLabel}>DOCUMENTS</Text>
            <TouchableOpacity
              style={s.walletCard}
              activeOpacity={0.85}
              onPress={() => nav.navigate('wallet' as any)}
            >
              <View style={s.walletIconWrap}>
                <Text style={{ fontSize: 28 }}>🗂️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.walletTitle}>Document Wallet</Text>
                <Text style={s.walletSub}>
                  {googleConnected
                    ? 'View your scanned IDs, insurance, invoices & more'
                    : 'Connect Google to access your documents'}
                </Text>
              </View>
              <Text style={s.rowChevron}>›</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Account ────────────────────────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeIn }}>
            <Text style={s.sectionLabel}>ACCOUNT</Text>
            <View style={s.accountList}>

              {/* Google / Gmail connect */}
              <TouchableOpacity
                style={[s.accountRow, s.accountRowBorder]}
                onPress={googleConnected ? handleDisconnect : handleConnect}
                activeOpacity={0.75}
              >
                <View style={[s.accountIconWrap, { backgroundColor: `${C.verdigris}18` }]}>
                  {connecting
                    ? <ActivityIndicator size="small" color={C.verdigris} />
                    : <Text style={s.accountIconText}>📧</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.accountRowLabel}>
                    {googleConnected ? 'Gmail Connected' : 'Connect Gmail & Calendar'}
                  </Text>
                  {googleConnected
                    ? <Text style={s.accountRowSub}>{googleEmail}</Text>
                    : <Text style={s.accountRowSub}>Auto-detect obligations from inbox</Text>
                  }
                </View>
                <View style={[
                  s.connStatusDot,
                  { backgroundColor: googleConnected ? C.verdigris : C.textTer },
                ]} />
              </TouchableOpacity>

              {/* Manage Subscription */}
              <TouchableOpacity
                style={[s.accountRow, s.accountRowBorder]}
                activeOpacity={0.75}
              >
                <View style={[s.accountIconWrap, { backgroundColor: `${C.verdigris}18` }]}>
                  <Text style={s.accountIconText}>🛡</Text>
                </View>
                <Text style={[s.accountRowLabel, { flex: 1 }]}>Manage Subscription</Text>
                <Text style={s.rowChevron}>›</Text>
              </TouchableOpacity>

              {/* Sign Out */}
              <TouchableOpacity
                style={s.accountRow}
                onPress={handleSignOut}
                activeOpacity={0.75}
              >
                <View style={[s.accountIconWrap, { backgroundColor: `${C.crimson}18` }]}>
                  <Text style={s.accountIconText}>↪</Text>
                </View>
                <Text style={[s.accountRowLabel, { flex: 1, color: C.crimson }]}>Sign Out</Text>
                <Text style={[s.rowChevron, { color: C.crimson }]}>›</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* App version */}
          <Text style={s.versionText}>Wyle v1.0.0 · Built for Dubai professionals</Text>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ── Tab Bar ───────────────────────────────────────────────────────────── */}
      <TabBar active="connect" onTab={(sc) => nav.navigate(sc)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  scrollContent:{ paddingHorizontal: 16, paddingBottom: 24 },

  // ── Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14,
  },
  topTitle: { color: C.white, fontSize: 32, fontWeight: '700' },
  gearBtn:  {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  gearIcon: { fontSize: 18, color: C.textSec },

  // ── User card
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: C.surface, borderRadius: 20,
    padding: 18, marginBottom: 24,
    borderWidth: 1, borderColor: C.border,
  },
  avatarOuter: { position: 'relative' },
  avatarGradBorder: {
    width: 72, height: 72, borderRadius: 18,
    padding: 2, alignItems: 'center', justifyContent: 'center',
  },
  avatarInner: {
    flex: 1, width: '100%', borderRadius: 16,
    backgroundColor: C.surfaceEl,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarIcon: { fontSize: 30 },
  avatarEditBadge: {
    position: 'absolute', bottom: -4, left: -4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.verdigris,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.bg,
  },
  avatarEditIcon: { fontSize: 10, color: C.white },

  userInfo:   { flex: 1 },
  userName:   { color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 3 },
  userRole:   { color: C.textSec, fontSize: 13, marginBottom: 8 },
  eliteBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: `${C.chartreuse}18`, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: `${C.chartreuse}35`,
  },
  eliteIcon: { fontSize: 12 },
  eliteText: { color: C.chartreuse, fontSize: 11, fontWeight: '700' },

  // ── Section label
  sectionLabel: {
    color: C.textTer, fontSize: 10, fontWeight: '700',
    letterSpacing: 2.5, marginBottom: 8, marginTop: 4,
  },

  // ── Document Wallet card
  walletCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: `${C.verdigris}12`,
    borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: `${C.verdigris}30`,
  },
  walletIconWrap: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: `${C.verdigris}18`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${C.verdigris}28`,
  },
  walletTitle: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  walletSub:   { color: C.textSec, fontSize: 12, lineHeight: 17 },

  // ── Membership card
  membershipCard: {
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 1, borderColor: C.border, marginBottom: 22,
    overflow: 'hidden',
  },
  memberStatsRow: {
    flexDirection: 'row', paddingVertical: 18,
    borderBottomWidth: 1, borderColor: C.border,
  },
  memberStat:        { flex: 1, alignItems: 'center' },
  memberStatVal:     { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  memberStatLabel:   { color: C.textTer, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  memberStatDivider: { width: 1, backgroundColor: C.border },

  planRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16,
  },
  planName:     { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  planRenew:    { color: C.textTer, fontSize: 12 },
  planPriceWrap:{ alignItems: 'flex-end' },
  planPrice:    { color: C.verdigris, fontSize: 20, fontWeight: '800' },
  planPriceSub: { color: C.textTer, fontSize: 12 },

  // ── List card (Personal Info + Preferences)
  listCard: {
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 22, overflow: 'hidden',
  },
  rowItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 14,
  },
  rowItemBorder: { borderBottomWidth: 1, borderColor: C.border },
  rowIconWrap:   {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.surfaceEl,
    alignItems: 'center', justifyContent: 'center',
  },
  rowIconText: { fontSize: 16 },
  rowLabel:    { color: C.textTer, fontSize: 10, fontWeight: '600', letterSpacing: 1, marginBottom: 3 },
  rowValue:    { color: C.white, fontSize: 14, fontWeight: '500' },
  rowChevron:  { color: C.textTer, fontSize: 20, fontWeight: '300' },

  // ── Performance 2x2 grid
  perfGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, marginBottom: 22,
  },
  perfCard: {
    width: (width - 42) / 2,
    backgroundColor: C.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: C.border,
  },
  perfCardIcon:  { fontSize: 20, marginBottom: 8 },
  perfCardValue: { fontSize: 28, fontWeight: '800', marginBottom: 3, lineHeight: 30 },
  perfCardLabel: { color: C.textSec, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  perfTrendRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  perfTrendDot:  { width: 6, height: 6, borderRadius: 3 },
  perfTrendText: { fontSize: 11, fontWeight: '600' },

  // ── Account list
  accountList: {
    backgroundColor: C.surface, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 22, overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 14,
  },
  accountRowBorder: { borderBottomWidth: 1, borderColor: C.border },
  accountIconWrap:  {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  accountIconText:  { fontSize: 16 },
  accountRowLabel:  { color: C.white, fontSize: 15, fontWeight: '600' },
  accountRowSub:    { color: C.textSec, fontSize: 11, marginTop: 2 },
  connStatusDot:    { width: 8, height: 8, borderRadius: 4 },

  // ── Version
  versionText: {
    color: C.textTer, fontSize: 11, textAlign: 'center',
    marginBottom: 8,
  },

  // ── Tab bar (identical to HomeScreen)
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
