// Inline Babel plugin: replaces `import.meta` with `{}` so Metro/Hermes
// can bundle packages (e.g. expo-speech-recognition) that use ESM syntax.
// No extra npm package needed — Babel visits the AST node directly.
function transformImportMeta({ types: t }) {
  return {
    visitor: {
      MetaProperty(path) {
        if (
          path.node.meta.name === 'import' &&
          path.node.property.name === 'meta'
        ) {
          path.replaceWith(t.objectExpression([]));
        }
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      transformImportMeta,
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@services': './src/services',
            '@store': './src/store',
            '@theme': './src/theme',
            '@utils': './src/utils',
            '@hooks': './src/hooks',
            '@constants': './src/constants',
            '@navigation': './src/navigation',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
