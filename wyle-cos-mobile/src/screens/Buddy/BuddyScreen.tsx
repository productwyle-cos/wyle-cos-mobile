import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavProp } from '../../../app/index';

export default function BuddyScreen({ navigation }: { navigation: NavProp }) {
  return (
    <View style={s.container}>
      <SafeAreaView style={s.safe}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={s.backText}>← Home</Text>
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.emoji}>◎</Text>
          <Text style={s.title}>Buddy</Text>
          <Text style={s.sub}>Your AI assistant — building for Saturday demo.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#002F3A' },
  safe:      { flex: 1, padding: 20 },
  back:      { marginBottom: 16 },
  backText:  { color: '#1B998B', fontSize: 14 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  emoji:     { fontSize: 56 },
  title:     { color: '#FEFFFE', fontSize: 28, fontWeight: '700' },
  sub:       { color: '#8FB8BF', fontSize: 15, textAlign: 'center' },
});