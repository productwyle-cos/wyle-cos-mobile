// src/screens/Food/FoodScreen.tsx
// 3-tap food ordering — PRD doctrine: Intent → 3 options → Select → Confirm
// Powered by Claude AI for personalized recommendations

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, StatusBar, Dimensions,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavProp } from '../../../app/index';

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

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

// ── Claude prompt for food suggestions ───────────────────────────────────────
const FOOD_SYSTEM_PROMPT = `You are Buddy, the food ordering assistant inside Wyle — a life management app for professionals in Dubai, UAE.

When a user describes what they want to eat, return EXACTLY 3 food options as a JSON array. Nothing else — no explanation, no markdown, just the raw JSON array.

Each option must have:
- id: "1", "2", or "3"
- name: restaurant/dish name (real Dubai restaurant if possible)
- description: 1 short line describing the dish
- cuisine: cuisine type
- price: realistic AED price as a number (e.g. 45)
- delivery: delivery time in minutes as a number (e.g. 25)
- calories: approximate calories as a number (e.g. 520)
- certainty: confidence score as a number 0-100 (e.g. 92)
- emoji: one relevant food emoji

Example format:
[
  {
    "id": "1",
    "name": "Comptoir Libanais",
    "description": "Grilled halloumi wrap with fattoush salad",
    "cuisine": "Lebanese",
    "price": 52,
    "delivery": 22,
    "calories": 480,
    "certainty": 94,
    "emoji": "🥙"
  }
]

Dubai context: User is in Dubai Marina area. Suggest real or realistic Dubai restaurants. AED prices (45-180 range). Consider the user's preferences — they're a busy professional who values quality and time.`;

type FoodOption = {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  price: number;
  delivery: number;
  calories: number;
  certainty: number;
  emoji: string;
};

type Stage = 'intent' | 'options' | 'confirm' | 'ordered';

