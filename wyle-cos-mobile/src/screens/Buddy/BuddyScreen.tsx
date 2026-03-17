// src/screens/Buddy/BuddyScreen.tsx
// Voice: expo-av (record) → Whisper (transcribe) → Claude (respond) → expo-speech (speak back)
// Dark palette, no back button, 5-tab footer with hologram orb

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Animated,
  StatusBar, ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import type { NavProp } from '../../../app/index';
import { VoiceService } from '../../services/voiceService';
import { useAppStore } from '../../store';
import { UIObligation } from '../../types';

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

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const OPENAI_API_KEY    = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

function buildSystemPrompt(obligations: UIObligation[]): string {
  const active    = obligations.filter(o => o.status === 'active');
  const completed = obligations.filter(o => o.status === 'completed');

  const activeList = active.length > 0
    ? active.map(o =>
        `  * [ID:${o._id}] ${o.emoji} ${o.title} — ${o.daysUntil === 0 ? 'due TODAY' : `${o.daysUntil} days`} (${o.risk.toUpperCase()} RISK)${o.amount ? ` — AED ${o.amount.toLocaleString()}` : ''}`
      ).join('\n')
    : '  * No active obligations';

  const completedList = completed.length > 0
    ? completed.map(o => `  * ✅ ${o.emoji} ${o.title}`).join('\n')
    : '';

  return `You are Buddy, the AI-powered personal chief of staff inside Wyle — a life management app for busy professionals in Dubai, UAE.

Your personality:
- Calm, confident, warm, direct. You speak like a trusted friend who is highly competent.
- Every reply saves the user time. Be short and actionable. Max 3-4 sentences unless asked for more.
- Never panic. Focus on solutions.
- Human and respectful. Never robotic.
- When responding to voice, keep it even shorter — 2-3 sentences max so it sounds natural spoken aloud.

The user's current life context:
- Life Optimization Score (LOS): 74/100
- Location: Dubai, UAE
- Active obligations (${active.length}):
${activeList}${completedList ? `\n- Already completed:\n${completedList}` : ''}
- Time saved this week: 4h 20m
- Decisions handled: 12

Rules:
- Always show a certainty score (e.g. "95% confident") before suggesting an action
- When the user says they have paid, completed, done, or resolved an obligation, check the "Already completed" list first. If it is already there, tell the user it was already marked done — do NOT call the resolve_obligation tool again.
- Only call resolve_obligation for obligations that are currently in the Active obligations list.
- Respond in English unless user writes in Arabic, then respond in Arabic`;
}

const RESOLVE_TOOL = [{
  name: 'resolve_obligation',
  description: 'Mark an obligation as completed when the user says they have paid, done, completed, or resolved it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      obligation_id:    { type: 'string', description: 'The exact ID from the obligations list (e.g. "1", "6")' },
      obligation_title: { type: 'string', description: 'Human-readable title for the confirmation message' },
    },
    required: ['obligation_id', 'obligation_title'],
  },
}];

type Role = 'user' | 'buddy';
type Message = { id: string; role: Role; text: string; timestamp: Date };
type VoiceState = 'idle' | 'recording' | 'transcribing';

