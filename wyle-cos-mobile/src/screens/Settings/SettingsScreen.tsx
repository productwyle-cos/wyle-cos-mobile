import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme';
import { ScreenHeader } from '../../components/common';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container}>
      <ScreenHeader title="Settings" subtitle="Coming soon — build me next!" />
      <View style={styles.placeholder}>
        <Text style={styles.emoji}>🚧</Text>
        <Text style={styles.text}>Settings screen — scaffold ready</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  text: { color: Colors.textSecondary, fontSize: Typography.size.base, textAlign: 'center' },
});
