// src/screens/Buddy/BuddyScreen.tsx
// Voice: expo-av (record) → Whisper (transcribe) → Claude (respond) → expo-speech (speak back)
// Dark palette, no back button, 5-tab footer with hologram orb

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Animated,
  StatusBar, ActivityIndicator, Dimensions, Alert, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { uploadFileToDrive, findDuplicateDoc, computeContentHash, WyleDocMeta } from '../../services/driveService';
import { getAccessToken } from '../../services/googleAuthService';
import type { NavProp } from '../../../app/index';
import { VoiceService } from '../../services/voiceService';
import { useAppStore } from '../../store';
import { UIObligation } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const ANTHROPIC_API_KEY   = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY   ?? '';
const OPENAI_API_KEY      = process.env.EXPO_PUBLIC_OPENAI_API_KEY      ?? '';
const METALS_API_KEY      = process.env.EXPO_PUBLIC_METALS_API_KEY      ?? '';
const ALPHAVANTAGE_KEY    = process.env.EXPO_PUBLIC_ALPHAVANTAGE_KEY    ?? '';
const GNEWS_KEY           = process.env.EXPO_PUBLIC_GNEWS_KEY           ?? '';
const WEATHER_KEY         = process.env.EXPO_PUBLIC_WEATHER_KEY         ?? '';

// ── SVG icon assets ───────────────────────────────────────────────────────────
const MIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="9" y="2" width="6" height="11" rx="3" fill="#FFFFFF"/>
  <path d="M5 11a7 7 0 0 0 14 0" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" fill="none"/>
  <line x1="12" y1="18" x2="12" y2="22" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
  <line x1="8" y1="22" x2="16" y2="22" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const STOP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="7" y="7" width="10" height="10" rx="2" fill="#FFFFFF"/>
</svg>`;

const SEND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M12 20V4" stroke="#0D0D0D" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M5 11l7-7 7 7" stroke="#0D0D0D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

const PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <line x1="12" y1="5" x2="12" y2="19" stroke="#1B998B" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="5" y1="12" x2="19" y2="12" stroke="#1B998B" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

// ── Chat history persistence ──────────────────────────────────────────────────
const HISTORY_STORAGE_KEY = '@wyle:buddy_history';
const HISTORY_RETENTION_DAYS = 7;   // keep 7 days of chat history
const HISTORY_MAX_MESSAGES   = 150; // hard cap to prevent storage bloat

async function loadHistory(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: any[] = JSON.parse(raw);
    const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    // Filter out messages older than retention window, keep most recent cap
    return parsed
      .filter(m => new Date(m.timestamp).getTime() > cutoff)
      .slice(-HISTORY_MAX_MESSAGES);
  } catch {
    return [];
  }
}

async function saveHistory(messages: any[]): Promise<void> {
  try {
    // Serialize: keep only the fields we need (drop any base64 attachment data)
    const toSave = messages.slice(-HISTORY_MAX_MESSAGES).map(m => ({
      id:        m.id,
      role:      m.role,
      text:      m.text,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      // Save attachment metadata but NOT base64 content (too large)
      attachment: m.attachment
        ? { type: m.attachment.type, name: m.attachment.name }
        : undefined,
    }));
    await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('[Buddy] Failed to save history:', e);
  }
}

// ── Detect whether a message needs task context ───────────────────────────────
const TASK_KEYWORDS = [
  'task', 'obligation', 'priority', 'priorities', 'urgent', 'due', 'deadline',
  'pending', 'complete', 'completed', 'done', 'finish', 'resolve', 'resolved',
  'mark', 'paid', 'automat', 'remind', 'schedule', 'overdue', 'brief',
  'morning brief', 'today\'s', 'this week', 'what do i have', 'what should i',
  'what have i', 'los score', 'optimization score', 'top item', 'top priority',
  'my list', 'my tasks', 'my obligation', 'visa', 'dewa', 'salik', 'bill',
  'invoice', 'rent', 'insurance', 'renewal', 'expire', 'expir',
];

function isTaskQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return TASK_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Detect whether a message needs live web data ──────────────────────────────
// These queries need real-time information — sports scores, flights, prices,
// weather, news, etc. We pass Anthropic's built-in web_search tool so Claude
// can fetch live data server-side without any extra API key.
const REALTIME_KEYWORDS = [
  // sports / events
  'won', 'winner', 'score', 'match', 'game', 'result', 'played', 'tournament',
  'ipl', 'cricket', 'football', 'fifa', 'nba', 'ufc', 'f1', 'grand prix',
  // travel / flights
  'flight', 'flights', 'available flight', 'booking', 'ticket', 'airlines',
  'travel to', 'fly to', 'airport',
  // prices / markets
  'gold rate', 'gold price', 'silver price', 'dollar rate', 'exchange rate',
  'stock price', 'share price', 'crypto', 'bitcoin',
  // news / world events
  'latest news', 'current update', 'breaking', 'war', 'election', 'today news',
  'what happened', 'update on', 'news about',
  // weather
  'weather', 'temperature', 'forecast', 'rain', 'humidity',
];

function isRealTimeQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return REALTIME_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Anthropic built-in web search tool ───────────────────────────────────────
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search',
};

// ── Executive data router — fetches live data BEFORE calling Claude ───────────
// Keeps Claude prompt small and gives accurate numbers from primary sources.
// Each fetcher returns a string snippet that gets prepended to the system prompt.

async function fetchCryptoPrice(query: string): Promise<string | null> {
  // Detect coin from query
  const q = query.toLowerCase();
  const coinMap: Record<string, string> = {
    bitcoin: 'bitcoin', btc: 'bitcoin',
    ethereum: 'ethereum', eth: 'ethereum',
    xrp: 'ripple', ripple: 'ripple',
    sol: 'solana', solana: 'solana',
    bnb: 'binancecoin',
    usdt: 'tether', tether: 'tether',
    ada: 'cardano', cardano: 'cardano',
    doge: 'dogecoin', dogecoin: 'dogecoin',
  };
  const coinId = Object.entries(coinMap).find(([k]) => q.includes(k))?.[1];
  if (!coinId) return null;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,aed&include_24hr_change=true`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const d = data[coinId];
    if (!d) return null;
    const change = d.usd_24h_change?.toFixed(2);
    const sign   = change >= 0 ? '+' : '';
    return `[LIVE DATA — CoinGecko] ${coinId.charAt(0).toUpperCase() + coinId.slice(1)}: $${d.usd?.toLocaleString()} USD / AED ${d.aed?.toLocaleString()} | 24h: ${sign}${change}%`;
  } catch { return null; }
}

