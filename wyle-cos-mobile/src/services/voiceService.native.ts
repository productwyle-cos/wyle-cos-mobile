// src/services/voiceService.native.ts  ← iOS / Android only
// Metro picks this file automatically on native platforms.
// expo-speech-recognition uses on-device Google STT (Android) / Apple STT (iOS).
// Free — no API key needed.

import { Alert } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  addSpeechRecognitionListener,
} from 'expo-speech-recognition';

type OnTranscriptCallback  = (text: string) => void;
type OnStateChangeCallback = (state: 'idle' | 'recording' | 'transcribing') => void;

let resultSub: ReturnType<typeof addSpeechRecognitionListener> | null = null;
let errorSub:  ReturnType<typeof addSpeechRecognitionListener> | null = null;
let startSub:  ReturnType<typeof addSpeechRecognitionListener> | null = null;
let endSub:    ReturnType<typeof addSpeechRecognitionListener> | null = null;

const removeListeners = () => {
  resultSub?.remove(); resultSub = null;
  errorSub?.remove();  errorSub  = null;
  startSub?.remove();  startSub  = null;
  endSub?.remove();    endSub    = null;
};

export const VoiceService = {
  start: async (
    onTranscript: OnTranscriptCallback,
    onStateChange: OnStateChangeCallback
  ) => {
    try {
      // Ask for microphone + speech recognition permission on first use
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Microphone Permission',
          'Please allow microphone access in Settings to use voice input.'
        );
        onStateChange('idle');
        return;
      }

      removeListeners();

      startSub = addSpeechRecognitionListener('start', () => {
        onStateChange('recording');
      });

      endSub = addSpeechRecognitionListener('end', () => {
        onStateChange('idle');
        removeListeners();
      });

      resultSub = addSpeechRecognitionListener('result', (event) => {
        const transcript = event.results?.[0]?.transcript?.trim();
        if (transcript && event.isFinal) {
          onTranscript(transcript);
          onStateChange('idle');
          removeListeners();
        }
      });

      errorSub = addSpeechRecognitionListener('error', (event) => {
        console.error('Voice error:', event);
        onStateChange('idle');
        removeListeners();
        // 'no-speech' = user was silent, 'aborted' = stopped manually — skip alert
        if (event.code !== 'no-speech' && event.code !== 'aborted') {
          Alert.alert('Voice Error', 'Could not recognise speech. Please try again.');
        }
      });

      await ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: false });
    } catch (err: any) {
      console.error('startMobileVoice error:', err);
      onStateChange('idle');
      removeListeners();
      Alert.alert('Voice Error', 'Could not start voice recognition. Try again.');
    }
  },

  stop: async (
    _onTranscript: OnTranscriptCallback,
    onStateChange: OnStateChangeCallback
  ) => {
    try {
      await ExpoSpeechRecognitionModule.stop();
    } catch (err) {
      console.error('stopMobileVoice error:', err);
      onStateChange('idle');
      removeListeners();
    }
  },
};
