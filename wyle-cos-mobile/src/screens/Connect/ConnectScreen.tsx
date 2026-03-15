// src/screens/Connect/ConnectScreen.tsx
// Life Signal Engine — guided Gmail + Calendar connection (PRD Layer A: A1, A2)

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, StatusBar, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavProp } from '../../../app/index';
import { useAppStore } from '../../store';
import { signInWithGoogle, isGoogleConnected, disconnectGoogle, getOAuthRedirectUri } from '../../services/googleAuthService';
import { runFullSignalScan } from '../../services/signalService';
import { UIObligation } from '../../types';

const C = {
  bg: '#002F3A', surface: '#0A3D4A', surfaceEl: '#0F4A5A',
  verdigris: '#1B998B', chartreuse: '#D5FF3F', salmon: '#FF9F8A',
  crimson: '#D7263D', white: '#FEFFFE', textSec: '#8FB8BF',
  textTer: '#4A7A85', border: '#1A5060',
};

type Step = 'idle' | 'connecting' | 'scanning' | 'review' | 'done' | 'error';

export default function ConnectScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const obligations    = useAppStore(s => s.obligations);
  const addObligations = useAppStore(s => s.addObligations);
  const setGoogleConnected = useAppStore(s => s.setGoogleConnected);
  const googleConnected    = useAppStore(s => s.googleConnected);
  const googleEmail        = useAppStore(s => s.googleEmail);
  const setGoogleEmail     = useAppStore(s => s.setGoogleEmail);

  const [step, setStep]           = useState<Step>('idle');
  const [error, setError]         = useState('');
  const [found, setFound]         = useState<UIObligation[]>([]);
  const [accessToken, setToken]   = useState<string | null>(null);
  const [fadeAnim]                = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    // Check if already connected
    isGoogleConnected().then(({ connected, email }) => {
      if (connected) { setGoogleConnected(true); setGoogleEmail(email); }
    });
  }, []);

  // ── Step 1: Connect Google account ─────────────────────────────────────────
  const handleConnect = async () => {
    setStep('connecting');
    setError('');
    const result = await signInWithGoogle();
    if (!result.success) {
      setError(result.error);
      setStep('error');
      return;
    }
    setToken(result.accessToken);
    setGoogleConnected(true);
    setGoogleEmail(result.email);
    // Immediately scan
    handleScan(result.accessToken);
  };

  // ── Step 2: Scan inbox + calendar ──────────────────────────────────────────
  const handleScan = async (token: string) => {
    setStep('scanning');
    try {
      const active = obligations.filter(o => o.status === 'active');
      const result = await runFullSignalScan(token, active);
      setFound(result.obligations);
      setStep('review');
    } catch (e: any) {
      setError(e?.message ?? 'Scan failed');
      setStep('error');
    }
  };

  // ── Step 3: Add found obligations ──────────────────────────────────────────
  const handleAddAll = () => {
    if (found.length > 0) addObligations(found);
    setStep('done');
  };

  const handleSkip = () => setStep('done');

  // ── Disconnect ─────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    await disconnectGoogle();
    setGoogleConnected(false);
    setGoogleEmail('');
    setStep('idle');
    setFound([]);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <View>
            <Text style={s.screenLabel}>BUDDY</Text>
            <Text style={s.screenTitle}>Life Signal Engine</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* ── Hero ── */}
          <View style={s.heroCard}>
            <Text style={s.heroEmoji}>⚡</Text>
            <Text style={s.heroTitle}>Connect your inbox & calendar</Text>
            <Text style={s.heroSub}>
              Buddy scans your Gmail and Google Calendar to automatically detect
              deadlines, renewals, payments, and obligations — so nothing slips through.
            </Text>
          </View>

          {/* ── What Buddy detects ── */}
          {step === 'idle' && !googleConnected && (
            <View style={s.detectList}>
              <Text style={s.detectLabel}>WHAT BUDDY DETECTS</Text>
              {[
                ['📧', 'Email', 'Visa renewals, bill payment reminders, school fee notices'],
                ['📅', 'Calendar', 'Appointments, payment deadlines, document expiries'],
                ['🔍', 'Smart', 'Filters out marketing — only actionable obligations'],
                ['🔒', 'Private', 'Read-only access. Buddy never stores full email content'],
              ].map(([emoji, title, desc]) => (
                <View key={title} style={s.detectRow}>
                  <Text style={s.detectEmoji}>{emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.detectTitle}>{title}</Text>
                    <Text style={s.detectDesc}>{desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── Already connected ── */}
          {googleConnected && step !== 'scanning' && step !== 'review' && step !== 'done' && (
            <View style={s.connectedCard}>
              <View style={s.connectedRow}>
                <View style={s.connectedDot} />
                <Text style={s.connectedEmail}>Connected: {googleEmail}</Text>
              </View>
              <Text style={s.connectedSub}>Gmail + Calendar active</Text>
              <TouchableOpacity style={s.rescanBtn} onPress={async () => {
                const { connected } = await isGoogleConnected();
                if (connected) {
                  const { getAccessToken } = await import('../../services/googleAuthService');
                  const token = await getAccessToken();
                  if (token) handleScan(token);
                }
              }}>
                <Text style={s.rescanBtnText}>⚡ Scan Now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDisconnect} style={{ marginTop: 8 }}>
                <Text style={s.disconnectText}>Disconnect Google account</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Connecting spinner ── */}
          {step === 'connecting' && (
            <View style={s.statusCard}>
              <ActivityIndicator color={C.verdigris} size="large" />
              <Text style={s.statusText}>Opening Google sign-in…</Text>
              <Text style={s.statusSub}>Grant access to Gmail and Calendar when prompted</Text>
            </View>
          )}

          {/* ── Scanning spinner ── */}
          {step === 'scanning' && (
            <View style={s.statusCard}>
              <ActivityIndicator color={C.chartreuse} size="large" />
              <Text style={s.statusText}>Buddy is scanning your inbox & calendar…</Text>
              <Text style={s.statusSub}>Reading the last 7 days of emails + next 30 days of calendar</Text>
            </View>
          )}

          {/* ── Review found obligations ── */}
          {step === 'review' && (
            <View>
              {found.length > 0 ? (
                <>
                  <Text style={s.reviewLabel}>FOUND {found.length} OBLIGATION{found.length > 1 ? 'S' : ''}</Text>
                  {found.map(item => (
                    <View key={item._id} style={[s.foundCard, { borderLeftColor: item.risk === 'high' ? C.crimson : item.risk === 'medium' ? C.chartreuse : C.verdigris }]}>
                      <Text style={s.foundEmoji}>{item.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.foundTitle}>{item.title}</Text>
                        <Text style={s.foundNotes}>{item.notes}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                          <Text style={[s.foundRisk, { color: item.risk === 'high' ? C.crimson : item.risk === 'medium' ? C.chartreuse : C.verdigris }]}>
                            {item.risk.toUpperCase()}
                          </Text>
                          <Text style={s.foundDays}>{item.daysUntil === 0 ? 'Due today' : `${item.daysUntil} days`}</Text>
                          {item.amount && <Text style={s.foundAmount}>AED {item.amount.toLocaleString()}</Text>}
                        </View>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity style={s.addBtn} onPress={handleAddAll}>
                    <Text style={s.addBtnText}>Add {found.length} obligation{found.length > 1 ? 's' : ''} to my list</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
                    <Text style={s.skipBtnText}>Skip for now</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={s.statusCard}>
                  <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>✅</Text>
                  <Text style={s.statusText}>All clear!</Text>
                  <Text style={s.statusSub}>No new obligations found in your inbox or calendar</Text>
                  <TouchableOpacity style={[s.addBtn, { marginTop: 16 }]} onPress={() => nav.navigate('obligations')}>
                    <Text style={s.addBtnText}>View my obligations</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <View style={s.statusCard}>
              <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>🎉</Text>
              <Text style={s.statusText}>Life Signal Engine active</Text>
              <Text style={s.statusSub}>Buddy will keep scanning your inbox and calendar automatically</Text>
              <TouchableOpacity style={[s.addBtn, { marginTop: 16 }]} onPress={() => nav.navigate('obligations')}>
                <Text style={s.addBtnText}>View my obligations</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Error ── */}
          {step === 'error' && (
            <View style={s.errorCard}>
              <Text style={s.errorTitle}>⚠️ Connection failed</Text>
              <Text style={s.errorMsg}>{error}</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setStep('idle')}>
                <Text style={s.addBtnText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Connect button (native only) ── */}
          {step === 'idle' && !googleConnected && Platform.OS !== 'web' && (
            <TouchableOpacity style={s.connectBtn} onPress={handleConnect}>
              <Text style={s.connectBtnText}>🔗 Connect Gmail + Calendar</Text>
            </TouchableOpacity>
          )}

          {/* ── Web: use phone message ── */}
          {step === 'idle' && !googleConnected && Platform.OS === 'web' && (
            <View style={s.phoneCard}>
              <Text style={s.phoneEmoji}>📱</Text>
              <Text style={s.phoneTitle}>Open on your phone</Text>
              <Text style={s.phoneSub}>
                Gmail & Calendar connection requires the mobile app.{'\n\n'}
                1. Install <Text style={s.noteCode}>Expo Go</Text> on your phone{'\n'}
                2. In your terminal run: <Text style={s.noteCode}>npx expo start</Text>{'\n'}
                3. Scan the QR code with your phone camera{'\n'}
                4. Tap the banner to connect here
              </Text>
            </View>
          )}

          {/* ── Setup note (native only) ── */}
          {step === 'idle' && !googleConnected && Platform.OS !== 'web' && (
            <View style={s.noteCard}>
              <Text style={s.noteTitle}>GOOGLE CLOUD CONSOLE — ADD THIS REDIRECT URI</Text>
              <Text style={s.noteText}>
                Go to console.cloud.google.com → Credentials → your Web client → Authorized redirect URIs → Add:{'\n\n'}
                <Text style={s.noteCode}>{getOAuthRedirectUri()}</Text>
                {'\n\n'}Also add permanently for APK/IPA:{'\n'}
                <Text style={s.noteCode}>com.wyle.cos://</Text>
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn:        { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  backBtnText:    { color: C.verdigris, fontSize: 18, fontWeight: '600' },
  screenLabel:    { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  screenTitle:    { color: C.white, fontSize: 20, fontWeight: '800' },
  body:           { padding: 16 },

  heroCard:       { backgroundColor: `${C.verdigris}15`, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: `${C.verdigris}30` },
  heroEmoji:      { fontSize: 40, marginBottom: 8 },
  heroTitle:      { color: C.white, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  heroSub:        { color: C.textSec, fontSize: 13, lineHeight: 19, textAlign: 'center' },

  detectList:     { marginBottom: 20 },
  detectLabel:    { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 12 },
  detectRow:      { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  detectEmoji:    { fontSize: 22, width: 30 },
  detectTitle:    { color: C.white, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  detectDesc:     { color: C.textSec, fontSize: 12, lineHeight: 17 },

  connectedCard:  { backgroundColor: `${C.verdigris}12`, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: `${C.verdigris}30` },
  connectedRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  connectedDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: C.verdigris },
  connectedEmail: { color: C.verdigris, fontSize: 14, fontWeight: '600' },
  connectedSub:   { color: C.textSec, fontSize: 12, marginBottom: 12 },
  rescanBtn:      { backgroundColor: C.verdigris, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rescanBtnText:  { color: C.white, fontSize: 14, fontWeight: '700' },
  disconnectText: { color: C.textTer, fontSize: 12, textAlign: 'center', textDecorationLine: 'underline' },

  statusCard:     { backgroundColor: C.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.border },
  statusText:     { color: C.white, fontSize: 16, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  statusSub:      { color: C.textSec, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 },

  reviewLabel:    { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  foundCard:      { backgroundColor: C.surface, borderRadius: 12, padding: 14, flexDirection: 'row', gap: 12, marginBottom: 8, borderLeftWidth: 3 },
  foundEmoji:     { fontSize: 22 },
  foundTitle:     { color: C.white, fontSize: 14, fontWeight: '600' },
  foundNotes:     { color: C.textTer, fontSize: 11, marginTop: 1 },
  foundRisk:      { fontSize: 10, fontWeight: '700' },
  foundDays:      { color: C.textSec, fontSize: 11 },
  foundAmount:    { color: C.chartreuse, fontSize: 11 },

  addBtn:         { backgroundColor: C.chartreuse, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  addBtnText:     { color: C.bg, fontSize: 15, fontWeight: '800' },
  skipBtn:        { borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  skipBtnText:    { color: C.textSec, fontSize: 14 },
  connectBtn:     { backgroundColor: C.chartreuse, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 16 },
  connectBtnText: { color: C.bg, fontSize: 16, fontWeight: '800' },

  errorCard:      { backgroundColor: `${C.crimson}15`, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: `${C.crimson}30` },
  errorTitle:     { color: C.crimson, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  errorMsg:       { color: C.textSec, fontSize: 13, lineHeight: 18, marginBottom: 8 },

  noteCard:       { backgroundColor: `${C.salmon}10`, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${C.salmon}25`, marginTop: 8 },
  noteTitle:      { color: C.salmon, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  noteText:       { color: C.textSec, fontSize: 12, lineHeight: 18 },
  noteCode:       { color: C.chartreuse, fontFamily: 'monospace' },

  phoneCard:      { backgroundColor: `${C.verdigris}12`, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: `${C.verdigris}30` },
  phoneEmoji:     { fontSize: 40, marginBottom: 10 },
  phoneTitle:     { color: C.white, fontSize: 17, fontWeight: '700', marginBottom: 10 },
  phoneSub:       { color: C.textSec, fontSize: 13, lineHeight: 22, textAlign: 'left', width: '100%' },
});
