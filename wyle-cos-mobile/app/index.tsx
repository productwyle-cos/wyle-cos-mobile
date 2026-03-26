// ─── app/index.tsx ────────────────────────────────────────────────────────────
// Single entry point — controls every screen transition.

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SplashScreen        from '../src/screens/Onboarding/SplashScreen';
import LoginScreen         from '../src/screens/Onboarding/LoginScreen';
import PreparationScreen   from '../src/screens/Onboarding/PreparationScreen';
import HomeScreen          from '../src/screens/Home/HomeScreen';
import ObligationsScreen   from '../src/screens/Obligations/ObligationsScreen';
import BuddyScreen         from '../src/screens/Buddy/BuddyScreen';
import InsightsScreen      from '../src/screens/Insights/InsightsScreen';
import MorningBriefScreen  from '../src/screens/Brief/MorningBriefScreen';
import ConnectScreen       from '../src/screens/Connect/ConnectScreen';
import CalendarScreen      from '../src/screens/Calendar/CalendarScreen';
import WalletScreen        from '../src/screens/Wallet/WalletScreen';

export type ScreenName =
  | 'splash'
  | 'login'
  | 'preparation'   // ← shown for 2.5 s after login before home
  | 'home'
  | 'obligations'
  | 'buddy'
  | 'insights'
  | 'wallet'
  | 'morningBrief'
  | 'connect'
  | 'calendar';

export type NavProp = {
  navigate: (screen: ScreenName) => void;
  goBack:   () => void;
};

export default function AppEntry() {
  const [screen, setScreen] = useState<ScreenName>('splash');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      // ── On web: handle Google OAuth full-page redirect callback FIRST ──────
      // When the user taps "Sign in with Google", the whole page redirects to
      // Google. When Google sends them back (with ?code=... in the URL),
      // we must exchange that code for tokens before deciding which screen
      // to show. If we skip this step the user ends up back at the splash
      // screen with nothing saved.
      if (Platform.OS === 'web') {
        try {
          const { handleGoogleOAuthCallback } =
            await import('../src/services/googleAuthService');
          const cb = await handleGoogleOAuthCallback();

          if (cb !== null) {
            // This page load IS a Google OAuth callback
            if (cb.success === true) {
              const existingToken = await AsyncStorage.getItem('wyle_token');
              if (!existingToken) {
                // First-time Google sign-in — create the app session
                await AsyncStorage.setItem('wyle_token', 'google_auth_token');
                await AsyncStorage.setItem('wyle_user', JSON.stringify({
                  _id:                'g_' + cb.email.replace(/[^a-z0-9]/gi, ''),
                  name:               cb.email.split('@')[0] || 'Wyle User',
                  email:              cb.email,
                  onboardingComplete: true,
                }));
                setScreen('preparation');
              } else {
                // Already logged in — user was connecting Google from Profile
                setScreen('home');
              }
            } else {
              // OAuth failed or was cancelled — drop back to login
              setScreen('login');
            }
            setLoading(false);
            return;   // ← skip the normal token check below
          }
        } catch (e) {
          console.warn('[App] Google OAuth callback error:', e);
        }
      }

      // ── Normal startup — check for an existing session ────────────────────
      AsyncStorage.getItem('wyle_token')
        .then(token => {
          setScreen(token ? 'home' : 'splash');
          setLoading(false);
        })
        .catch(() => {
          setScreen('splash');
          setLoading(false);
        });
    };

    init();
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
    case 'splash':       return <SplashScreen        navigation={navigation} />;
    case 'login':        return <LoginScreen          navigation={navigation} />;
    case 'preparation':  return <PreparationScreen    navigation={navigation} />;
    case 'home':         return <HomeScreen           navigation={navigation} />;
    case 'obligations':  return <ObligationsScreen    navigation={navigation} />;
    case 'buddy':        return <BuddyScreen          navigation={navigation} />;
    case 'insights':     return <InsightsScreen       navigation={navigation} />;
    case 'wallet':       return <WalletScreen          navigation={navigation} />;
    case 'morningBrief': return <MorningBriefScreen   navigation={navigation} />;
    case 'connect':      return <ConnectScreen        navigation={navigation} />;
    case 'calendar':     return <CalendarScreen       navigation={navigation} />;
    default:             return <SplashScreen         navigation={navigation} />;
  }
}

const s = StyleSheet.create({
  loader: { flex: 1, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center' },
});