async function fetchForexRate(query: string): Promise<string | null> {
  const q = query.toLowerCase();
  // Only fetch if question is about currencies/exchange rates
  if (!q.match(/exchange rate|forex|currency|dollar|euro|pound|rupee|dirham|yen|yuan/)) return null;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return null;
    const data = await res.json();
    const rates = data.rates;
    if (!rates) return null;
    // Pull the most relevant currencies for Dubai exec
    const snippet = [
      `USD/AED: ${rates.AED?.toFixed(4)}`,
      `USD/EUR: ${rates.EUR?.toFixed(4)}`,
      `USD/GBP: ${rates.GBP?.toFixed(4)}`,
      `USD/INR: ${rates.INR?.toFixed(2)}`,
      `USD/JPY: ${rates.JPY?.toFixed(2)}`,
    ].join(' | ');
    return `[LIVE DATA — ExchangeRate-API] ${snippet}`;
  } catch { return null; }
}

// ── Gold / Silver / Platinum prices (metals-api.com) ─────────────────────────
async function fetchMetalPrice(query: string): Promise<string | null> {
  if (!METALS_API_KEY) return null;
  const q = query.toLowerCase();
  if (!q.match(/gold|silver|platinum|metal|xau|xag|xpt/)) return null;
  try {
    const res = await fetch(
      `https://metals-api.com/api/latest?access_key=${METALS_API_KEY}&base=USD&symbols=XAU,XAG,XPT`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.success) return null;
    const r = data.rates;
    // Metals-API returns how many oz per USD, so invert for price per oz
    const goldUsd    = r.XAU ? (1 / r.XAU).toFixed(2) : null;
    const silverUsd  = r.XAG ? (1 / r.XAG).toFixed(2) : null;
    const platUsd    = r.XPT ? (1 / r.XPT).toFixed(2) : null;
    // AED = USD × 3.6725
    const goldAed    = goldUsd   ? (parseFloat(goldUsd)   * 3.6725).toFixed(2) : null;
    const silverAed  = silverUsd ? (parseFloat(silverUsd) * 3.6725).toFixed(2) : null;
    const parts: string[] = [];
    if (goldUsd)   parts.push(`Gold (XAU/oz): $${goldUsd} USD / AED ${goldAed}`);
    if (silverUsd) parts.push(`Silver (XAG/oz): $${silverUsd} USD / AED ${silverAed}`);
    if (platUsd)   parts.push(`Platinum (XPT/oz): $${platUsd} USD`);
    return parts.length ? `[LIVE DATA — MetalsAPI] ${parts.join(' | ')}` : null;
  } catch { return null; }
}

// ── Stock price (Alpha Vantage) ───────────────────────────────────────────────
async function fetchStockPrice(query: string): Promise<string | null> {
  if (!ALPHAVANTAGE_KEY) return null;
  const q = query.toLowerCase();
  // Extract ticker or map common company names to tickers
  const tickerMap: Record<string, string> = {
    apple: 'AAPL', microsoft: 'MSFT', google: 'GOOGL', alphabet: 'GOOGL',
    amazon: 'AMZN', meta: 'META', facebook: 'META', tesla: 'TSLA',
    nvidia: 'NVDA', netflix: 'NFLX', 'saudi aramco': '2222.SR',
    adnoc: 'ADNOCDIST.AD', 'emaar': 'EMAAR.DU', 'etisalat': 'ETISALAT.AD',
    'emirates nbd': 'ENBD.DU', 'first abu dhabi': 'FAB.AD',
  };
  let symbol = Object.entries(tickerMap).find(([name]) => q.includes(name))?.[1];
  // Also detect raw tickers like "AAPL stock" or "TSLA price"
  if (!symbol) {
    const tickerMatch = query.match(/\b([A-Z]{2,5})\b/);
    if (tickerMatch) symbol = tickerMatch[1];
  }
  if (!symbol) return null;
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHAVANTAGE_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) return null;
    const price  = parseFloat(quote['05. price']).toFixed(2);
    const change = parseFloat(quote['09. change']).toFixed(2);
    const pct    = parseFloat(quote['10. change percent']).toFixed(2);
    const sign   = parseFloat(change) >= 0 ? '+' : '';
    return `[LIVE DATA — AlphaVantage] ${symbol}: $${price} | Change: ${sign}${change} (${sign}${pct}%)`;
  } catch { return null; }
}

// ── Business news headlines (GNews) ──────────────────────────────────────────
async function fetchNews(query: string): Promise<string | null> {
  if (!GNEWS_KEY) return null;
  const q = query.toLowerCase();
  if (!q.match(/news|update|headline|latest|happening|trend|event|market update/)) return null;
  // Pick topic category based on keywords
  const topic = q.match(/tech|technology|ai|startup/) ? 'technology'
              : q.match(/sport|ipl|cricket|football|match/) ? 'sports'
              : 'business';
  try {
    const res = await fetch(
      `https://gnews.io/api/v4/top-headlines?topic=${topic}&lang=en&max=5&apikey=${GNEWS_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const articles = data.articles?.slice(0, 4);
    if (!articles?.length) return null;
    const headlines = articles.map((a: any, i: number) =>
      `${i + 1}. ${a.title} (${a.source?.name})`
    ).join('\n');
    return `[LIVE DATA — GNews Top ${topic} headlines]\n${headlines}`;
  } catch { return null; }
}

// ── Dubai weather (WeatherAPI) ────────────────────────────────────────────────
async function fetchWeather(query: string): Promise<string | null> {
  if (!WEATHER_KEY) return null;
  const q = query.toLowerCase();
  if (!q.match(/weather|temperature|forecast|rain|humid|hot|cold|outside|climate/)) return null;
  // Detect city, default to Dubai
  const city = q.includes('abu dhabi') ? 'Abu Dhabi'
             : q.includes('sharjah')   ? 'Sharjah'
             : q.includes('riyadh')    ? 'Riyadh'
             : 'Dubai';
  try {
    const res = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${WEATHER_KEY}&q=${encodeURIComponent(city)}&aqi=no`
    );
    if (!res.ok) return null;
    const d = await res.json();
    const c = d.current;
    return `[LIVE DATA — WeatherAPI] ${city}: ${c.temp_c}°C (feels ${c.feelslike_c}°C) | ${c.condition?.text} | Humidity: ${c.humidity}% | Wind: ${c.wind_kph} km/h`;
  } catch { return null; }
}

