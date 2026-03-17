// src/screens/Onboarding/LoginScreen.tsx
// Redesigned to match Wyle brand UI: dark teal, pill inputs with icons + mic, gradient CTA
// Supports Login / Register toggle + Google Sign-In

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Animated, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VoiceService } from '@services/voiceService';
import type { NavProp } from '../../../app/index';

// ── Brand colours ────────────────────────────────────────────────────────────
const C = {
  bg:         '#002F3A',
  surface:    '#0A3D4A',
  surfaceEl:  '#0F4A5A',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  chartreuseB:'#B8F500',
  salmon:     '#FF9F8A',
  crimson:    '#D7263D',
  white:      '#FEFFFE',
  textSec:    '#8FB8BF',
  textTer:    '#4A7A85',
  border:     '#1A5060',
};

// ── Set to true to use real backend ─────────────────────────────────────────
const USE_REAL_API = false;
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

// ── Field icon (emoji fallback — no extra package needed) ────────────────────
function FieldIcon({ icon }: { icon: string }) {
  return <Text style={styles.fieldIcon}>{icon}</Text>;
}

// ── Mic button inside a field ─────────────────────────────────────────────────
function MicBtn({ onTranscript }: { onTranscript: (t: string) => void }) {
  const [active, setActive] = useState(false);

  const toggle = () => {
    if (active) {
      VoiceService.stop(() => {}, (s) => { if (s === 'idle') setActive(false); });
      setActive(false);
    } else {
      setActive(true);
      VoiceService.start(
        (text) => { onTranscript(text); setActive(false); },
        (state) => { if (state === 'idle') setActive(false); }
      );
    }
  };

  return (
    <TouchableOpacity onPress={toggle} style={styles.micBtn} activeOpacity={0.7}>
      <Text style={[styles.micIcon, active && { color: C.chartreuse }]}>
        {active ? '🔴' : '🎤'}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LoginScreen({ navigation }: { navigation: NavProp }) {
  const [mode, setMode]         = useState<'login' | 'register'>('register');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [location, setLocation] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); shake(); return; }
    if (mode === 'register' && !name) { setError('Please enter your name.'); shake(); return; }

    setLoading(true);
    try {
      if (USE_REAL_API) {
        const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
        const body = mode === 'login'
          ? { email, password }
          : { name, email, password, location };
        const res  = await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Something went wrong');
        await AsyncStorage.setItem('wyle_token', data.token);
        await AsyncStorage.setItem('wyle_user',  JSON.stringify(data.user));
      } else {
        // Demo mode — any credentials work
        await AsyncStorage.setItem('wyle_token', 'mock_token_demo');
        await AsyncStorage.setItem('wyle_user', JSON.stringify({
          _id: '1',
          name: name || email.split('@')[0] || 'Amrutha',
          email,
          location: location || 'Dubai, UAE',
          onboardingComplete: true,
        }));
        await new Promise(r => setTimeout(r, 600));
      }
      navigation.navigate('preparation');
    } catch (e: any) {
      setError(e.message || 'Authentication failed. Try again.');
      shake();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      const { signInWithGoogle } = await import('@services/googleAuthService');
      const result = await signInWithGoogle();
      if (result.success) {
        await AsyncStorage.setItem('wyle_token', 'google_token_demo');
        await AsyncStorage.setItem('wyle_user', JSON.stringify({
          _id: 'g1',
          name: result.user?.name || 'Google User',
          email: result.user?.email || '',
          onboardingComplete: true,
        }));
        navigation.navigate('preparation');
      }
    } catch (e: any) {
      setError('Google sign-in failed. Try again.');
    }
  };

  const isRegister = mode === 'register';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAreaView>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <View style={styles.header}>
              <Text style={styles.logo}>WYLE</Text>
              <Text style={styles.tagline}>DIGITAL CHIEF OF STAFF</Text>
            </View>

            {/* ── Headline ───────────────────────────────────────────────── */}
            <Text style={styles.headline}>
              {isRegister ? 'Welcome Aboard' : 'Welcome Back'}
            </Text>
            <Text style={styles.subline}>
              {isRegister
                ? "Let's get you set up in moments"
                : 'Your life stack is waiting for you'}
            </Text>

            {/* ── Mode toggle ────────────────────────────────────────────── */}
            <View style={styles.modeToggle}>
              {(['register', 'login'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => { setMode(m); setError(''); }}
                >
                  <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                    {m === 'login' ? 'Sign In' : 'Create Account'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Form ───────────────────────────────────────────────────── */}
            <Animated.View style={[styles.form, { transform: [{ translateX: shakeAnim }] }]}>

              {isRegister && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>FULL NAME</Text>
                  <View style={styles.inputRow}>
                    <FieldIcon icon="👤" />
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Mohammed Al-Rashid"
                      placeholderTextColor={C.textTer}
                      autoCapitalize="words"
                    />
                    <MicBtn onTranscript={setName} />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>EMAIL ADDRESS</Text>
                <View style={styles.inputRow}>
                  <FieldIcon icon="✉️" />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="m.alrashid@wyle.ae"
                    placeholderTextColor={C.textTer}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                  <MicBtn onTranscript={setEmail} />
                </View>
              </View>

              {isRegister && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>LOCATION</Text>
                  <View style={styles.inputRow}>
                    <FieldIcon icon="📍" />
                    <TextInput
                      style={styles.input}
                      value={location}
                      onChangeText={setLocation}
                      placeholder="Palm Jumeirah, Dubai"
                      placeholderTextColor={C.textTer}
                      autoCapitalize="words"
                    />
                    <MicBtn onTranscript={setLocation} />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>PASSWORD</Text>
                <View style={styles.inputRow}>
                  <FieldIcon icon="🔒" />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={C.textTer}
                    secureTextEntry
                    autoComplete="password"
                  />
                </View>
              </View>

              {/* Error */}
              {!!error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠️ {error}</Text>
                </View>
              )}

              {/* Demo badge */}
              {!USE_REAL_API && (
                <Text style={styles.demoText}>
                  🎭 Demo — any email + password works
                </Text>
              )}

              {/* ── Primary CTA ─────────────────────────────────────────── */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
                style={{ marginTop: 8 }}
              >
                <LinearGradient
                  colors={[C.chartreuse, C.chartreuseB]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.submitBtn, loading && { opacity: 0.6 }]}
                >
                  {loading
                    ? <ActivityIndicator color={C.bg} />
                    : <Text style={styles.submitText}>
                        {isRegister ? 'Continue to Dashboard  ›' : 'Sign In  ›'}
                      </Text>
                  }
                </LinearGradient>
              </TouchableOpacity>

              {/* ── Divider ─────────────────────────────────────────────── */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* ── Google Sign-In ──────────────────────────────────────── */}
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogle}
                activeOpacity={0.85}
              >
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleText}>Continue with Google</Text>
              </TouchableOpacity>

            </Animated.View>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <Text style={styles.footer}>
              Your information is encrypted and secure.{'\n'}Voice data is processed locally.
            </Text>

          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll:    { padding: 28, paddingBottom: 48 },

  // ── Header
  header:  { alignItems: 'center', marginTop: 16, marginBottom: 32 },
  logo:    { fontSize: 42, fontWeight: '900', color: C.white, letterSpacing: 10 },
  tagline: { fontSize: 11, fontWeight: '600', color: C.textSec, letterSpacing: 4, marginTop: 4 },

  // ── Headline
  headline: { fontSize: 28, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: 8 },
  subline:  { fontSize: 14, color: C.textSec, textAlign: 'center', marginBottom: 28, lineHeight: 20 },

  // ── Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 4,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeBtn:           { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modeBtnActive:     { backgroundColor: C.verdigris },
  modeBtnText:       { color: C.textSec, fontSize: 14, fontWeight: '600' },
  modeBtnTextActive: { color: C.white },

  // ── Form
  form: { gap: 16 },

  inputGroup: { gap: 7 },
  label: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 56,
  },
  fieldIcon: { fontSize: 18, marginRight: 10 },
  input: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    paddingVertical: 10,
  },
  micBtn:  { padding: 6, marginLeft: 4 },
  micIcon: { fontSize: 16, color: C.textTer },

  // ── Error
  errorBox: {
    backgroundColor: `${C.crimson}18`,
    borderWidth: 1,
    borderColor: `${C.crimson}40`,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: C.crimson, fontSize: 13 },

  // ── Demo
  demoText: { color: C.salmon, fontSize: 12, textAlign: 'center', opacity: 0.8 },

  // ── Submit button
  submitBtn: {
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: C.bg, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ── Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: C.textTer, fontSize: 13 },

  // ── Google button
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 16,
    gap: 10,
    backgroundColor: C.surface,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: C.white,
    fontStyle: 'italic',
  },
  googleText: { color: C.white, fontSize: 15, fontWeight: '600' },

  // ── Footer
  footer: {
    color: C.textTer,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 18,
  },
});
