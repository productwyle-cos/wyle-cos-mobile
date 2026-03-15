// src/services/voiceService.ts
// Web    → browser SpeechRecognition API (free, Chrome/Edge)
// Mobile → expo-speech-recognition (free, on-device Google/Apple STT)
//          Static import works because expo-speech-recognition is a no-op on web.

import { Platform, Alert } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  addSpeechRecognitionListener,
} from 'expo-speech-recognition';

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

// ── Mobile Voice (expo-speech-recognition — free, on-device STT) ─────────────
// Uses Google Speech on Android, Apple STT on iOS. No API key needed.
// expo-speech-recognition is a no-op on web so the static import is safe.

let resultSub: ReturnType<typeof addSpeechRecognitionListener> | null = null;
let errorSub:  ReturnType<typeof addSpeechRecognitionListener> | null = null;
let startSub:  ReturnType<typeof addSpeechRecognitionListener> | null = null;
let endSub:    ReturnType<typeof addSpeechRecognitionListener> | null = null;

const removeMobileListeners = () => {
  resultSub?.remove(); resultSub = null;
  errorSub?.remove();  errorSub  = null;
  startSub?.remove();  startSub  = null;
  endSub?.remove();    endSub    = null;
};

const startMobileVoice = async (
  onTranscript: OnTranscriptCallback,
  onStateChange: OnStateChangeCallback
) => {
  try {
    // Ask for mic + speech recognition permission
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Microphone Permission',
        'Please allow microphone access in Settings to use voice input.'
      );
      onStateChange('idle');
      return;
    }

    removeMobileListeners();

    startSub = addSpeechRecognitionListener('start', () => {
      onStateChange('recording');
    });

    endSub = addSpeechRecognitionListener('end', () => {
      onStateChange('idle');
      removeMobileListeners();
    });

    resultSub = addSpeechRecognitionListener('result', (event) => {
      const transcript = event.results?.[0]?.transcript?.trim();
      if (transcript && event.isFinal) {
        onTranscript(transcript);
        onStateChange('idle');
        removeMobileListeners();
      }
    });

    errorSub = addSpeechRecognitionListener('error', (event) => {
      console.error('Voice error:', event);
      onStateChange('idle');
      removeMobileListeners();
      // 'no-speech' = user was silent, 'aborted' = user stopped — skip alert
      if (event.code !== 'no-speech' && event.code !== 'aborted') {
        Alert.alert('Voice Error', 'Could not recognise speech. Please try again.');
      }
    });

    await ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: false });
  } catch (err: any) {
    console.error('startMobileVoice error:', err);
    onStateChange('idle');
    removeMobileListeners();
    Alert.alert('Voice Error', 'Could not start voice recognition. Try again.');
  }
};

const stopMobileVoice = async (onStateChange: OnStateChangeCallback) => {
  try {
    await ExpoSpeechRecognitionModule.stop();
  } catch (err) {
    console.error('stopMobileVoice error:', err);
    onStateChange('idle');
    removeMobileListeners();
  }
};

// ── Public API ────────────────────────────────────────────────────────────────
export const VoiceService = {
  start: (
    onTranscript: OnTranscriptCallback,
    onStateChange: OnStateChangeCallback
  ) => {
    if (Platform.OS === 'web') {
      startWebVoice(onTranscript, onStateChange);
    } else {
      startMobileVoice(onTranscript, onStateChange);
    }
  },

  stop: (
    _onTranscript: OnTranscriptCallback,
    onStateChange: OnStateChangeCallback
  ) => {
    if (Platform.OS === 'web') {
      stopWebVoice(onStateChange);
    } else {
      stopMobileVoice(onStateChange);
    }
  },
};
