// src/screens/Onboarding/PreparationScreen.tsx
// Shown for ~2.5 s after login before the home screen.
// Displays a pulsing orb, personalised greeting, and a 3-dot loader.

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated,
  Dimensions, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavProp } from '../../../app/index';

const { width } = Dimensions.get('window');
const ORB = width * 0.52;

// ── Time-based greeting ───────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning,';
  if (h < 17) return 'Good Afternoon,';
  return 'Good Evening,';
}

// ── Heartbeat bar (simplified waveform) ──────────────────────────────────────
const WAVE = [1, 1, 2, 4, 10, 4, 2, 1, 1, 3, 1, 1];
function Waveform() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.waveRow}>
      {WAVE.map((h, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              height: h * 4,
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [i % 2 === 0 ? 0.5 : 0.9, i % 2 === 0 ? 0.9 : 0.5],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

// ── Three-dot bouncing loader ─────────────────────────────────────────────────
function ThreeDots() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    dots.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(dot, { toValue: -10, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0,   duration: 300, useNativeDriver: true }),
          Animated.delay(540 - i * 60),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { transform: [{ translateY: dot }] }]}
        />
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function PreparationScreen({ navigation }: { navigation: NavProp }) {
  const [firstName, setFirstName] = useState('');
  const fadeIn    = useRef(new Animated.Value(0)).current;
  const ring1     = useRef(new Animated.Value(1)).current;
  const ring2     = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Load user's first name
    AsyncStorage.getItem('wyle_user').then(json => {
      if (json) {
        try {
          const user = JSON.parse(json);
          setFirstName(user.name?.split(' ')[0] || '');
        } catch {}
      }
    });

    // Fade everything in
    Animated.timing(fadeIn, {
      toValue: 1, duration: 700, useNativeDriver: true,
    }).start();

    // Pulsing rings
    Animated.loop(
      Animated.sequence([
        Animated.timing(ring1, { toValue: 1.18, duration: 1200, useNativeDriver: true }),
        Animated.timing(ring1, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(ring2, { toValue: 1.35, duration: 1400, useNativeDriver: true }),
        Animated.timing(ring2, { toValue: 1,    duration: 1400, useNativeDriver: true }),
      ])
    ).start();

    // Navigate to home after 2.5 seconds
    const timer = setTimeout(() => navigation.navigate('home'), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <Animated.View style={[styles.content, { opacity: fadeIn }]}>

        {/* ── Orb ─────────────────────────────────────────────────────────── */}
        <View style={styles.orbWrap}>
          {/* Outer glow ring */}
          <Animated.View style={[
            styles.ring, styles.ringOuter,
            { transform: [{ scale: ring2 }] },
          ]} />
          {/* Mid glow ring */}
          <Animated.View style={[
            styles.ring, styles.ringMid,
            { transform: [{ scale: ring1 }] },
          ]} />

          {/* Core sphere — multi-colour gradient */}
          <LinearGradient
            colors={['#00C8FF', '#1B998B', '#A8FF3E', '#FF6B35']}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 0.9, y: 0.9 }}
            style={styles.orb}
          >
            {/* Inner dark overlay for depth */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.35)']}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Heartbeat waveform */}
            <Waveform />
          </LinearGradient>
        </View>

        {/* ── Text ─────────────────────────────────────────────────────────── */}
        <Text style={styles.greeting}>{getGreeting()}</Text>
        {!!firstName && <Text style={styles.name}>{firstName}</Text>}
        <Text style={styles.subtitle}>WYLE is ready to assist you</Text>

        {/* ── Three-dot loader ─────────────────────────────────────────────── */}
        <ThreeDots />

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // ── Orb
  orbWrap: {
    width: ORB,
    height: ORB,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 48,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
  },
  ringOuter: {
    width:  ORB * 1.0,
    height: ORB * 1.0,
    backgroundColor: 'rgba(27,153,139,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(27,153,139,0.15)',
  },
  ringMid: {
    width:  ORB * 0.88,
    height: ORB * 0.88,
    backgroundColor: 'rgba(27,153,139,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(27,153,139,0.25)',
  },
  orb: {
    width:  ORB * 0.72,
    height: ORB * 0.72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // ── Waveform
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    width: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },

  // ── Text
  greeting: {
    fontSize: 22,
    fontWeight: '400',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  name: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1B998B',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 36,
  },

  // ── Three dots
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1B998B',
  },
});