// ── Router: try ALL dedicated APIs in parallel, return combined context ───────
async function fetchLiveDataContext(query: string): Promise<string | null> {
  const results = await Promise.allSettled([
    fetchCryptoPrice(query),
    fetchForexRate(query),
    fetchMetalPrice(query),
    fetchStockPrice(query),
    fetchNews(query),
    fetchWeather(query),
  ]);
  const snippets = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean) as string[];
  return snippets.length > 0 ? snippets.join('\n') : null;
}

// Max messages sent to Claude API per call — prevents token limit errors
const API_HISTORY_LIMIT = 12;

// ── System prompt — two modes ─────────────────────────────────────────────────
function buildSystemPrompt(
  obligations: UIObligation[],
  includeTaskContext: boolean,
  liveDataSnippet?: string | null,
): string {
  const personality = `You are Buddy, the AI-powered personal chief of staff inside Wyle — a life management app for busy professionals in Dubai, UAE.

Your personality:
- Calm, confident, warm, direct. You speak like a trusted friend who is highly competent.
- Every reply saves the user time. Be short and actionable. Max 3-4 sentences unless asked for more.
- Never panic. Focus on solutions.
- Human and respectful. Never robotic.
- When responding to voice, keep it even shorter — 2-3 sentences max so it sounds natural spoken aloud.

The user's current context:
- Location: Dubai, UAE
- Respond in English unless user writes in Arabic, then respond in Arabic`;

  // If live data was fetched from a dedicated API, inject it prominently
  const liveBlock = liveDataSnippet
    ? `\n\nLIVE MARKET DATA (fetched right now — use these exact figures in your answer):\n${liveDataSnippet}`
    : '';

  if (!includeTaskContext) {
    return `${personality}${liveBlock}

STRICT RULE FOR THIS MESSAGE: The user is asking a general question unrelated to their tasks or schedule. Answer ONLY what was asked. Do NOT mention, reference, redirect to, or bring up any tasks, obligations, due dates, bills, fees, priorities, or to-do items — even if you are aware of them from earlier in the conversation. Keep the response completely focused on the question asked.`;
  }

  // Task-related question — inject full obligations context
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

  return `${personality}${liveBlock}

The user's task context:
- Life Optimization Score (LOS): 74/100
- Active obligations (${active.length}):
${activeList}${completedList ? `\n- Already completed:\n${completedList}` : ''}
- Time saved this week: 4h 20m
- Decisions handled: 12

Rules:
- Always show a certainty score (e.g. "95% confident") before suggesting a task action
- When the user says they have paid, completed, done, or resolved an obligation, check the "Already completed" list first. If it is already there, tell the user it was already marked done — do NOT call the resolve_obligation tool again.
- Only call resolve_obligation for obligations that are currently in the Active obligations list.`;
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
type AttachmentType = 'image' | 'pdf' | 'doc' | 'file';
type Attachment = {
  uri: string;           // local file URI
  type: AttachmentType;
  name: string;          // file name shown in bubble
  mimeType?: string;
  base64?: string;       // populated for images — sent to Claude in Phase 2
};
type Message = {
  id: string;
  role: Role;
  text: string;
  timestamp: Date;
  attachment?: Attachment;
};
type VoiceState = 'idle' | 'recording' | 'transcribing';

// Guaranteed unique message ID — avoids duplicate-key warning when two
// messages are created within the same millisecond
let _msgCounter = 0;
const uid = () => `${Date.now()}_${++_msgCounter}`;

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
// ── Attachment preview inside a bubble ───────────────────────────────────────
function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.type === 'image';
  if (isImage) {
    return (
      <Image
        source={{ uri: attachment.uri }}
        style={bub.attachImage}
        resizeMode="cover"
      />
    );
  }
  // Non-image: show a file pill
  const icons: Record<AttachmentType, string> = {
    image: '🖼️', pdf: '📄', doc: '📝', file: '📎',
  };
  return (
    <View style={bub.filePill}>
      <Text style={bub.filePillIcon}>{icons[attachment.type] ?? '📎'}</Text>
      <Text style={bub.filePillName} numberOfLines={1}>{attachment.name}</Text>
    </View>
  );
}

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
          {message.attachment && <AttachmentPreview attachment={message.attachment} />}
          {message.text ? <Text style={bub.userText}>{message.text}</Text> : null}
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
  // Attachment styles
  attachImage: {
    width: '100%', height: 180, borderRadius: 12,
    marginBottom: 8, backgroundColor: C.surfaceHi,
  },
  filePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${C.verdigris}18`,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 8, borderWidth: 1, borderColor: `${C.verdigris}30`,
  },
  filePillIcon: { fontSize: 18 },
  filePillName: { color: C.white, fontSize: 13, flex: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mic button with animated ring
// ─────────────────────────────────────────────────────────────────────────────
function MicButton({ voiceState, onPress }: { voiceState: VoiceState; onPress: () => void }) {
  const pulse  = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (voiceState === 'recording') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse,  { toValue: 1.1,  duration: 800, useNativeDriver: true }),
        Animated.timing(pulse,  { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(ripple, { toValue: 1,    duration: 900, useNativeDriver: true }),
        Animated.timing(ripple, { toValue: 0,    duration: 0,   useNativeDriver: true }),
      ])).start();
    } else {
      pulse.stopAnimation();
      ripple.stopAnimation();
      Animated.timing(pulse,  { toValue: 1, duration: 150, useNativeDriver: true }).start();
      ripple.setValue(0);
    }
  }, [voiceState]);

  const isRecording    = voiceState === 'recording';
  const isTranscribing = voiceState === 'transcribing';

  const rippleScale   = ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 0.15, 0] });

  return (
    <TouchableOpacity onPress={onPress} disabled={isTranscribing} activeOpacity={0.8}>
      <View style={mic.wrap}>
        {/* Ripple ring — only visible while recording */}
        {isRecording && (
          <Animated.View style={[
            mic.ripple,
            { transform: [{ scale: rippleScale }], opacity: rippleOpacity },
          ]} />
        )}
        <Animated.View style={[
          mic.btn,
          isRecording    && mic.btnRecording,
          isTranscribing && mic.btnProcessing,
          { transform: [{ scale: pulse }] },
        ]}>
          {isTranscribing
            ? <ActivityIndicator color={C.white} size="small" />
            : <SvgXml xml={isRecording ? STOP_SVG : MIC_SVG} width={18} height={18} />
          }
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}
const mic = StyleSheet.create({
  wrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ripple: {
    position: 'absolute',
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.crimson,
  },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surfaceEl,
    borderWidth: 1.5, borderColor: `${C.salmon}50`,
  },
  btnRecording: {
    backgroundColor: C.crimson,
    borderColor: C.crimson,
  },
  btnProcessing: {
    backgroundColor: C.verdigris,
    borderColor: C.verdigris,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BuddyScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const obligations       = useAppStore(st => st.obligations);
  const resolveObligation = useAppStore(st => st.resolveObligation);
  const addObligation     = useAppStore(st => st.addObligation);

  // Document type → emoji map (used in extraction + obligation creation)
  const typeIcon: Record<string, string> = {
    invoice: '🧾', receipt: '🧾', passport: '🛂', emirates_id: '🪪',
    national_id: '🪪', insurance_policy: '🛡️', bank_statement: '🏦',
    visa: '✈️', driving_license: '🚗', other: '📄',
  };

  const WELCOME_MSG: Message = {
    id: '0', role: 'buddy',
    text: "Hey! I'm Buddy — your personal chief of staff. 👋\n\nAsk me anything, or tap 🎙️ to talk.",
    timestamp: new Date(),
  };

  const [messages, setMessages]       = useState<Message[]>([WELCOME_MSG]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [showQuick, setShowQuick]     = useState(true);
  const [voiceState, setVoiceState]   = useState<VoiceState>('idle');
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [pendingResolve, setPendingResolve] = useState<{ id: string; title: string } | null>(null);

  // ── Attachment state ────────────────────────────────────────────────────────
  const [attachMenuVisible, setAttachMenuVisible]             = useState(false);
  const [pendingAttachment, setPendingAttachment]             = useState<Attachment | null>(null);
  const [pendingObligationFromScan, setPendingObligationFromScan] = useState<UIObligation | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const listRef      = useRef<FlatList>(null);

  const scrollToEnd = () =>
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);

  // ── Load chat history from AsyncStorage on first mount ───────────────────
  useEffect(() => {
    (async () => {
      const saved = await loadHistory();
      if (saved.length > 0) {
        // Restore timestamps as Date objects
        const restored: Message[] = saved.map(m => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(restored);
        setShowQuick(false); // hide quick prompts if there's existing history
      }
      setHistoryLoaded(true);
    })();
  }, []);

  // ── Attachment helpers ──────────────────────────────────────────────────────
  const detectFileType = (mimeType: string, name: string): AttachmentType => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (mimeType.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'doc';
    return 'file';
  };

  const handleOpenCamera = async () => {
    setAttachMenuVisible(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Access', 'Please allow camera access in Settings to scan documents.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingAttachment({
        uri: asset.uri,
        type: 'image',
        name: 'Camera scan',
        mimeType: asset.mimeType ?? 'image/jpeg',
        base64: asset.base64 ?? undefined,
      });
    }
  };

  const handleOpenPhotos = async () => {
    setAttachMenuVisible(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo Library Access', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingAttachment({
        uri: asset.uri,
        type: 'image',
        name: asset.fileName ?? 'Photo',
        mimeType: asset.mimeType ?? 'image/jpeg',
        base64: asset.base64 ?? undefined,
      });
    }
  };

  const handleOpenFiles = async () => {
    setAttachMenuVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType ?? 'application/octet-stream';
        setPendingAttachment({
          uri: asset.uri,
          type: detectFileType(mimeType, asset.name),
          name: asset.name,
          mimeType,
        });
      }
    } catch {
      Alert.alert('Error', 'Could not open file picker.');
    }
  };

  // ── Phase 2: read any file as base64 (web blob URL or native URI) ────────────
  const readAsBase64 = async (uri: string): Promise<string> => {
    if (Platform.OS === 'web' || uri.startsWith('blob:') || uri.startsWith('http')) {
      // Web: fetch the blob URL and convert via FileReader
      const response = await fetch(uri);
      const blob     = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // strip "data:...;base64,"
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    // Native: use expo-file-system
    return FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  // ── Phase 2: build the Claude content block for a file ───────────────────────
  const buildFileContentBlock = async (attachment: Attachment): Promise<any[]> => {
    const blocks: any[] = [];

    if (attachment.type === 'image') {
      // Use cached base64 from ImagePicker if available, otherwise read from URI
      const b64 = attachment.base64 ?? await readAsBase64(attachment.uri);
      const mediaType = (attachment.mimeType ?? 'image/jpeg') as
        'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: b64 },
      });
    } else if (attachment.type === 'pdf') {
      // Claude natively reads PDFs as document blocks
      const b64 = await readAsBase64(attachment.uri);
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: b64 },
      });
    } else {
      // .doc / .docx / other — best effort: just tell Claude the filename
      blocks.push({
        type: 'text',
        text: `The user uploaded a file named "${attachment.name}" (${attachment.mimeType ?? 'unknown type'}). ` +
              `This format cannot be read directly. Please let them know you can currently read images and PDFs, ` +
              `and ask them to re-upload as a PDF or image.`,
      });
    }
    return blocks;
  };

  // ── Phase 2: extraction prompt sent alongside the document ───────────────────
  const EXTRACTION_PROMPT = `You are analysing a document uploaded by the user. Extract all key information.

