// ─── app/index.tsx ────────────────────────────────────────────────────────────
// REPLACE the entire contents of app/index.tsx with this.
// This is the single entry point — controls every screen transition.

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SplashScreen        from '../src/screens/Onboarding/SplashScreen';
import LoginScreen         from '../src/screens/Onboarding/LoginScreen';
import HomeScreen          from '../src/screens/Home/HomeScreen';
import ObligationsScreen   from '../src/screens/Obligations/ObligationsScreen';
import BuddyScreen         from '../src/screens/Buddy/BuddyScreen';
import InsightsScreen      from '../src/screens/Insights/InsightsScreen';
import MorningBriefScreen  from '../src/screens/Brief/MorningBriefScreen';
import ConnectScreen       from '../src/screens/Connect/ConnectScreen';

export type ScreenName =
  | 'splash'
  | 'login'
  | 'home'
  | 'obligations'
  | 'buddy'
  | 'insights'
  | 'morningBrief'
  | 'connect';

export type NavProp = {
  navigate: (screen: ScreenName) => void;
  goBack:   () => void;
};

export default function AppEntry() {
  const [screen, setScreen] = useState<ScreenName>('splash');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('wyle_token').then(token => {
      setScreen(token ? 'home' : 'splash');
      setLoading(false);
    }).catch(() => {
      setScreen('splash');
      setLoading(false);
    });
  }, []);

  const navigation: NavProp = {
    navigate: (s) => setScreen(s),
    goBack:   () => setScreen('home'),
  };

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color="#1B998B" size="large" />
      </View>
    );
  }

  switch (screen) {
    case 'splash':       return <SplashScreen       navigation={navigation} />;
    case 'login':        return <LoginScreen         navigation={navigation} />;
    case 'home':         return <HomeScreen          navigation={navigation} />;
    case 'obligations':  return <ObligationsScreen   navigation={navigation} />;
    case 'buddy':        return <BuddyScreen         navigation={navigation} />;
    case 'insights':     return <InsightsScreen      navigation={navigation} />;
    case 'morningBrief': return <MorningBriefScreen  navigation={navigation} />;
    case 'connect':      return <ConnectScreen       navigation={navigation} />;
    default:             return <SplashScreen        navigation={navigation} />;
  }
}

const s = StyleSheet.create({
  loader: { flex: 1, backgroundColor: '#002F3A', alignItems: 'center', justifyContent: 'center' },
});
