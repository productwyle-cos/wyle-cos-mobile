// metro.config.js
// Configures Metro bundler for Expo.
// Key fix: expo-speech-recognition uses import.meta (ESM syntax) which
// Metro/Hermes cannot handle in the web bundle. We swap it for a no-op
// mock on web so the app loads correctly in the browser.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const _resolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // On web: redirect expo-speech-recognition to a no-op stub
  if (
    platform === 'web' &&
    (moduleName === 'expo-speech-recognition' ||
      moduleName.startsWith('expo-speech-recognition/'))
  ) {
    return {
      filePath: path.resolve(__dirname, 'src/mocks/expo-speech-recognition.web.ts'),
      type: 'sourceFile',
    };
  }

  return _resolveRequest
    ? _resolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
