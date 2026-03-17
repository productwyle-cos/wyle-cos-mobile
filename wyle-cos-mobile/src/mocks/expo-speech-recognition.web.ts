// src/mocks/expo-speech-recognition.web.ts
// No-op stub used by metro.config.js on the web platform.
// voiceService.ts (web) uses the browser SpeechRecognition API instead.
// This prevents expo-speech-recognition's import.meta ESM syntax from
// breaking the web bundle.

export const ExpoSpeechRecognitionModule = {
  requestPermissionsAsync: async () => ({ granted: false, canAskAgain: false, status: 'denied' }),
  start: async (_options?: any) => {},
  stop: async () => {},
  abort: async () => {},
  getSupportedLocales: async () => ({ locales: [], installedLocales: [] }),
};

export const addSpeechRecognitionListener = (_event: string, _handler: any) => ({
  remove: () => {},
});

export const useSpeechRecognitionEvent = (_event: string, _handler: any) => {};

export default ExpoSpeechRecognitionModule;
