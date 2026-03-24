import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// ─── Brand Colors (corrected from PDF) ────────────────────────────────────────
const C = {
  bg: '#002F3A',
  verdigris: '#1B998B',
  chartreuse: '#D5FF3F',
  salmon: '#FF9F8A',
  crimson: '#D7263D',
  white: '#FEFFFE',
  textSec: '#8FB8BF',
};

export default function WelcomeScreen({ navigation }: any) {
  // ── Animations ──────────────────────────────────────────────────────────────
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(40)).current;
  const shape1 = useRef(new Animated.Value(-80)).current;
  const shape2 = useRef(new Animated.Value(80)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Shapes slide in
    Animated.parallel([
      Animated.spring(shape1, { toValue: 0, tension: 60, friction: 10, useNativeDriver: true }),
      Animated.spring(shape2, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();

    // Content fades up
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(slideUp, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();

    // CTA button pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Brand shape decorations (from brand guidelines: semi-circle + S-curve) ── */}
      <Animated.View style={[styles.shape1, { transform: [{ translateX: shape1 }] }]}>
        <View style={styles.semiCircle} />
      </Animated.View>
      <Animated.View style={[styles.shape2, { transform: [{ translateX: shape2 }] }]}>
        <View style={styles.sCurveOuter}>
          <View style={styles.sCurveInner} />
        </View>
      </Animated.View>
      <View style={styles.shape3} />

      <SafeAreaView style={styles.safeArea}>
        {/* ── Logo area ───────────────────────────────────────────────────────── */}
        <Animated.View style={[styles.logoArea, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          {/* Logo wordmark — in real app use SVG asset */}
          <Text style={styles.logoText}>wyle</Text>
          <Text style={styles.logoSuperscript}>✕</Text>
        </Animated.View>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <Animated.View style={[styles.content, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
          {/* Headline — Poppins Bold per brand guidelines */}
          <Text style={styles.headline}>Tell Wyle.{'\n'}It's handled.</Text>

          {/* Subtitle — Montserrat per brand guidelines */}
          <Text style={styles.subtitle}>
            Your personal chief of staff.{'\n'}
            Life flows — you just live it.
          </Text>

          {/* Value props */}
          <View style={styles.valueProps}>
            {[
              { icon: '🛂', label: 'Obligations tracked' },
              { icon: '🍽️', label: 'Food in 3 taps' },
              { icon: '◎', label: 'Buddy handles the rest' },
            ].map((v, i) => (
              <View key={i} style={styles.valueProp}>
                <Text style={styles.valuePropIcon}>{v.icon}</Text>
                <Text style={styles.valuePropLabel}>{v.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── CTA — chartreuse = action/CTA per brand guidelines ──────────────── */}
        <Animated.View style={[styles.ctaArea, { opacity: fadeIn, transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => navigation.navigate('Preferences')}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Get started</Text>
            <View style={styles.ctaToggle}>
              <View style={styles.ctaToggleDot} />
            </View>
          </TouchableOpacity>

          <Text style={styles.alreadyHave}>
            Already have an account?{' '}
            <Text style={styles.signInLink}>Sign in</Text>
          </Text>
        </Animated.View>

        {/* ── Promise line ───────────────────────────────────────────────────── */}
        <Animated.View style={[styles.promiseArea, { opacity: fadeIn }]}>
          <View style={styles.promiseDivider} />
          <Text style={styles.promiseText}>We're Your Local Everything</Text>
          <View style={styles.promiseDivider} />
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
  },

  // ── Brand shapes ──────────────────────────────────────────────────────────
  shape1: {
    position: 'absolute',
    top: -60,
    left: -40,
    opacity: 0.25,
  },
  semiCircle: {
    width: 220,
    height: 110,
    borderTopLeftRadius: 110,
    borderTopRightRadius: 110,
    backgroundColor: C.verdigris,
    transform: [{ rotate: '20deg' }],
  },
  shape2: {
    position: 'absolute',
    top: 80,
    right: -50,
    opacity: 0.18,
  },
  sCurveOuter: {
    width: 100,
    height: 120,
    borderRadius: 50,
    borderWidth: 20,
    borderColor: C.verdigris,
  },
  sCurveInner: {
    position: 'absolute',
    bottom: -30,
    right: -10,
    width: 80,
    height: 100,
    borderRadius: 40,
    borderWidth: 20,
    borderColor: C.verdigris,
    transform: [{ scaleX: -1 }],
  },
  shape3: {
    position: 'absolute',
    bottom: 100,
    left: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: C.verdigris,
    opacity: 0.08,
  },

  // ── Logo ──────────────────────────────────────────────────────────────────
  logoArea: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700',
    color: C.white,
    letterSpacing: -1,
    // In real app: fontFamily: 'Poppins_700Bold'
  },
  logoSuperscript: {
    fontSize: 14,
    color: C.verdigris,
    marginTop: 6,
    marginLeft: 2,
  },

  // ── Content ───────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  headline: {
    fontSize: 48,
    fontWeight: '800',
    color: C.white,
    lineHeight: 54,
    letterSpacing: -1.5,
    marginBottom: 16,
    // fontFamily: 'Poppins_700Bold'
  },
  subtitle: {
    fontSize: 16,
    color: C.textSec,
    lineHeight: 24,
    marginBottom: 40,
    fontWeight: '400',
    // fontFamily: 'Montserrat_400Regular'
  },
  valueProps: {
    gap: 14,
  },
  valueProp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(27,153,139,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(27,153,139,0.2)',
    gap: 12,
  },
  valuePropIcon: { fontSize: 20 },
  valuePropLabel: {
    color: C.white,
    fontSize: 15,
    fontWeight: '500',
    // fontFamily: 'Inter_500Medium'
  },

  // ── CTA ───────────────────────────────────────────────────────────────────
  ctaArea: {
    paddingBottom: 8,
  },
  ctaButton: {
    backgroundColor: C.chartreuse,   // Chartreuse = CTA per brand doc
    borderRadius: 999,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    // Brand doc shows toggle-style CTA button
  },
  ctaText: {
    color: '#002F3A',                 // Jet Black text on chartreuse
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
    // fontFamily: 'Inter_600SemiBold'
  },
  ctaToggle: {
    width: 40,
    height: 24,
    backgroundColor: 'rgba(0,47,58,0.25)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 3,
  },
  ctaToggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#002F3A',
  },
  alreadyHave: {
    color: C.textSec,
    fontSize: 14,
    textAlign: 'center',
    // fontFamily: 'Inter_400Regular'
  },
  signInLink: {
    color: C.verdigris,
    fontWeight: '600',
  },

  // ── Promise ───────────────────────────────────────────────────────────────
  promiseArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    gap: 12,
  },
  promiseDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(27,153,139,0.3)',
  },
  promiseText: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    // fontFamily: 'Inter_500Medium'
  },
});
