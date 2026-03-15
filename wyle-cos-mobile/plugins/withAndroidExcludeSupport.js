// plugins/withAndroidExcludeSupport.js
// Excludes the legacy com.android.support library from all subprojects.
// Required because @react-native-voice/voice pulls in support-compat:28.0.0
// which conflicts with the androidx.core already in Expo SDK 54.
const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidExcludeSupport(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;

    const exclusion = `
// ── Exclude legacy com.android.support (conflicts with AndroidX) ──────────────
subprojects {
    configurations.all {
        exclude group: 'com.android.support'
    }
}
`;
    if (!config.modResults.contents.includes("exclude group: 'com.android.support'")) {
      config.modResults.contents += exclusion;
    }
    return config;
  });
};
