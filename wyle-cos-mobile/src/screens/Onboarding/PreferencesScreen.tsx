import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../../theme';
import Button from '../../components/common/Button';

export default function PreferencesScreen({ navigation }: any) {
  const nextScreens: Record<string, string> = {
    Welcome: 'Preferences',
    Preferences: 'ObligationScan',
    ObligationScan: 'Ready',
    Ready: 'Main',
  };
  const next = nextScreens['Preferences'];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Preferences</Text>
      <Text style={styles.subtitle}>Onboarding step — build me out!</Text>
      {next && (
        <Button label="Continue →" onPress={() => navigation.navigate(next)} style={styles.btn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.screen },
  title: { color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold, marginBottom: Spacing.sm },
  subtitle: { color: Colors.textSecondary, fontSize: Typography.size.base, marginBottom: Spacing.xl },
  btn: { width: '100%' },
});