const QUICK_PROMPTS = [
  { label: '📋 Urgent items',  text: 'What are my most urgent tasks right now?' },
  { label: '🛂 Visa help',     text: 'Help me renew my UAE residence visa.' },
  { label: '⏱️ Morning brief', text: 'Give me my morning brief for today.' },
  { label: '💡 Pay DEWA',      text: 'Help me pay my DEWA bill.' },
  { label: '📊 My LOS score',  text: 'Explain my Life Optimization Score of 74.' },
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
// 5-item Tab Bar — consistent with all screens
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
// Typing indicator (3-dot bounce)
// ─────────────────────────────────────────────────────────────────────────────
function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  useEffect(() => {
    dots.forEach((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: -7, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0,  duration: 280, useNativeDriver: true }),
          Animated.delay(500),
        ])
      ).start()
    );
  }, []);
  return (
    <View style={ti.row}>
      <View style={ti.avatar}>
        <Text style={ti.avatarText}>◎</Text>
      </View>
      <View style={ti.bubble}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[ti.dot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
}
const ti = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14, paddingHorizontal: 16 },
  avatar:     {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: `${C.verdigris}18`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${C.verdigris}35`,
  },
  avatarText: { color: C.verdigris, fontSize: 14 },
  bubble:     {
    backgroundColor: C.surface, borderRadius: 18, borderBottomLeftRadius: 4,
    padding: 16, flexDirection: 'row', gap: 6, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  dot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: C.verdigris },
});

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser  = message.role === 'user';
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideUp, { toValue: 0, tension: 120, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);
  const time = message.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (isUser) {
    return (
      <Animated.View style={[bub.userRow, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
        <View style={bub.userBubble}>
          <Text style={bub.userText}>{message.text}</Text>
        </View>
        <Text style={bub.time}>{time}</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[bub.buddyRow, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
      <View style={bub.avatar}>
        <Text style={bub.avatarText}>◎</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={bub.buddyLabel}>BUDDY</Text>
        <View style={bub.buddyBubble}>
          <Text style={bub.buddyText}>{message.text}</Text>
        </View>
        <Text style={[bub.time, { alignSelf: 'flex-start', marginLeft: 4 }]}>{time}</Text>
      </View>
    </Animated.View>
  );
}
const bub = StyleSheet.create({
  userRow:    { alignItems: 'flex-end', marginBottom: 16, paddingHorizontal: 16 },
  userBubble: {
    backgroundColor: C.verdigris, borderRadius: 20, borderBottomRightRadius: 4,
    padding: 14, maxWidth: width * 0.72,
  },
  userText:   { color: C.white, fontSize: 15, lineHeight: 21 },
  buddyRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16, paddingHorizontal: 16 },
  avatar:     {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: `${C.verdigris}18`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${C.verdigris}35`,
    marginTop: 18,
  },
  avatarText: { color: C.verdigris, fontSize: 14 },
  buddyLabel: { color: C.verdigris, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  buddyBubble:{
    backgroundColor: C.surface, borderRadius: 20, borderBottomLeftRadius: 4,
    padding: 14, maxWidth: width * 0.72, borderWidth: 1, borderColor: C.border,
  },
  buddyText:  { color: C.white, fontSize: 15, lineHeight: 22 },
  time:       { color: C.textTer, fontSize: 10, marginTop: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mic button with animated ring
// ─────────────────────────────────────────────────────────────────────────────
function MicButton({ voiceState, onPress }: { voiceState: VoiceState; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (voiceState === 'recording') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [voiceState]);

  const isRecording    = voiceState === 'recording';
  const isTranscribing = voiceState === 'transcribing';
  const bgColor     = isRecording ? `${C.salmon}28` : isTranscribing ? `${C.chartreuse}18` : `${C.salmon}14`;
  const borderColor = isRecording ? C.salmon : isTranscribing ? C.chartreuse : `${C.salmon}38`;

  return (
    <TouchableOpacity onPress={onPress} disabled={isTranscribing}>
      <Animated.View style={[mic.btn, { backgroundColor: bgColor, borderColor, transform: [{ scale: pulse }] }]}>
        {isTranscribing
          ? <ActivityIndicator color={C.chartreuse} size="small" />
          : <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎙️'}</Text>
        }
      </Animated.View>
    </TouchableOpacity>
  );
}
const mic = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BuddyScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const obligations       = useAppStore(st => st.obligations);
  const resolveObligation = useAppStore(st => st.resolveObligation);

  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'buddy',
    text: "Hey! I'm Buddy — your personal chief of staff. 👋\n\nYou have 2 urgent items today: your UAE visa expires in 8 days and your school fee of AED 14,000 is due today.\n\nTap 🎙️ to talk, or type below.",
    timestamp: new Date(),
  }]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [showQuick, setShowQuick]     = useState(true);
  const [voiceState, setVoiceState]   = useState<VoiceState>('idle');
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [pendingResolve, setPendingResolve] = useState<{ id: string; title: string } | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const listRef      = useRef<FlatList>(null);

  const scrollToEnd = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);

  // ── Confirm / cancel a pending resolve ─────────────────────────────────────
  const handleConfirmResolve = () => {
    if (!pendingResolve) return;
    resolveObligation(pendingResolve.id);
    const msg = `✅ Done! "${pendingResolve.title}" is marked as completed and removed from your active list.`;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'buddy', text: msg, timestamp: new Date() }]);
    speakText(`Done! ${pendingResolve.title} has been marked as completed.`);
    setPendingResolve(null);
    scrollToEnd();
  };

  const handleCancelResolve = () => {
    if (!pendingResolve) return;
    const msg = `No problem! "${pendingResolve.title}" stays in your active list.`;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'buddy', text: msg, timestamp: new Date() }]);
    setPendingResolve(null);
    scrollToEnd();
  };

  // ── Claude API call ─────────────────────────────────────────────────────────
  const sendMessage = async (text: string, speakResponse = false) => {
    if (!text.trim() || loading) return;

    if (pendingResolve) {
      const lower = text.trim().toLowerCase();
      const isYes = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm', 'do it', 'go ahead', 'remove it', 'mark it'].some(w => lower.includes(w));
      const isNo  = ['no', 'nope', 'cancel', 'keep', "don't", 'stop'].some(w => lower.includes(w));
      if (isYes) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text, timestamp: new Date() }]);
        handleConfirmResolve(); return;
      }
      if (isNo) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text, timestamp: new Date() }]);
        handleCancelResolve(); return;
      }
    }

    setShowQuick(false);
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    scrollToEnd();

    try {
      const history = [...messages, userMsg]
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant' as const, content: m.text }));

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
          max_tokens: 500,
          system: buildSystemPrompt(obligations),
          tools: RESOLVE_TOOL,
          messages: history,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'API error');

      if (data.stop_reason === 'tool_use') {
        const toolUse = data.content?.find((c: any) => c.type === 'tool_use');
        if (toolUse?.name === 'resolve_obligation') {
          const { obligation_id, obligation_title } = toolUse.input;
          setPendingResolve({ id: obligation_id, title: obligation_title });
          const askText = `Should I mark "${obligation_title}" as completed and remove it from your active list?`;
          setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'buddy', text: askText, timestamp: new Date() }]);
          if (speakResponse) speakText(`Should I mark ${obligation_title} as completed and remove it from your list?`);
          return;
        }
      }

      const responseText = data.content?.[0]?.text ?? "Something went wrong. Try again?";
      const buddyMsg: Message = { id: (Date.now() + 1).toString(), role: 'buddy', text: responseText, timestamp: new Date() };
      setMessages(prev => [...prev, buddyMsg]);
      if (speakResponse) speakText(responseText);
    } catch {
      const fallback = "I'm having a connection issue. Your most urgent item is your UAE visa — it expires in 8 days. Want me to walk you through the GDRFA renewal process?";
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'buddy', text: fallback, timestamp: new Date() }]);
      if (speakResponse) speakText(fallback);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  // ── Text-to-speech ──────────────────────────────────────────────────────────
  const speakText = (text: string) => {
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'en-US', rate: 0.92, pitch: 1.0,
      onDone:  () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const stopSpeaking = () => { Speech.stop(); setIsSpeaking(false); };

  // ── Voice recording flow ────────────────────────────────────────────────────
  const handleVoicePress = () => {
    if (voiceState === 'recording') {
      VoiceService.stop(
        (transcript) => sendMessage(transcript, true),
        setVoiceState
      );
    } else if (voiceState === 'idle') {
      VoiceService.start(
        (transcript) => sendMessage(transcript, true),
        setVoiceState
      );
    }
  };

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone Access', 'Please allow microphone access in Settings to use voice with Buddy.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setVoiceState('recording');
    } catch {
      Alert.alert('Error', 'Could not start recording. Try again.');
    }
  };

  const stopRecording = async () => {
    try {
      setVoiceState('transcribing');
      const recording = recordingRef.current;
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error('No recording URI');

      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });

      const whisperData = await whisperRes.json();
      const transcribed = whisperData?.text?.trim();

      if (!transcribed) {
        Alert.alert("Didn't catch that", "I couldn't hear you clearly. Try again?");
        setVoiceState('idle'); return;
      }

      setVoiceState('idle');
      await sendMessage(transcribed, true);
    } catch {
      setVoiceState('idle');
      Alert.alert('Error', 'Could not process voice. Please type your message instead.');
    }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <SafeAreaView edges={['top']}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          {/* Buddy identity */}
          <View style={s.headerLeft}>
            <View style={s.buddyRing}>
              <Text style={s.buddyRingIcon}>◎</Text>
            </View>
            <View>
              <Text style={s.headerTitle}>Buddy</Text>
              <Text style={s.headerSub}>Personal Chief of Staff</Text>
            </View>
          </View>

          {/* Right controls */}
          <View style={s.headerRight}>
            {isSpeaking && (
              <TouchableOpacity style={s.speakingBtn} onPress={stopSpeaking}>
                <Text style={s.speakingBtnText}>⏸ Stop</Text>
              </TouchableOpacity>
            )}
            <MicButton voiceState={voiceState} onPress={handleVoicePress} />
          </View>
        </View>

        {/* ── Status bar ─────────────────────────────────────────────────── */}
        <View style={s.statusBar}>
          <View style={[
            s.statusDot,
            { backgroundColor: voiceState === 'recording' ? C.salmon : C.verdigris },
          ]} />
          <Text style={s.statusText}>
            {voiceState === 'recording'    ? '🔴 Listening... tap mic to stop' :
             voiceState === 'transcribing' ? '⏳ Processing voice...' :
             isSpeaking                    ? '🔊 Buddy is speaking...' :
             'Online · Knows your full life context'}
          </Text>
        </View>
      </SafeAreaView>

      {/* ── Message area ───────────────────────────────────────────────────── */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={s.msgList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          ListFooterComponent={loading ? <TypingIndicator /> : null}
        />

        {/* Quick prompt chips */}
        {showQuick && (
          <View style={s.quickWrap}>
            <Text style={s.quickLabel}>TRY ASKING</Text>
            <View style={s.quickRow}>
              {QUICK_PROMPTS.map((p, i) => (
                <TouchableOpacity key={i} style={s.chip} onPress={() => sendMessage(p.text)}>
                  <Text style={s.chipText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Confirmation bar — appears when Buddy asks to resolve */}
        {pendingResolve && (
          <View style={s.confirmBar}>
            <TouchableOpacity style={s.confirmYes} onPress={handleConfirmResolve}>
              <Text style={s.confirmYesText}>✓ Yes, mark as done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmNo} onPress={handleCancelResolve}>
              <Text style={s.confirmNoText}>Keep it</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={voiceState === 'recording' ? 'Listening...' : 'Ask Buddy anything...'}
            placeholderTextColor={voiceState === 'recording' ? C.salmon : C.textTer}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => sendMessage(input)}
            editable={voiceState === 'idle'}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading || voiceState !== 'idle') && { opacity: 0.35 }]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading || voiceState !== 'idle'}
          >
            {loading
              ? <ActivityIndicator color={C.bg} size="small" />
              : <Text style={s.sendIcon}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <TabBar active="buddy" onTab={(sc) => nav.navigate(sc)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buddyRing: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: `${C.verdigris}18`,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.verdigris,
  },
  buddyRingIcon: { color: C.verdigris, fontSize: 20 },
  headerTitle:   { color: C.white, fontSize: 18, fontWeight: '700' },
  headerSub:     { color: C.textSec, fontSize: 11 },
  speakingBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: `${C.salmon}14`, borderWidth: 1, borderColor: `${C.salmon}30`,
  },
  speakingBtnText: { color: C.salmon, fontSize: 13, fontWeight: '600' },

  // ── Status bar
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  statusDot:  { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: C.textTer, fontSize: 11 },

  // ── Messages
  msgList:   { paddingTop: 14, paddingBottom: 8 },
  quickWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
  quickLabel:{ color: C.textTer, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  quickRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: C.surface, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: C.border,
  },
  chipText: { color: C.textSec, fontSize: 12 },

  // ── Confirmation bar
  confirmBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderColor: `${C.verdigris}28`,
    backgroundColor: `${C.verdigris}06`,
  },
  confirmYes:     { flex: 1, backgroundColor: C.verdigris, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  confirmYesText: { color: C.white, fontSize: 14, fontWeight: '700' },
  confirmNo:      { flex: 1, backgroundColor: C.surface, borderRadius: 999, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  confirmNoText:  { color: C.textSec, fontSize: 14, fontWeight: '600' },

  // ── Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderColor: C.border, backgroundColor: C.bg,
  },
  input: {
    flex: 1, backgroundColor: C.surface, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 11,
    color: C.white, fontSize: 15, maxHeight: 100,
    borderWidth: 1, borderColor: C.border,
  },
  sendBtn:  { width: 44, height: 44, borderRadius: 22, backgroundColor: C.chartreuse, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: C.bg, fontSize: 22, fontWeight: '700', lineHeight: 26 },

  // ── Tab bar
  tabBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111111',
    borderTopWidth: 1, borderColor: C.border,
    paddingBottom: 20, paddingTop: 8, height: 80,
  },
  tabItem:  { flex: 1, alignItems: 'center', gap: 3 },
  tabIcon:  { fontSize: 20, color: C.textTer },
  tabLabel: { fontSize: 10, color: C.textTer, fontWeight: '500' },
  tabDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: C.verdigris, marginTop: 2 },

  // ── Hologram orb
  orbWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -24 },
  orb: {
    width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  orbWave:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  orbWaveBar: { width: 2.5, backgroundColor: '#FFFFFF', borderRadius: 2, opacity: 0.9 },
});
