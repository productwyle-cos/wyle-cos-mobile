// src/screens/Onboarding/SplashScreen.tsx
// Brand landing page — first thing user sees
// Colors, fonts, shapes all from Wyle brand guidelines PDF

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavProp } from '../../../app/index';

const { width, height } = Dimensions.get('window');

const C = {
  bg:         '#002F3A',
  surface:    '#0A3D4A',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  salmon:     '#FF9F8A',
  crimson:    '#D7263D',
  white:      '#FEFFFE',
  textSec:    '#8FB8BF',
  border:     '#1A5060',
};

export default function SplashScreen({ navigation }: { navigation: NavProp }) {
  const logoFade   = useRef(new Animated.Value(0)).current;
  const tagFade    = useRef(new Animated.Value(0)).current;
  const cardsFade  = useRef(new Animated.Value(0)).current;
  const ctaSlide   = useRef(new Animated.Value(60)).current;
  const ctaFade    = useRef(new Animated.Value(0)).current;
  const shape1X    = useRef(new Animated.Value(-120)).current;
  const shape2X    = useRef(new Animated.Value(120)).current;
  const pulse      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Shapes fly in
    Animated.parallel([
      Animated.spring(shape1X, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }),
      Animated.spring(shape2X, { toValue: 0, tension: 50, friction: 9, useNativeDriver: true }),
    ]).start();

    // Staggered content reveal
    Animated.sequence([
      Animated.timing(logoFade,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(tagFade,   { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(cardsFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(ctaFade,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(ctaSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();

    // CTA pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.03, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const VALUE_CARDS = [
    { emoji: '🛂', title: 'Never miss a deadline', body: 'Visas, IDs, insurance — all tracked automatically.' },
    { emoji: '🍽️', title: 'Food in 3 taps',         body: 'Tell Wyle what you want. Done.' },
    { emoji: '◎',  title: 'Your Buddy handles it',  body: 'Ask anything. Wyle acts on your behalf.' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Decorative brand shapes ─────────────────────────────────────── */}
      <Animated.View style={[styles.shapeTopLeft, { transform: [{ translateX: shape1X }] }]}>
        <View style={styles.semiCircle} />
      </Animated.View>
      <Animated.View style={[styles.shapeBottomRight, { transform: [{ translateX: shape2X }] }]}>
        <View style={styles.semiCircleSmall} />
      </Animated.View>
      <View style={styles.glowOrb} />

      <SafeAreaView style={styles.safe}>

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <Animated.View style={[styles.logoArea, { opacity: logoFade }]}>
          <Text style={styles.logo}>wyle</Text>
          <View style={styles.logoDot} />
        </Animated.View>

        {/* ── Hero headline ─────────────────────────────────────────────── */}
        <Animated.View style={[styles.heroArea, { opacity: tagFade }]}>
          <Text style={styles.hero}>Tell Wyle.{'\n'}It's handled.</Text>
          <Text style={styles.heroSub}>
            Your personal chief of staff for life in the UAE.
            One app. Every obligation. Done quietly.
          </Text>
        </Animated.View>

        {/* ── Value cards ───────────────────────────────────────────────── */}
        <Animated.View style={[styles.cardsArea, { opacity: cardsFade }]}>
          {VALUE_CARDS.map((card, i) => (
            <View key={i} style={styles.valueCard}>
              <Text style={styles.cardEmoji}>{card.emoji}</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardBody}>{card.body}</Text>
              </View>
            </View>
          ))}
        </Animated.View>

        {/* ── CTAs ──────────────────────────────────────────────────────── */}
        <Animated.View style={[styles.ctaArea, { opacity: ctaFade, transform: [{ translateY: ctaSlide }] }]}>
          {/* Primary — chartreuse = CTA per brand doc */}
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <TouchableOpacity
              style={styles.primaryCta}
              onPress={() => navigation.navigate('login')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryCtaText}>Get started</Text>
              {/* Toggle style from brand doc mockup */}
              <View style={styles.togglePill}>
                <View style={styles.toggleDot} />
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Secondary */}
          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={() => navigation.navigate('login')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryCtaText}>I already have an account</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Promise line ──────────────────────────────────────────────── */}
        <View style={styles.promise}>
          <View style={styles.promiseLine} />
          <Text style={styles.promiseText}>We're Your Local Everything</Text>
          <View style={styles.promiseLine} />
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  safe:      { flex: 1, paddingHorizontal: 24 },

  // Shapes
  shapeTopLeft:    { position: 'absolute', top: -40, left: -50, opacity: 0.2 },
  shapeBottomRight:{ position: 'absolute', bottom: 80, right: -40, opacity: 0.15 },
  semiCircle:      { width: 220, height: 110, borderTopLeftRadius: 110, borderTopRightRadius: 110, backgroundColor: C.verdigris, transform: [{ rotate: '15deg' }] },
  semiCircleSmall: { width: 140, height: 70, borderTopLeftRadius: 70, borderTopRightRadius: 70, backgroundColor: C.verdigris, transform: [{ rotate: '-20deg' }] },
  glowOrb:         { position: 'absolute', bottom: 180, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: C.verdigris, opacity: 0.06 },

  // Logo
  logoArea: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 4, gap: 6 },
  logo:     { fontSize: 38, fontWeight: '800', color: C.white, letterSpacing: -1.5 },
  logoDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.verdigris, marginTop: 4 },

  // Hero
  heroArea: { marginBottom: 32 },
  hero:     { fontSize: 46, fontWeight: '800', color: C.white, lineHeight: 52, letterSpacing: -1.5, marginBottom: 14 },
  heroSub:  { fontSize: 15, color: C.textSec, lineHeight: 22 },

  // Value cards
  cardsArea: { gap: 10, marginBottom: 32, flex: 1, justifyContent: 'center' },
  valueCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(27,153,139,0.08)',
    borderWidth: 1, borderColor: 'rgba(27,153,139,0.18)',
    borderRadius: 14, padding: 14,
  },
  cardEmoji: { fontSize: 26, width: 36, textAlign: 'center' },
  cardText:  { flex: 1 },
  cardTitle: { color: C.white, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  cardBody:  { color: C.textSec, fontSize: 12, lineHeight: 17 },

  // CTAs
  ctaArea: { gap: 10, paddingBottom: 8 },
  primaryCta: {
    backgroundColor: C.chartreuse, borderRadius: 999,
    paddingVertical: 18, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  primaryCtaText: { color: '#002F3A', fontSize: 17, fontWeight: '700' },
  togglePill:     { width: 44, height: 26, backgroundColor: 'rgba(0,47,58,0.2)', borderRadius: 13, alignItems: 'flex-end', paddingHorizontal: 3, justifyContent: 'center' },
  toggleDot:      { width: 20, height: 20, borderRadius: 10, backgroundColor: '#002F3A' },
  secondaryCta:   { alignItems: 'center', paddingVertical: 14 },
  secondaryCtaText: { color: C.textSec, fontSize: 14 },

  // Promise
  promise:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  promiseLine: { flex: 1, height: 1, backgroundColor: 'rgba(27,153,139,0.25)' },
  promiseText: { color: C.textSec, fontSize: 11, fontWeight: '500', letterSpacing: 0.4 },
});
