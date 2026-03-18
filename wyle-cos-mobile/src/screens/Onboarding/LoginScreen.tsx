// src/screens/Onboarding/LoginScreen.tsx
// Redesigned to match Wyle brand UI: dark teal→black gradient bg, vector icons, gradient CTA
// Supports Login / Register toggle + Google Sign-In

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Animated, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
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

function GoogleG() {
  return <SvgXml xml={GOOGLE_G_SVG} width={22} height={22} />;
}

// ── Field icon — Ionicons vector (professional, no emoji) ────────────────────
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
function FieldIcon({ name }: { name: IoniconName }) {
  return <Ionicons name={name} size={18} color={C.verdigris} style={{ marginRight: 10 }} />;
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
      <Ionicons
        name={active ? 'mic' : 'mic-outline'}
        size={18}
        color={active ? C.chartreuse : C.textTer}
      />
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
  const [loading, setLoading]           = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]               = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ── Web-only: override browser autofill white background ──────────────────
  // Browser's -webkit-autofill forces a white fill that can't be beaten with
  // inline styles alone. The only reliable fix is the inset box-shadow trick.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const styleTag = document.createElement('style');
    styleTag.innerHTML = `
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,
      input:-webkit-autofill:active {
        -webkit-box-shadow: 0 0 0 1000px #0A3D4A inset !important;
        -webkit-text-fill-color: #FEFFFE !important;
        caret-color: #FEFFFE !important;
        transition: background-color 9999s ease-in-out 0s;
      }
    `;
    document.head.appendChild(styleTag);
    return () => { document.head.removeChild(styleTag); };
  }, []);

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
    // Use web client ID on browser, platform-specific IDs on native
    const clientIdSet = !!(
      (Platform.OS === 'web'     && process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID) ||
      (Platform.OS === 'android' && (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID)) ||
      (Platform.OS === 'ios'     && (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS     || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID))
    );
    if (!clientIdSet) {
      Alert.alert('Setup required', 'Add EXPO_PUBLIC_GOOGLE_CLIENT_ID (web) or platform-specific IDs to your .env file.');
      return;
    }

    setGoogleLoading(true);
    setError('');
    try {
      const { signInWithGoogle } = await import('@services/googleAuthService');
      const result = await signInWithGoogle();
      if (!result.success) {
        if (result.error !== 'Cancelled') setError(result.error || 'Google sign-in failed.');
        return;
      }
      await AsyncStorage.setItem('wyle_token', 'google_token_demo');
      await AsyncStorage.setItem('wyle_user', JSON.stringify({
        _id: 'g1',
        name: result.email.split('@')[0] || 'Google User',
        email: result.email,
        onboardingComplete: true,
      }));
      navigation.navigate('preparation');
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    // ── Background: teal at top → pure black at bottom ──────────────────────
    <LinearGradient
      colors={['#002F3A', '#001820', '#000000']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#002F3A" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SafeAreaView>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <View style={styles.header}>
              <Text style={styles.logo}>WYLE</Text>

              {/* Shining gradient underline below WYLE */}
              <LinearGradient
                colors={['transparent', C.verdigris, C.chartreuse, C.verdigris, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.logoUnderline}
              />

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
                    <FieldIcon name="person-outline" />
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="Mohammed Al-Rashid"
                      placeholderTextColor={C.textTer}
                      autoCapitalize="words"
                      underlineColorAndroid="transparent"
                    />
                    <MicBtn onTranscript={setName} />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>EMAIL ADDRESS</Text>
                <View style={styles.inputRow}>
                  <FieldIcon name="mail-outline" />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="m.alrashid@wyle.ae"
                    placeholderTextColor={C.textTer}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    underlineColorAndroid="transparent"
                  />
                  <MicBtn onTranscript={setEmail} />
                </View>
              </View>

              {isRegister && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>LOCATION</Text>
                  <View style={styles.inputRow}>
                    <FieldIcon name="location-outline" />
                    <TextInput
                      style={styles.input}
                      value={location}
                      onChangeText={setLocation}
                      placeholder="Palm Jumeirah, Dubai"
                      placeholderTextColor={C.textTer}
                      autoCapitalize="words"
                      underlineColorAndroid="transparent"
                    />
                    <MicBtn onTranscript={setLocation} />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>PASSWORD</Text>
                <View style={styles.inputRow}>
                  <FieldIcon name="lock-closed-outline" />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={C.textTer}
                    secureTextEntry
                    autoComplete="password"
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>

              {/* Error */}
              {!!error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠️ {error}</Text>
                </View>
              )}

              {/* ── Primary CTA — green → yellow gradient ───────────────── */}
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
                style={{ marginTop: 8 }}
              >
                <LinearGradient
                  colors={[C.verdigris, C.chartreuse]}
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
                style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
                onPress={handleGoogle}
                activeOpacity={0.88}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <ActivityIndicator color="#1F1F1F" size="small" />
                ) : (
                  <>
                    <GoogleG />
                    <View style={styles.googleDivider} />
                    <Text style={styles.googleText}>Sign in with Google</Text>
                  </>
                )}
              </TouchableOpacity>

            </Animated.View>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <Text style={styles.footer}>
              Your information is encrypted and secure.{'\n'}Voice data is processed locally.
            </Text>

          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // ── Full-screen gradient container (no backgroundColor — LinearGradient handles it)
  container: { flex: 1 },
  scroll:    { padding: 28, paddingBottom: 48 },

  // ── Header
  header: { alignItems: 'center', marginTop: 16, marginBottom: 32 },
  logo: {
    fontSize: 46,
    fontWeight: '200',      // slim / ultra-light
    color: '#FFFFFF',
    letterSpacing: 10,
    // Subtle glow shadow on the WYLE wordmark
    textShadowColor: C.verdigris,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  // Single shining gradient line — sits between WYLE and DIGITAL CHIEF OF STAFF
  // Width tuned to span from the outer edge of W to the outer edge of E
  logoUnderline: {
    height: 1,              // thinner than before
    width: 118,             // covers W → E at fontSize 46 + letterSpacing 10
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 1,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSec,
    letterSpacing: 4,
  },
  // ── Headline
  headline: { fontSize: 26, fontWeight: '300', color: C.white, textAlign: 'center', marginBottom: 8 },
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
  input: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    paddingVertical: 10,
    backgroundColor: 'transparent', // prevents Android from painting its own white bg on focus
  },
  micBtn: { padding: 6, marginLeft: 4 },

  // ── Error
  errorBox: {
    backgroundColor: `${C.crimson}18`,
    borderWidth: 1,
    borderColor: `${C.crimson}40`,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: C.crimson, fontSize: 13 },

  // ── Submit button (green → yellow)
  submitBtn: {
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#001A20', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // ── Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: C.textTer, fontSize: 13 },

  // ── Google button (Google brand spec: white bg, #1F1F1F label, 1px border)
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 48,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  googleDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E0E0E0',
  },
  googleText: {
    color: '#1F1F1F',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.25,
  },

  // ── Footer
  footer: {
    color: C.textTer,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 18,
  },
});