Return a JSON object with these fields (use null for fields you cannot find):
{
  "document_type": one of: invoice | receipt | passport | emirates_id | national_id | driving_license | visa | boarding_pass | hotel_booking | travel_insurance | insurance_policy | bank_statement | tax_document | payslip | medical_report | prescription | vaccination_record | health_insurance | contract | agreement | power_of_attorney | court_document | certificate | transcript | diploma | admission_letter | lease_agreement | utility_bill | property_deed | employment_letter | offer_letter | noc_letter | work_permit | vehicle_registration | vehicle_insurance | other,
  "title": short descriptive title (e.g. "TechMart Invoice #TM-2025-4821"),
  "vendor_or_issuer": company or authority name,
  "person_name": person the document belongs to (or null),
  "reference_number": invoice / policy / ID number (or null),
  "amounts": [ { "label": "Total", "value": "₹98,825", "currency": "INR" } ],
  "dates": [ { "label": "Due Date", "date_string": "15 Feb 2025", "iso_date": "2025-02-15" } ],
  "summary": "2-3 sentence plain English summary of what this document is",
  "has_trackable_deadline": true or false (true if there is a due date, expiry, or renewal date to track),
  "suggested_obligation": if has_trackable_deadline is true: { "title": "Pay TechMart Invoice", "due_iso": "2025-02-15", "amount": 98825, "currency": "INR", "category": "finance" } else null
}

