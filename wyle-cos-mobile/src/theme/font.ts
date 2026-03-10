// ─── Font Setup for Wyle Brand Guidelines ────────────────────────────────────
// Fonts specified in brand doc:
//   - Headlines:  Poppins Bold
//   - Subtitles:  Montserrat
//   - Body:       Inter
//   - UI/CTA:     Inter SemiBold

// 1. Install:
// npx expo install @expo-google-fonts/poppins @expo-google-fonts/montserrat @expo-google-fonts/inter expo-font

// 2. In App.tsx, wrap everything with font loading:

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
} from '@expo-google-fonts/montserrat';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import * as SplashScreen from 'expo-splash-screen';
import { useCallback } from 'react';
import { View } from 'react-native';

SplashScreen.preventAutoHideAsync();

export function useWyleFonts() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  return { fontsLoaded, fontError, onLayoutRootView };
}

// 3. Updated App.tsx:
/*
import { useWyleFonts } from './src/theme/fonts';

export default function App() {
  const { fontsLoaded, onLayoutRootView } = useWyleFonts();
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
*/

// 4. Usage in any screen:
/*
  <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 48 }}>
    Tell Wyle. It's handled.
  </Text>
  <Text style={{ fontFamily: 'Montserrat_400Regular', fontSize: 16 }}>
    Your personal chief of staff.
  </Text>
  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15 }}>
    Body copy goes here.
  </Text>
  <TouchableOpacity>
    <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Get started</Text>
  </TouchableOpacity>
*/

export {};
