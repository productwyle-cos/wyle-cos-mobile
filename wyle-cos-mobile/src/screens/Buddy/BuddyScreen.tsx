// src/screens/Buddy/BuddyScreen.tsx
// Voice: expo-av (record) → Whisper (transcribe) → Claude (respond) → expo-speech (speak back)

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Animated,
  StatusBar, ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
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
// For voice transcription — Whisper is OpenAI. Get key at platform.openai.com
// You can use the same key structure: EXPO_PUBLIC_OPENAI_API_KEY=sk-...
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

const SYSTEM_PROMPT = `You are Buddy, the AI-powered personal chief of staff inside Wyle — a life management app for busy professionals in Dubai, UAE.

Your personality:
- Calm, confident, warm, direct. You speak like a trusted friend who is highly competent.
- Every reply saves the user time. Be short and actionable. Max 3-4 sentences unless asked for more.
- Never panic. Focus on solutions.
- Human and respectful. Never robotic.
- When responding to voice, keep it even shorter — 2-3 sentences max so it sounds natural spoken aloud.

The user's current life context:
- Life Optimization Score (LOS): 74/100
- Location: Dubai, UAE
- Urgent obligations:
  * UAE Residence Visa — expires in 8 days (HIGH RISK) — renew via GDRFA website
  * School Fee Q3 — AED 14,000 — due TODAY (HIGH RISK)
  * Emirates ID Renewal — 22 days — AED 370 (MEDIUM) — ICA smart app
  * Car Registration — 31 days — AED 450 (MEDIUM) — needs insurance first
  * Car Insurance — 45 days — AED 2,100 (LOW) — AXA UAE app
  * DEWA Bill — 12 days — AED 850 (LOW)
- Time saved this week: 4h 20m
- Decisions handled: 12

Rules:
- Always show a certainty score (e.g. "95% confident") before suggesting an action
- Never execute anything without user confirmation
- When ordering food, give exactly 3 options as a numbered list
- Respond in English unless user writes in Arabic, then respond in Arabic`;

type Role = 'user' | 'buddy';
type Message = { id: string; role: Role; text: string; timestamp: Date };
type VoiceState = 'idle' | 'recording' | 'transcribing';

const QUICK_PROMPTS = [
  { label: '📋 Urgent items',  text: 'What are my most urgent tasks right now?' },
  { label: '🍽️ Order food',    text: 'I want to order food. What do you suggest?' },
  { label: '🛂 Visa help',     text: 'Help me renew my UAE residence visa.' },
  { label: '⏱️ Morning brief', text: 'Give me my morning brief for today.' },
  { label: '💡 Pay DEWA',      text: 'Help me pay my DEWA bill.' },
  { label: '📊 My LOS score',  text: 'Explain my Life Optimization Score of 74.' },
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

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    dots.forEach((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: -6, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0,  duration: 280, useNativeDriver: true }),
          Animated.delay(500),
        ])
      ).start()
    );
  }, []);
  return (
    <View style={ti.row}>
      <View style={ti.avatar}><Text style={ti.avatarText}>◎</Text></View>
      <View style={ti.bubble}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[ti.dot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
}
const ti = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12, paddingHorizontal: 16 },
  avatar:     { width: 32, height: 32, borderRadius: 16, backgroundColor: `${C.verdigris}20`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${C.verdigris}40` },
  avatarText: { color: C.verdigris, fontSize: 14 },
  bubble:     { backgroundColor: C.surface, borderRadius: 18, borderBottomLeftRadius: 4, padding: 14, flexDirection: 'row', gap: 5, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  dot:        { width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.salmon },
});

// ── Message bubble ────────────────────────────────────────────────────────────
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
  userRow:    { alignItems: 'flex-end', marginBottom: 14, paddingHorizontal: 16 },
  userBubble: { backgroundColor: C.verdigris, borderRadius: 18, borderBottomRightRadius: 4, padding: 14, maxWidth: width * 0.72 },
  userText:   { color: C.white, fontSize: 15, lineHeight: 21 },
  buddyRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14, paddingHorizontal: 16 },
  avatar:     { width: 32, height: 32, borderRadius: 16, backgroundColor: `${C.verdigris}20`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${C.verdigris}40`, marginTop: 20 },
  avatarText: { color: C.verdigris, fontSize: 14 },
  buddyLabel: { color: C.salmon, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  buddyBubble:{ backgroundColor: C.surface, borderRadius: 18, borderBottomLeftRadius: 4, padding: 14, maxWidth: width * 0.72, borderWidth: 1, borderColor: `${C.verdigris}30` },
  buddyText:  { color: C.white, fontSize: 15, lineHeight: 22 },
  time:       { color: C.textTer, fontSize: 10, marginTop: 3 },
});