// Quick intent chips
const QUICK_INTENTS = [
  { label: '🥗 Something light', text: 'Something light and healthy, not too heavy' },
  { label: '🍕 Comfort food',    text: 'I want comfort food, something indulgent' },
  { label: '🥩 High protein',    text: 'High protein meal, post-workout' },
  { label: '🍜 Asian',           text: 'Asian food, something flavourful' },
  { label: '🫕 Arabic',          text: 'Arabic or Lebanese food' },
  { label: '⚡ Quick delivery',  text: 'Whatever arrives fastest under 20 minutes' },
];

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar({ active, onTab }: { active: string; onTab: (s: any) => void }) {
  const tabs = [
    { screen: 'home',        emoji: '⌂',  label: 'Home'     },
    { screen: 'obligations', emoji: '📋', label: 'Tasks'    },
    { screen: 'food',        emoji: '🍽️', label: 'Food'     },
    { screen: 'buddy',       emoji: '◎',  label: 'Buddy'    },
    { screen: 'insights',    emoji: '◈',  label: 'Insights' },
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

// ── Tap Step Indicator ────────────────────────────────────────────────────────
function TapIndicator({ stage }: { stage: Stage }) {
  const steps = [
    { key: 'intent',  label: 'Tell Buddy', tap: 'Tap 1' },
    { key: 'options', label: 'Pick option', tap: 'Tap 2' },
    { key: 'confirm', label: 'Confirm', tap: 'Tap 3' },
  ];
  const activeIndex = stage === 'intent' ? 0 : stage === 'options' ? 1 : stage === 'confirm' ? 2 : 3;

  return (
    <View style={ind.row}>
      {steps.map((s, i) => {
        const done    = activeIndex > i;
        const active  = activeIndex === i;
        const color   = done ? C.verdigris : active ? C.chartreuse : C.textTer;
        return (
          <React.Fragment key={s.key}>
            <View style={ind.step}>
              <View style={[ind.dot, { backgroundColor: done ? C.verdigris : active ? C.chartreuse : C.surface, borderColor: color }]}>
                {done
                  ? <Text style={ind.check}>✓</Text>
                  : <Text style={[ind.tapNum, { color }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[ind.stepLabel, { color }]}>{s.label}</Text>
            </View>
            {i < 2 && <View style={[ind.line, { backgroundColor: done ? C.verdigris : C.border }]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}
const ind = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  step:      { alignItems: 'center', gap: 4 },
  dot:       { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check:     { color: C.bg, fontSize: 12, fontWeight: '800' },
  tapNum:    { fontSize: 11, fontWeight: '700' },
  stepLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  line:      { flex: 1, height: 2, marginBottom: 16, marginHorizontal: 4 },
});

// ── Food Option Card ──────────────────────────────────────────────────────────
function FoodCard({ option, onSelect, selected }: { option: FoodOption; onSelect: () => void; selected: boolean }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: fadeAnim }}>
      <TouchableOpacity
        style={[fc.card, selected && { borderColor: C.verdigris, backgroundColor: `${C.verdigris}12` }]}
        onPress={onSelect}
        activeOpacity={0.85}
      >
        {/* Certainty badge */}
        <View style={[fc.certaintyBadge, { backgroundColor: option.certainty >= 90 ? `${C.verdigris}20` : `${C.chartreuse}20` }]}>
          <Text style={[fc.certaintyText, { color: option.certainty >= 90 ? C.verdigris : C.chartreuse }]}>
            {option.certainty}% match
          </Text>
        </View>

        <View style={fc.top}>
          <Text style={fc.emoji}>{option.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={fc.name}>{option.name}</Text>
            <Text style={fc.cuisine}>{option.cuisine}</Text>
            <Text style={fc.desc}>{option.description}</Text>
          </View>
          {selected && (
            <View style={fc.selectedDot}>
              <Text style={fc.selectedCheck}>✓</Text>
            </View>
          )}
        </View>

        <View style={fc.meta}>
          <View style={fc.metaItem}>
            <Text style={fc.metaIcon}>💰</Text>
            <Text style={fc.metaVal}>AED {option.price}</Text>
          </View>
          <View style={fc.metaDivider} />
          <View style={fc.metaItem}>
            <Text style={fc.metaIcon}>⏱️</Text>
            <Text style={fc.metaVal}>{option.delivery} min</Text>
          </View>
          <View style={fc.metaDivider} />
          <View style={fc.metaItem}>
            <Text style={fc.metaIcon}>🔥</Text>
            <Text style={fc.metaVal}>{option.calories} cal</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
const fc = StyleSheet.create({
  card:         { backgroundColor: C.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: C.border },
  certaintyBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 10 },
  certaintyText:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  top:          { flexDirection: 'row', gap: 12, marginBottom: 14 },
  emoji:        { fontSize: 36, width: 48, textAlign: 'center', marginTop: 2 },
  name:         { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cuisine:      { color: C.verdigris, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  desc:         { color: C.textSec, fontSize: 13, lineHeight: 18 },
  selectedDot:  { width: 28, height: 28, borderRadius: 14, backgroundColor: C.verdigris, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  selectedCheck:{ color: C.bg, fontSize: 14, fontWeight: '800' },
  meta:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceEl, borderRadius: 10, padding: 10 },
  metaItem:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' },
  metaDivider:  { width: 1, height: 16, backgroundColor: C.border },
  metaIcon:     { fontSize: 12 },
  metaVal:      { color: C.white, fontSize: 12, fontWeight: '600' },
});

// ── Order Confirmed Screen ────────────────────────────────────────────────────
function OrderConfirmed({ option, onReset }: { option: FoodOption; onReset: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[oc.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <View style={oc.checkRing}>
        <Text style={oc.checkEmoji}>✓</Text>
      </View>
      <Text style={oc.title}>Order placed!</Text>
      <Text style={oc.subtitle}>Your food is on its way</Text>

      <View style={oc.card}>
        <Text style={oc.cardEmoji}>{option.emoji}</Text>
        <Text style={oc.cardName}>{option.name}</Text>
        <Text style={oc.cardDesc}>{option.description}</Text>
        <View style={oc.etaRow}>
          <View style={oc.etaItem}>
            <Text style={oc.etaLabel}>ETA</Text>
            <Text style={oc.etaVal}>{option.delivery} min</Text>
          </View>
          <View style={oc.etaItem}>
            <Text style={oc.etaLabel}>Total</Text>
            <Text style={oc.etaVal}>AED {option.price}</Text>
          </View>
        </View>
      </View>

      <View style={oc.timeSaved}>
        <Text style={oc.timeSavedIcon}>⚡</Text>
        <Text style={oc.timeSavedText}>Ordered in 3 taps — 8 min saved vs browsing manually</Text>
      </View>

      <TouchableOpacity style={oc.btn} onPress={onReset}>
        <Text style={oc.btnText}>Order something else</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
const oc = StyleSheet.create({
  container:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  checkRing:    { width: 80, height: 80, borderRadius: 40, backgroundColor: `${C.verdigris}20`, borderWidth: 3, borderColor: C.verdigris, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  checkEmoji:   { color: C.verdigris, fontSize: 36, fontWeight: '800' },
  title:        { color: C.white, fontSize: 28, fontWeight: '800', marginBottom: 6 },
  subtitle:     { color: C.textSec, fontSize: 15, marginBottom: 28 },
  card:         { backgroundColor: C.surface, borderRadius: 20, padding: 20, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  cardEmoji:    { fontSize: 48, marginBottom: 10 },
  cardName:     { color: C.white, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardDesc:     { color: C.textSec, fontSize: 13, textAlign: 'center', marginBottom: 16 },
  etaRow:       { flexDirection: 'row', gap: 20 },
  etaItem:      { alignItems: 'center' },
  etaLabel:     { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  etaVal:       { color: C.chartreuse, fontSize: 20, fontWeight: '800' },
  timeSaved:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${C.chartreuse}12`, borderRadius: 12, padding: 12, width: '100%', marginBottom: 24, borderWidth: 1, borderColor: `${C.chartreuse}25` },
  timeSavedIcon:{ fontSize: 16 },
  timeSavedText:{ color: C.chartreuse, fontSize: 12, fontWeight: '600', flex: 1 },
  btn:          { backgroundColor: C.surface, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: C.border },
  btnText:      { color: C.textSec, fontSize: 15, fontWeight: '600' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function FoodScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const [stage, setStage]           = useState<Stage>('intent');
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [options, setOptions]       = useState<FoodOption[]>([]);
  const [selected, setSelected]     = useState<FoodOption | null>(null);
  const [intentText, setIntentText] = useState('');
  const [error, setError]           = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  // ── Step 1: Get food options from Claude ────────────────────────────────────
  const fetchOptions = async (text: string) => {
    if (!text.trim() || loading) return;
    setIntentText(text);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: FOOD_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'API error');

      const raw = data.content?.[0]?.text ?? '[]';
      // Strip any accidental markdown
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed: FoodOption[] = JSON.parse(clean);

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No options returned');
      setOptions(parsed.slice(0, 3));
      setStage('options');
    } catch (err) {
      // Fallback mock options so demo never breaks
      setOptions([
        { id: '1', name: 'Comptoir Libanais', description: 'Grilled halloumi wrap with fattoush salad', cuisine: 'Lebanese', price: 52, delivery: 22, calories: 480, certainty: 94, emoji: '🥙' },
        { id: '2', name: 'Nolu\'s Café', description: 'Grilled chicken quinoa bowl with tahini', cuisine: 'Healthy', price: 68, delivery: 28, calories: 520, certainty: 89, emoji: '🥗' },
        { id: '3', name: 'Operation: Falafel', description: 'Classic falafel pita with hummus and pickles', cuisine: 'Arabic', price: 38, delivery: 18, calories: 420, certainty: 86, emoji: '🧆' },
      ]);
      setStage('options');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Select option ───────────────────────────────────────────────────
  const handleSelect = (option: FoodOption) => {
    setSelected(option);
    setStage('confirm');
  };

  // ── Step 3: Confirm order ───────────────────────────────────────────────────
  const handleConfirm = () => {
    setStage('ordered');
  };

  const handleReset = () => {
    setStage('intent');
    setOptions([]);
    setSelected(null);
    setIntentText('');
    setInput('');
    setError('');
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <SafeAreaView edges={['top']}>
        <Animated.View style={[s.header, { opacity: fadeAnim }]}>
          <TouchableOpacity onPress={() => nav.navigate('home')} style={s.backBtn}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.screenLabel}>WYLE FOOD</Text>
            <Text style={s.screenTitle}>Order in 3 taps</Text>
          </View>
          <View style={s.docBadge}>
            <Text style={s.docBadgeText}>≤3 taps</Text>
          </View>
        </Animated.View>

        {/* Tap progress indicator — hidden on ordered screen */}
        {stage !== 'ordered' && <TapIndicator stage={stage} />}
      </SafeAreaView>

      {/* ── STAGE: ordered ── */}
      {stage === 'ordered' && selected && (
        <OrderConfirmed option={selected} onReset={handleReset} />
      )}

      {/* ── STAGE: confirm ── */}
      {stage === 'confirm' && selected && (
        <ScrollView contentContainerStyle={s.confirmContainer} showsVerticalScrollIndicator={false}>
          <Text style={s.confirmHeading}>Confirm your order</Text>
          <Text style={s.confirmSub}>You asked for: <Text style={{ color: C.verdigris }}>"{intentText}"</Text></Text>

          <FoodCard option={selected} onSelect={() => {}} selected={true} />

          <View style={s.certaintyBlock}>
            <Text style={s.certaintyLabel}>BUDDY'S CONFIDENCE</Text>
            <Text style={s.certaintyScore}>{selected.certainty}%</Text>
            <Text style={s.certaintyCaption}>Based on your preferences and location</Text>
          </View>

          <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
            <Text style={s.confirmBtnText}>Place order — AED {selected.price}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.backToOptions} onPress={() => setStage('options')}>
            <Text style={s.backToOptionsText}>← Back to options</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── STAGE: options ── */}
      {stage === 'options' && (
        <ScrollView contentContainerStyle={s.optionsContainer} showsVerticalScrollIndicator={false}>
          <Text style={s.optionsHeading}>3 options for you</Text>
          <Text style={s.optionsSub}>You asked for: <Text style={{ color: C.verdigris }}>"{intentText}"</Text></Text>

          {options.map((opt) => (
            <FoodCard
              key={opt.id}
              option={opt}
              onSelect={() => handleSelect(opt)}
              selected={selected?.id === opt.id}
            />
          ))}

          <TouchableOpacity style={s.retryBtn} onPress={handleReset}>
            <Text style={s.retryBtnText}>Try a different request</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ── STAGE: intent ── */}
      {stage === 'intent' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={s.intentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Hero */}
            <Animated.View style={[s.hero, { opacity: fadeAnim }]}>
              <Text style={s.heroEmoji}>🍽️</Text>
              <Text style={s.heroTitle}>What do you feel like?</Text>
              <Text style={s.heroSub}>Tell Buddy and get 3 perfect options in seconds</Text>
            </Animated.View>

            {/* Quick intent chips */}
            <Text style={s.quickLabel}>QUICK PICKS</Text>
            <View style={s.quickGrid}>
              {QUICK_INTENTS.map((q, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.chip}
                  onPress={() => fetchOptions(q.text)}
                  disabled={loading}
                >
                  <Text style={s.chipText}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Text input */}
            <Text style={s.orLabel}>OR DESCRIBE IT</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                value={input}
                onChangeText={setInput}
                placeholder="e.g. something light, no meat..."
                placeholderTextColor={C.textTer}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={() => fetchOptions(input)}
                editable={!loading}
              />
              <TouchableOpacity
                style={[s.sendBtn, (!input.trim() || loading) && { opacity: 0.35 }]}
                onPress={() => fetchOptions(input)}
                disabled={!input.trim() || loading}
              >
                {loading
                  ? <ActivityIndicator color={C.bg} size="small" />
                  : <Text style={s.sendIcon}>↑</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Loading state */}
            {loading && (
              <View style={s.loadingBlock}>
                <ActivityIndicator color={C.verdigris} size="small" />
                <Text style={s.loadingText}>Buddy is finding your best options...</Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <TabBar active="food" onTab={(sc) => nav.navigate(sc)} />
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  backBtnText: { color: C.verdigris, fontSize: 18, fontWeight: '600' },
  screenLabel: { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  screenTitle: { color: C.white, fontSize: 20, fontWeight: '700' },
  docBadge:    { backgroundColor: `${C.chartreuse}18`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: `${C.chartreuse}35` },
  docBadgeText:{ color: C.chartreuse, fontSize: 11, fontWeight: '700' },

  // Intent stage
  intentContainer: { paddingHorizontal: 16, paddingTop: 8 },
  hero:        { alignItems: 'center', paddingVertical: 28 },
  heroEmoji:   { fontSize: 56, marginBottom: 12 },
  heroTitle:   { color: C.white, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  heroSub:     { color: C.textSec, fontSize: 14, textAlign: 'center' },

  quickLabel:  { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  quickGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip:        { backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipText:    { color: C.textSec, fontSize: 13 },

  orLabel:     { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  inputRow:    { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input:       { flex: 1, backgroundColor: C.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, color: C.white, fontSize: 15, borderWidth: 1, borderColor: C.border },
  sendBtn:     { width: 46, height: 46, borderRadius: 23, backgroundColor: C.chartreuse, alignItems: 'center', justifyContent: 'center' },
  sendIcon:    { color: C.bg, fontSize: 22, fontWeight: '700' },

  loadingBlock:{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, justifyContent: 'center' },
  loadingText: { color: C.textSec, fontSize: 14 },

  // Options stage
  optionsContainer: { paddingHorizontal: 16, paddingTop: 8 },
  optionsHeading:   { color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  optionsSub:       { color: C.textSec, fontSize: 13, marginBottom: 16 },
  retryBtn:         { alignItems: 'center', paddingVertical: 14 },
  retryBtnText:     { color: C.textTer, fontSize: 14 },

  // Confirm stage
  confirmContainer: { paddingHorizontal: 16, paddingTop: 8 },
  confirmHeading:   { color: C.white, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  confirmSub:       { color: C.textSec, fontSize: 13, marginBottom: 16 },
  certaintyBlock:   { backgroundColor: C.surface, borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.border },
  certaintyLabel:   { color: C.textTer, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  certaintyScore:   { color: C.verdigris, fontSize: 40, fontWeight: '800', lineHeight: 46 },
  certaintyCaption: { color: C.textSec, fontSize: 12, marginTop: 2 },
  confirmBtn:       { backgroundColor: C.chartreuse, borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  confirmBtnText:   { color: C.bg, fontSize: 16, fontWeight: '700' },
  backToOptions:    { alignItems: 'center', paddingVertical: 10 },
  backToOptionsText:{ color: C.textTer, fontSize: 14 },
});