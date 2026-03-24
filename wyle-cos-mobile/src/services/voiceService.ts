// src/services/voiceService.ts  ← WEB only
// Metro automatically uses voiceService.native.ts on iOS/Android,
// so expo-speech-recognition is NEVER imported here (avoids import.meta ESM error).

import { Alert } from 'react-native';

type OnTranscriptCallback  = (text: string) => void;
type OnStateChangeCallback = (state: 'idle' | 'recording' | 'transcribing') => void;

let webRecognition: any = null;

export const VoiceService = {
  start: (
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
  },

  stop: (
    _onTranscript: OnTranscriptCallback,
    onStateChange: OnStateChangeCallback
  ) => {
    if (webRecognition) {
      webRecognition.stop();
      webRecognition = null;
    }
    onStateChange('idle');
  },
};
