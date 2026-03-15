// src/services/voiceService.ts
// Web   → browser SpeechRecognition API (free, Chrome/Edge)
// Mobile → @react-native-voice/voice (free, uses on-device Google/Apple STT)

import { Platform, Alert } from 'react-native';

type OnTranscriptCallback  = (text: string) => void;
type OnStateChangeCallback = (state: 'idle' | 'recording' | 'transcribing') => void;

// ── Web Speech Recognition (Chrome/Edge — free) ──────────────────────────────
let webRecognition: any = null;

const startWebVoice = (
  onTranscript: OnTranscriptCallback,
  onStateChange: OnStateChangeCallback
) => {
  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    Alert.alert('Use Chrome or Edge', 'Voice requires Chrome or Edge browser.');
    return;
  }

  webRecognition = new SpeechRecognition();
  webRecognition.lang = 'en-US';
  webRecognition.continuous = false;
  webRecognition.interimResults = false;
  webRecognition.maxAlternatives = 1;

  webRecognition.onstart  = () => onStateChange('recording');
  webRecognition.onend    = () => onStateChange('idle');
  webRecognition.onerror  = (event: any) => {
    onStateChange('idle');
    if (event.error === 'not-allowed') {
      Alert.alert('Microphone Blocked', 'Allow mic access in browser settings, then try again.');
    }
  };
  webRecognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript?.trim();
    if (transcript) {
      onStateChange('idle');
      onTranscript(transcript);
    }
  };

  webRecognition.start();
};

const stopWebVoice = (onStateChange: OnStateChangeCallback) => {
  if (webRecognition) {
    webRecognition.stop();
    webRecognition = null;
  }
  onStateChange('idle');
};

// ── Mobile Voice (@react-native-voice/voice — free, on-device STT) ───────────
// Uses Google Speech Recognition on Android, Apple STT on iOS. No API key needed.
let mobileCallbacksSet = false;
let mobileOnTranscript: OnTranscriptCallback | null = null;
let mobileOnStateChange: OnStateChangeCallback | null = null;

const setupMobileVoice = (Voice: any) => {
  if (mobileCallbacksSet) return;
  mobileCallbacksSet = true;

  Voice.onSpeechStart   = () => mobileOnStateChange?.('recording');
  Voice.onSpeechEnd     = () => mobileOnStateChange?.('transcribing');
  Voice.onSpeechResults = (e: any) => {
    const transcript = e.value?.[0]?.trim();
    if (transcript) {
      mobileOnTranscript?.(transcript);
    }
    mobileOnStateChange?.('idle');
  };
  Voice.onSpeechError = (e: any) => {
    console.error('Voice error:', e.error);
    mobileOnStateChange?.('idle');
    // Error code 7 = "No match" (user said nothing) — don't alert for that
    if (e.error?.code !== '7' && e.error?.code !== 7) {
      Alert.alert('Voice Error', 'Could not recognise speech. Please try again.');
    }
  };
};

const startMobileVoice = async (
  onTranscript: OnTranscriptCallback,
  onStateChange: OnStateChangeCallback
) => {
  try {
    // Dynamic import so web bundle doesn't break (native-only module)
    const Voice = (await import('@react-native-voice/voice')).default;

    mobileOnTranscript  = onTranscript;
    mobileOnStateChange = onStateChange;
    setupMobileVoice(Voice);

    await Voice.start('en-US');
  } catch (err: any) {
    console.error('startMobileVoice error:', err);
    onStateChange('idle');
    Alert.alert('Voice Error', 'Could not start voice recognition. Try again.');
  }
};

const stopMobileVoice = async (onStateChange: OnStateChangeCallback) => {
  try {
    const Voice = (await import('@react-native-voice/voice')).default;
    await Voice.stop();
  } catch (err) {
    console.error('stopMobileVoice error:', err);
    onStateChange('idle');
  }
};

// ── Public API ────────────────────────────────────────────────────────────────
export const VoiceService = {
  start: (onTranscript: OnTranscriptCallback, onStateChange: OnStateChangeCallback) => {
    if (Platform.OS === 'web') {
      startWebVoice(onTranscript, onStateChange);
    } else {
      startMobileVoice(onTranscript, onStateChange);
    }
  },

  stop: (_onTranscript: OnTranscriptCallback, onStateChange: OnStateChangeCallback) => {
    if (Platform.OS === 'web') {
      stopWebVoice(onStateChange);
    } else {
      stopMobileVoice(onStateChange);
    }
  },
};