// ── Mic button with animated ring ─────────────────────────────────────────────
function MicButton({ voiceState, onPress }: { voiceState: VoiceState; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (voiceState === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,   duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [voiceState]);

  const isRecording     = voiceState === 'recording';
  const isTranscribing  = voiceState === 'transcribing';
  const bgColor = isRecording ? C.salmon : isTranscribing ? C.chartreuse : `${C.salmon}18`;
  const borderColor = isRecording ? C.salmon : isTranscribing ? C.chartreuse : `${C.salmon}40`;

  return (
    <TouchableOpacity onPress={onPress} disabled={isTranscribing}>
      <Animated.View style={[
        mic.btn,
        { backgroundColor: bgColor, borderColor, transform: [{ scale: pulse }] }
      ]}>
        {isTranscribing
          ? <ActivityIndicator color={C.bg} size="small" />
          : <Text style={{ fontSize: 18 }}>{isRecording ? '⏹️' : '🎙️'}</Text>
        }
      </Animated.View>
    </TouchableOpacity>
  );
}
const mic = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BuddyScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'buddy',
    text: "Hey! I'm Buddy — your personal chief of staff. 👋\n\nYou have 2 urgent items today: your UAE visa expires in 8 days and your school fee of AED 14,000 is due today.\n\nTap 🎙️ to talk, or type below.",
    timestamp: new Date(),
  }]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const listRef      = useRef<FlatList>(null);

  const scrollToEnd = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);

  // ── Claude API call ─────────────────────────────────────────────────────────
  const sendMessage = async (text: string, speakResponse = false) => {
    if (!text.trim() || loading) return;
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
          system: SYSTEM_PROMPT,
          messages: history,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'API error');

      const responseText = data.content?.[0]?.text ?? "Something went wrong. Try again?";
      const buddyMsg: Message = { id: (Date.now() + 1).toString(), role: 'buddy', text: responseText, timestamp: new Date() };
      setMessages(prev => [...prev, buddyMsg]);

      // Speak Buddy's response if triggered by voice
      if (speakResponse) {
        speakText(responseText);
      }
    } catch {
      const fallback = "I'm having a connection issue. Your most urgent item is your UAE visa — it expires in 8 days. Want me to walk you through the GDRFA renewal process?";
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'buddy', text: fallback, timestamp: new Date(),
      }]);
      if (speakResponse) speakText(fallback);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  // ── Text-to-speech: Buddy speaks back ──────────────────────────────────────
  const speakText = (text: string) => {
    Speech.stop(); // stop any current speech
    setIsSpeaking(true);
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.92,       // slightly slower = more natural
      pitch: 1.0,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const stopSpeaking = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  // ── Voice recording flow ────────────────────────────────────────────────────
  const handleVoicePress = async () => {
    if (voiceState === 'recording') {
      await stopRecording();
    } else if (voiceState === 'idle') {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      // Request mic permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone Access', 'Please allow microphone access in Settings to use voice with Buddy.');
        return;
      }

      // Configure audio session
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setVoiceState('recording');
    } catch (err) {
      console.error('Start recording error:', err);
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

      // ── Send audio to Whisper for transcription ───────────────────────────
      // If you don't have an OpenAI key, swap this for a free on-device option:
      // import * as FileSystem from 'expo-file-system'; + use expo-speech SpeechRecognition (iOS only)
      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as any);
      formData.append('model', 'whisper-1');
      formData.append('language', 'en'); // remove this line for auto-detect (handles Arabic too)

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: formData,
      });

      const whisperData = await whisperRes.json();
      const transcribed = whisperData?.text?.trim();

      if (!transcribed) {
        Alert.alert("Didn't catch that", "I couldn't hear you clearly. Try again?");
        setVoiceState('idle');
        return;
      }

      setVoiceState('idle');
      // Send transcribed text to Claude, and ask Buddy to speak back
      await sendMessage(transcribed, true);

    } catch (err) {
      console.error('Stop recording error:', err);
      setVoiceState('idle');
      Alert.alert('Error', 'Could not process voice. Please type your message instead.');
    }
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => nav.navigate('home')} style={s.backBtn}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={s.headerMid}>
            <View style={s.onlineRing}>
              <Text style={s.buddyIcon}>◎</Text>
            </View>
            <View>
              <Text style={s.headerTitle}>Buddy</Text>
              <Text style={s.headerSub}>Personal Chief of Staff</Text>
            </View>
          </View>

          {/* Stop speaking button — appears when Buddy is talking */}
          {isSpeaking && (
            <TouchableOpacity style={s.speakingBtn} onPress={stopSpeaking}>
              <Text style={{ fontSize: 14, color: C.salmon }}>⏸ Stop</Text>
            </TouchableOpacity>
          )}

          <MicButton voiceState={voiceState} onPress={handleVoicePress} />
        </View>

        <View style={s.onlineBar}>
          <View style={s.onlineDot} />
          <Text style={s.onlineText}>
            {voiceState === 'recording'   ? '🔴 Listening... tap mic to stop' :
             voiceState === 'transcribing' ? '⏳ Processing voice...' :
             isSpeaking                    ? '🔊 Buddy is speaking...' :
             'Online · Knows your full life context'}
          </Text>
        </View>
      </SafeAreaView>

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

      <TabBar active="buddy" onTab={(sc) => nav.navigate(sc)} />
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 10 },
  backBtn:     { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  backBtnText: { color: C.verdigris, fontSize: 18, fontWeight: '600' },
  headerMid:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  onlineRing:  { width: 38, height: 38, borderRadius: 19, backgroundColor: `${C.verdigris}20`, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.verdigris },
  buddyIcon:   { color: C.verdigris, fontSize: 18 },
  headerTitle: { color: C.white, fontSize: 17, fontWeight: '700' },
  headerSub:   { color: C.textSec, fontSize: 10 },
  speakingBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: `${C.salmon}15`, borderWidth: 1, borderColor: `${C.salmon}30` },
  onlineBar:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  onlineDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.verdigris },
  onlineText:  { color: C.textTer, fontSize: 11 },
  msgList:     { paddingTop: 14, paddingBottom: 8 },
  quickWrap:   { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
  quickLabel:  { color: C.textTer, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  quickRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.border },
  chipText:    { color: C.textSec, fontSize: 12 },
  inputBar:    { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: C.border, backgroundColor: C.bg },
  input:       { flex: 1, backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: C.white, fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: C.border },
  sendBtn:     { width: 42, height: 42, borderRadius: 21, backgroundColor: C.chartreuse, alignItems: 'center', justifyContent: 'center' },
  sendIcon:    { color: C.bg, fontSize: 22, fontWeight: '700', lineHeight: 26 },
});