Respond ONLY with the raw JSON object. No markdown, no explanation, no code fences.`;

  // ── Phase 2: format Claude's JSON response into a friendly Buddy message ─────
  const formatExtractionResponse = (data: any, userCaption: string): string => {
    const lines: string[] = [];

    // Header line with document type icon
    const icon = typeIcon[data.document_type] ?? '📄';
    lines.push(`${icon} **${data.title ?? data.document_type}**`);
    if (data.vendor_or_issuer) lines.push(`🏢 ${data.vendor_or_issuer}`);
    if (data.person_name)      lines.push(`👤 ${data.person_name}`);
    if (data.reference_number) lines.push(`🔖 Ref: ${data.reference_number}`);

    // Amounts
    if (data.amounts?.length) {
      lines.push('');
      data.amounts.forEach((a: any) => lines.push(`💰 ${a.label}: ${a.value}`));
    }

    // Dates
    if (data.dates?.length) {
      lines.push('');
      data.dates.forEach((d: any) => lines.push(`📅 ${d.label}: ${d.date_string}`));
    }

    // Summary
    if (data.summary) {
      lines.push('');
      lines.push(data.summary);
    }

    // Obligation prompt
    if (data.has_trackable_deadline && data.suggested_obligation) {
      const ob = data.suggested_obligation;
      lines.push('');
      lines.push(`⚡ I can add "${ob.title}" to your Automations list with a reminder${ob.due_iso ? ` for ${ob.due_iso}` : ''}. Want me to do that?`);
    }

    // User caption (if they typed something alongside the file)
    if (userCaption) {
      lines.push('');
      lines.push(`💬 Your note: "${userCaption}"`);
    }

    return lines.join('\n');
  };

  // ── Phase 2: main send-with-attachment handler ────────────────────────────────
  const sendWithAttachment = async () => {
    if (!pendingAttachment && !input.trim()) return;

    const caption    = input.trim();
    const attachment = pendingAttachment;
    let extractedForDrive: any = null;   // captured outside try so Drive upload runs after finally

    // Post user message immediately
    const userMsg: Message = {
      id: uid(),
      role: 'user',
      text: caption,
      timestamp: new Date(),
      attachment: attachment ?? undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setPendingAttachment(null);
    setLoading(true);
    setShowQuick(false);
    scrollToEnd();

    try {
      if (!attachment) {
        // No attachment — treat as normal text message
        await sendMessage(caption);
        return;
      }

      // Build the multimodal content blocks
      const fileBlocks = await buildFileContentBlock(attachment);
      const textBlock  = {
        type: 'text',
        text: EXTRACTION_PROMPT + (caption ? `\n\nThe user also wrote: "${caption}"` : ''),
      };

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
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [...fileBlocks, textBlock],
          }],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'API error');

      const rawText = data.content?.[0]?.text ?? '';

      // Try to parse as JSON extraction result
      let extracted: any = null;
      try {
        // Strip any accidental markdown fences
        const clean = rawText.replace(/```json|```/g, '').trim();
        extracted = JSON.parse(clean);
        extractedForDrive = extracted;   // capture for Drive upload after finally
      } catch { /* not JSON — show raw */ }

      let buddyText: string;
      if (extracted) {
        buddyText = formatExtractionResponse(extracted, caption);

        // Auto-create obligation if a trackable deadline was found
        if (extracted.has_trackable_deadline && extracted.suggested_obligation) {
          const ob = extracted.suggested_obligation;
          const daysUntil = ob.due_iso
            ? Math.ceil((new Date(ob.due_iso).getTime() - Date.now()) / 86400000)
            : 30;
          const newObligation: UIObligation = {
            _id:       Date.now().toString(),
            title:     ob.title,
            emoji:     typeIcon[extracted.document_type] ?? '📄',
            daysUntil: Math.max(0, daysUntil),
            risk:      daysUntil <= 7 ? 'high' : daysUntil <= 30 ? 'medium' : 'low',
            status:    'active',
            amount:    ob.amount ?? undefined,
            category:  ob.category ?? 'finance',
          };
          // Store pending obligation — confirmed when user says "yes"
          setPendingObligationFromScan(newObligation);
        }
      } else {
        buddyText = rawText || "I've reviewed the document. Could you tell me more about what you'd like to do with it?";
      }

      setMessages(prev => [...prev, {
        id: uid(),
        role: 'buddy',
        text: buddyText,
        timestamp: new Date(),
      }]);

    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: uid(),
        role: 'buddy',
        text: `Sorry, I couldn't analyse that file. ${e.message ?? 'Please try again.'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }

    // ── Auto-upload to user's Google Drive (fire-and-forget, outside try/catch)
    // Runs after extraction is shown — Drive errors never surface to the user.
    // Duplicate check happens first: at most 2 Drive API calls before upload.
    if (extractedForDrive && attachment) {
      getAccessToken().then(async driveToken => {
        if (!driveToken) return;

        // Build content fingerprint from base64 (fast, no deps)
        const contentHash = attachment.base64
          ? computeContentHash(attachment.base64)
          : `name:${attachment.name}`;

        // Check for duplicate — one filename query + one metadata download at most
        try {
          const duplicate = await findDuplicateDoc(attachment.name, contentHash, driveToken);
          if (duplicate) {
            const uploadedOn = new Date(duplicate.uploadedAt).toLocaleDateString('en-AE', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            addMsg({
              id: uid(), role: 'assistant',
              text: `📂 **Already in your Wallet** — "${duplicate.title}" was scanned on ${uploadedOn}. No duplicate created.`,
              timestamp: new Date(),
            });
            return;
          }
        } catch {
          // Duplicate check failed — allow upload to proceed
        }

        const docMeta: WyleDocMeta = {
          documentType: extractedForDrive.document_type    ?? 'file',
          title:        extractedForDrive.title            ?? attachment.name,
          vendor:       extractedForDrive.vendor_or_issuer ?? '',
          personName:   extractedForDrive.person_name      ?? '',
          amounts:      extractedForDrive.amounts          ?? [],
          dates:        extractedForDrive.dates            ?? [],
          reference:    extractedForDrive.reference_number ?? '',
          summary:      extractedForDrive.summary          ?? '',
          uploadedAt:   new Date().toISOString(),
          originalName: attachment.name,
          mimeType:     attachment.mimeType ?? 'application/octet-stream',
          contentHash,
        };
        uploadFileToDrive(
          attachment.uri,
          attachment.name,
          attachment.mimeType ?? 'application/octet-stream',
          docMeta,
          driveToken,
        ).then(() => {
          console.log('[Drive] ✅ Uploaded:', attachment.name);
        }).catch(err => {
          console.warn('[Drive] Upload failed (non-blocking):', err.message);
        });
      }).catch(err => {
        console.warn('[Drive] getAccessToken failed (non-blocking):', err.message);
      });
    }
  };

  // ── Confirm / cancel a pending resolve ─────────────────────────────────────
  const handleConfirmResolve = () => {
    if (!pendingResolve) return;
    resolveObligation(pendingResolve.id);
    const msg = `✅ Done! "${pendingResolve.title}" is marked as completed and removed from your active list.`;
    setMessages(prev => { const u = [...prev, { id: uid(), role: 'buddy' as const, text: msg, timestamp: new Date() }]; saveHistory(u); return u; });
    speakText(`Done! ${pendingResolve.title} has been marked as completed.`);
    setPendingResolve(null);
    scrollToEnd();
  };

  const handleCancelResolve = () => {
    if (!pendingResolve) return;
    const msg = `No problem! "${pendingResolve.title}" stays in your active list.`;
    setMessages(prev => [...prev, { id: uid(), role: 'buddy', text: msg, timestamp: new Date() }]);
    setPendingResolve(null);
    scrollToEnd();
  };

  // ── Claude API call ─────────────────────────────────────────────────────────
  const sendMessage = async (text: string, speakResponse = false) => {
    if (!text.trim() || loading) return;

    const lower = text.trim().toLowerCase();
    const isYes = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm', 'do it', 'go ahead',
                   'add it', 'add', 'create', 'save', 'add to', 'yes add', 'add task'].some(w => lower.includes(w));
    const isNo  = ['no', 'nope', 'cancel', 'keep', "don't", 'stop', 'skip'].some(w => lower.includes(w));

    // Intercept replies to a pending scan obligation ("yes add it / no skip")
    if (pendingObligationFromScan) {
      if (isYes) {
        setMessages(prev => [...prev, { id: uid(), role: 'user', text, timestamp: new Date() }]);
        // Deduplicate: only add if not already in the list
        const alreadyExists = obligations.some(
          o => o.title.toLowerCase() === pendingObligationFromScan.title.toLowerCase()
        );
        if (!alreadyExists) {
          addObligation(pendingObligationFromScan);
          setMessages(prev => [...prev, {
            id: uid(), role: 'buddy',
            text: `✅ Added "${pendingObligationFromScan.title}" to your Automations list.`,
            timestamp: new Date(),
          }]);
        } else {
          setMessages(prev => [...prev, {
            id: uid(), role: 'buddy',
            text: `"${pendingObligationFromScan.title}" is already in your Automations list — no duplicate added.`,
            timestamp: new Date(),
          }]);
        }
        setPendingObligationFromScan(null);
        scrollToEnd();
        return;
      }
      if (isNo) {
        setMessages(prev => [...prev, { id: uid(), role: 'user', text, timestamp: new Date() }]);
        setPendingObligationFromScan(null);
        setMessages(prev => [...prev, {
          id: uid(), role: 'buddy',
          text: 'No problem — skipped. Let me know if you need anything else.',
          timestamp: new Date(),
        }]);
        scrollToEnd();
        return;
      }
    }

    if (pendingResolve) {
      if (isYes) {
        setMessages(prev => [...prev, { id: uid(), role: 'user', text, timestamp: new Date() }]);
        handleConfirmResolve(); return;
      }
      if (isNo) {
        setMessages(prev => [...prev, { id: uid(), role: 'user', text, timestamp: new Date() }]);
        handleCancelResolve(); return;
      }
    }

    setShowQuick(false);
    setInput('');

    const userMsg: Message = { id: uid(), role: 'user', text: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    scrollToEnd();

    try {
      // Only send last API_HISTORY_LIMIT messages to avoid token limit errors.
      // Full history is stored locally (AsyncStorage) but only a window is sent.
      const history = [...messages, userMsg]
        .slice(-API_HISTORY_LIMIT)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant' as const,
          content: m.text.trim() || (m.attachment ? `[User uploaded a ${m.attachment.type}: ${m.attachment.name}]` : '[message]'),
        }))
        .filter(m => m.content.trim().length > 0);

      const taskRelated    = isTaskQuery(text.trim());
      const needsLiveData  = isRealTimeQuery(text.trim());

      // ── Executive data router ─────────────────────────────────────────────
      // For financial/market queries, fetch from dedicated APIs first.
      // The live snippet is prepended to the system prompt so Claude quotes
      // real numbers instead of guessing or saying "I don't have access".
      let liveDataSnippet: string | null = null;
      if (needsLiveData) {
        liveDataSnippet = await fetchLiveDataContext(text.trim());
      }

      // Build tools array:
      //  • web_search → for live data queries (sports, flights, prices, news)
      //  • resolve_obligation → only for task-related queries
      const tools: any[] = [
        ...(needsLiveData  ? [WEB_SEARCH_TOOL] : []),
        ...(taskRelated    ? RESOLVE_TOOL       : []),
      ];

      // web_search_20250305 requires the beta header; other calls work without it
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(needsLiveData ? { 'anthropic-beta': 'web-search-2025-03-05' } : {}),
      };

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: buildSystemPrompt(obligations, taskRelated, liveDataSnippet),
          ...(tools.length > 0 ? { tools } : {}),
          messages: history,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'API error');

      // Handle resolve_obligation tool call (client-side tool — needs confirmation)
      if (data.stop_reason === 'tool_use') {
        const toolUse = data.content?.find((c: any) => c.type === 'tool_use');
        if (toolUse?.name === 'resolve_obligation') {
          const { obligation_id, obligation_title } = toolUse.input;
          setPendingResolve({ id: obligation_id, title: obligation_title });
          const askText = `Should I mark "${obligation_title}" as completed and remove it from your active list?`;
          setMessages(prev => [...prev, { id: uid(), role: 'buddy', text: askText, timestamp: new Date() }]);
          if (speakResponse) speakText(`Should I mark ${obligation_title} as completed and remove it from your list?`);
          return;
        }
      }

      // web_search is a server-side tool — Anthropic handles it automatically.
      // The response content array may contain tool_use + tool_result + text blocks.
      // Always extract the LAST text block which contains the final answer.
      const textBlocks = (data.content ?? []).filter((c: any) => c.type === 'text');
      const responseText = textBlocks[textBlocks.length - 1]?.text ?? "Something went wrong. Try again?";

      const buddyMsg: Message = { id: uid(), role: 'buddy', text: responseText, timestamp: new Date() };
      setMessages(prev => {
        const updated = [...prev, buddyMsg];
        saveHistory(updated);   // persist after every buddy reply
        return updated;
      });
      if (speakResponse) speakText(responseText);
    } catch (err: any) {
      console.warn('[Buddy] sendMessage error:', err?.message ?? err);
      // Show the actual API error in dev so it's easy to diagnose
      const errDetail = __DEV__ ? `\n\n(${err?.message ?? 'unknown error'})` : '';
      const fallback = `Sorry, I'm having a connection issue right now. Please check your internet connection and try again.${errDetail}`;
      setMessages(prev => [...prev, { id: uid(), role: 'buddy', text: fallback, timestamp: new Date() }]);
      if (speakResponse) speakText("Sorry, I'm having a connection issue. Please try again.");
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
            {/* Avatar: concentric rings + orb core */}
            <View style={s.avatarOuter}>
              <View style={s.avatarInner}>
                <LinearGradient
                  colors={[C.verdigris, '#0D7A6E']}
                  style={s.avatarGrad}
                >
                  <SvgXml xml={MIC_SVG} width={16} height={16} />
                </LinearGradient>
              </View>
            </View>

            <View>
              <Text style={s.headerTitle}>Buddy</Text>
              <View style={s.headerSubRow}>
                <View style={s.onlineDot} />
                <Text style={s.headerSub}>Personal Chief of Staff</Text>
              </View>
            </View>
          </View>

          {/* Right controls */}
          <View style={s.headerRight}>
            {isSpeaking && (
              <TouchableOpacity style={s.speakingBtn} onPress={stopSpeaking}>
                <SvgXml xml={STOP_SVG} width={12} height={12} />
                <Text style={s.speakingBtnText}>Stop</Text>
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

        {/* Confirmation bar — appears when Buddy asks to resolve obligation */}
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

        {/* Scan obligation bar — appears after document extraction finds a deadline */}
        {pendingObligationFromScan && (
          <View style={s.scanObBar}>
            <View style={{ flex: 1 }}>
              <Text style={s.scanObTitle}>
                {typeIcon[pendingObligationFromScan.category ?? ''] ?? '📋'} Add to Automations?
              </Text>
              <Text style={s.scanObSub} numberOfLines={1}>
                {pendingObligationFromScan.title}
                {pendingObligationFromScan.amount
                  ? `  ·  ${pendingObligationFromScan.amount.toLocaleString()}`
                  : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={s.scanObYes}
              onPress={() => {
                const alreadyExists = obligations.some(
                  o => o.title.toLowerCase() === pendingObligationFromScan.title.toLowerCase()
                );
                const ob = pendingObligationFromScan;
                setPendingObligationFromScan(null);
                if (!alreadyExists) {
                  addObligation(ob);
                  setMessages(prev => [...prev, {
                    id: uid(), role: 'buddy',
                    text: `✅ Added "${ob.title}" to your Automations list with a reminder.`,
                    timestamp: new Date(),
                  }]);
                } else {
                  setMessages(prev => [...prev, {
                    id: uid(), role: 'buddy',
                    text: `"${ob.title}" is already in your Automations list — no duplicate added.`,
                    timestamp: new Date(),
                  }]);
                }
                scrollToEnd();
              }}
            >
              <Text style={s.scanObYesText}>Add ✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.scanObNo}
              onPress={() => setPendingObligationFromScan(null)}
            >
              <Text style={s.scanObNoText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pending attachment preview strip */}
        {pendingAttachment && (
          <View style={s.attachPreviewBar}>
            {pendingAttachment.type === 'image' ? (
              <Image source={{ uri: pendingAttachment.uri }} style={s.attachThumb} resizeMode="cover" />
            ) : (
              <View style={s.attachFileBadge}>
                <Text style={s.attachFileBadgeText}>
                  {pendingAttachment.type === 'pdf' ? '📄' : '📝'} {pendingAttachment.name}
                </Text>
              </View>
            )}
            <TouchableOpacity style={s.attachRemove} onPress={() => setPendingAttachment(null)}>
              <Text style={s.attachRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          {/* + Attach button */}
          <TouchableOpacity
            style={[s.attachBtn, voiceState !== 'idle' && { opacity: 0.4 }]}
            onPress={() => setAttachMenuVisible(true)}
            disabled={voiceState !== 'idle'}
            activeOpacity={0.75}
          >
            <SvgXml xml={PLUS_SVG} width={20} height={20} />
          </TouchableOpacity>

          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={
              pendingAttachment
                ? 'Add a message (optional)...'
                : voiceState === 'recording'
                  ? 'Listening...'
                  : 'Ask Buddy anything...'
            }
            placeholderTextColor={voiceState === 'recording' ? C.salmon : C.textTer}
            multiline
            maxLength={500}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => pendingAttachment ? sendWithAttachment() : sendMessage(input)}
            editable={voiceState === 'idle'}
          />
          <TouchableOpacity
            style={[s.sendBtn, ((!input.trim() && !pendingAttachment) || loading || voiceState !== 'idle') && { opacity: 0.35 }]}
            onPress={() => pendingAttachment ? sendWithAttachment() : sendMessage(input)}
            disabled={(!input.trim() && !pendingAttachment) || loading || voiceState !== 'idle'}
          >
            {loading
              ? <ActivityIndicator color={C.bg} size="small" />
              : <SvgXml xml={SEND_SVG} width={18} height={18} />
            }
          </TouchableOpacity>
        </View>

        {/* Attachment menu modal */}
        <Modal
          visible={attachMenuVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAttachMenuVisible(false)}
        >
          <TouchableOpacity
            style={s.attachOverlay}
            activeOpacity={1}
            onPress={() => setAttachMenuVisible(false)}
          >
            <View style={s.attachSheet}>
              <View style={s.attachHandle} />
              <Text style={s.attachSheetTitle}>Add Attachment</Text>
              <Text style={s.attachSheetSub}>Buddy will scan and extract key details</Text>

              <TouchableOpacity style={s.attachOption} onPress={handleOpenCamera}>
                <View style={s.attachOptionIcon}><Text style={{ fontSize: 24 }}>📷</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.attachOptionLabel}>Camera</Text>
                  <Text style={s.attachOptionSub}>Scan a document or ID card live</Text>
                </View>
                <Text style={s.attachOptionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.attachOption} onPress={handleOpenPhotos}>
                <View style={s.attachOptionIcon}><Text style={{ fontSize: 24 }}>🖼️</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.attachOptionLabel}>Photos</Text>
                  <Text style={s.attachOptionSub}>Pick an image from your gallery</Text>
                </View>
                <Text style={s.attachOptionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.attachOption} onPress={handleOpenFiles}>
                <View style={s.attachOptionIcon}><Text style={{ fontSize: 24 }}>📁</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.attachOptionLabel}>Files</Text>
                  <Text style={s.attachOptionSub}>Upload a PDF, Word doc, or image</Text>
                </View>
                <Text style={s.attachOptionArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.attachCancel} onPress={() => setAttachMenuVisible(false)}>
                <Text style={s.attachCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Avatar — outer ring + inner ring + gradient core
  avatarOuter: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: `${C.verdigris}12`,
    borderWidth: 1.5, borderColor: `${C.verdigris}35`,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInner: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: `${C.verdigris}20`,
    borderWidth: 1, borderColor: `${C.verdigris}55`,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGrad: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },

  headerTitle: { color: C.white, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  headerSubRow:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' },
  headerSub:   { color: C.textSec, fontSize: 11 },

  speakingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: `${C.salmon}14`, borderWidth: 1, borderColor: `${C.salmon}35`,
  },
  speakingBtnText: { color: C.salmon, fontSize: 12, fontWeight: '700' },

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

  // ── Scan obligation confirmation bar
  scanObBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderColor: `${C.chartreuse}28`,
    backgroundColor: `${C.chartreuse}08`,
  },
  scanObTitle: { color: C.chartreuse, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  scanObSub:   { color: C.textSec, fontSize: 12 },
  scanObYes: {
    backgroundColor: C.chartreuse, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  scanObYesText: { color: C.bg, fontSize: 13, fontWeight: '700' },
  scanObNo: {
    backgroundColor: C.surfaceEl, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: C.border,
  },
  scanObNoText: { color: C.textSec, fontSize: 13, fontWeight: '600' },

  // ── Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14,
    backgroundColor: '#0F0F0F',
    borderTopWidth: 1, borderTopColor: C.border,
  },
  input: {
    flex: 1, backgroundColor: C.surface, borderRadius: 26,
    paddingHorizontal: 18, paddingVertical: 12,
    color: C.white, fontSize: 15, maxHeight: 110, lineHeight: 20,
    borderWidth: 1, borderColor: '#333333',
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.chartreuse,
    elevation: 3,
    shadowColor: C.chartreuse,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },

  // ── Attach button — clean circle with verdigris + border
  attachBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: `${C.verdigris}45`,
  },

  // ── Pending attachment preview strip
  attachPreviewBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  attachThumb: {
    width: 54, height: 54, borderRadius: 10,
    backgroundColor: C.surfaceHi,
  },
  attachFileBadge: {
    flex: 1, backgroundColor: `${C.verdigris}14`,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: `${C.verdigris}28`,
  },
  attachFileBadgeText: { color: C.white, fontSize: 13 },
  attachRemove: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.surfaceHi,
    alignItems: 'center', justifyContent: 'center',
  },
  attachRemoveText: { color: C.textSec, fontSize: 13, fontWeight: '700' },

  // ── Attachment bottom-sheet modal
  attachOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  attachSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  attachHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.surfaceHi, alignSelf: 'center', marginBottom: 20,
  },
  attachSheetTitle: {
    color: C.white, fontSize: 17, fontWeight: '700', marginBottom: 4,
  },
  attachSheetSub: {
    color: C.textSec, fontSize: 13, marginBottom: 20,
  },
  attachOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1, borderColor: C.border,
  },
  attachOptionIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: C.surfaceEl,
    alignItems: 'center', justifyContent: 'center',
  },
  attachOptionLabel: { color: C.white, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  attachOptionSub:   { color: C.textSec, fontSize: 12 },
  attachOptionArrow: { color: C.textTer, fontSize: 20, fontWeight: '300' },
  attachCancel: {
    marginTop: 18, alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: C.surfaceEl,
    borderRadius: 14,
  },
  attachCancelText: { color: C.textSec, fontSize: 15, fontWeight: '600' },

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
