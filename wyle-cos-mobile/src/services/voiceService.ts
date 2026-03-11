// src/services/voiceService.ts
import { Platform, Alert } from 'react-native';

type OnTranscriptCallback = (text: string) => void;
type OnStateChangeCallback = (state: 'idle' | 'recording' | 'transcribing') => void;

// Static import — safe because expo-av is installed
// On web, we just never call the Audio methods
import { Audio } from 'expo-av';

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

// ── Mobile Voice (expo-av) ────────────────────────────────────────────────────
let mobileRecording: Audio.Recording | null = null;

const startMobileVoice = async (onStateChange: OnStateChangeCallback) => {
  try {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) {
      Alert.alert('Microphone Required', 'Allow microphone access in Settings.');
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    mobileRecording = recording;
    onStateChange('recording');
  } catch (err) {
    console.error('startMobileVoice error:', err);
    onStateChange('idle');
    Alert.alert('Error', 'Could not start recording. Try again.');
  }
};

const stopMobileVoice = async (
  onTranscript: OnTranscriptCallback,
  onStateChange: OnStateChangeCallback
) => {
  if (!mobileRecording) { onStateChange('idle'); return; }

  try {
    onStateChange('transcribing');
    await mobileRecording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    // ── Whisper goes here later ───────────────────────────────────────────
    // const uri = mobileRecording.getURI();
    // then POST to Whisper API

    mobileRecording = null;
    onStateChange('idle');
    Alert.alert('Voice on Mobile', 'Voice-to-text coming soon. Type your message for now.');
  } catch (err) {
    console.error('stopMobileVoice error:', err);
    mobileRecording = null;
    onStateChange('idle');
  }
};

// ── Public API ────────────────────────────────────────────────────────────────
export const VoiceService = {
  start: (onTranscript: OnTranscriptCallback, onStateChange: OnStateChangeCallback) => {
    if (Platform.OS === 'web') {
      startWebVoice(onTranscript, onStateChange);
    } else {
      startMobileVoice(onStateChange);
    }
  },

  stop: (onTranscript: OnTranscriptCallback, onStateChange: OnStateChangeCallback) => {
    if (Platform.OS === 'web') {
      stopWebVoice(onStateChange);
    } else {
      stopMobileVoice(onTranscript, onStateChange);
    }
  },
};