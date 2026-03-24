import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { Colors, Typography } from '../theme';
import { useAppStore } from '../store';

// ─── Screens ──────────────────────────────────────────────────────────────────
import HomeScreen from '../screens/Home/HomeScreen';
import ObligationsScreen from '../screens/Obligations/ObligationsScreen';
import BuddyScreen from '../screens/Buddy/BuddyScreen';
import InsightsScreen from '../screens/Insights/InsightsScreen';
import WelcomeScreen from '../screens/Onboarding/WelcomeScreen';
import PreferencesScreen from '../screens/Onboarding/PreferencesScreen';
import ObligationScanScreen from '../screens/Onboarding/ObligationScanScreen';
import ReadyScreen from '../screens/Onboarding/ReadyScreen';
import BrainDumpScreen from '../screens/BrainDump/BrainDumpScreen';
import WalletScreen from '../screens/Wallet/WalletScreen';

const RootStack = createStackNavigator();
const OnboardingStack = createStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, string> = {
  Home:        '⌂',
  Obligations: '📋',
  Buddy:       '◎',
  Wallet:      '🗂️',
  Insights:    '◈',
};

// ─── Onboarding flow ──────────────────────────────────────────────────────────
function OnboardingNavigator() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerShown: false }}>
      <OnboardingStack.Screen name="Welcome" component={WelcomeScreen} />
      <OnboardingStack.Screen name="Preferences" component={PreferencesScreen} />
      <OnboardingStack.Screen name="ObligationScan" component={ObligationScanScreen} />
      <OnboardingStack.Screen name="Ready" component={ReadyScreen} />
    </OnboardingStack.Navigator>
  );
}

// ─── Main tab bar ─────────────────────────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Colors.verdigris,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarLabelStyle: { fontSize: Typography.size.xs, fontWeight: Typography.weight.medium },
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 20, color }}>{TAB_ICONS[route.name] || '•'}</Text>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Obligations" component={ObligationsScreen} />
      <Tab.Screen name="Buddy" component={BuddyScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
    </Tab.Navigator>
  );
}

// ─── Main app screens (tabs + modal screens like BrainDump) ───────────────────
function MainNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Main" component={MainTabs} />
      <RootStack.Screen
        name="brainDump"
        component={BrainDumpScreen}
        options={{ presentation: 'modal' }}   // slides up from bottom — feels natural
      />
    </RootStack.Navigator>
  );
}

// ─── Root navigator — NO NavigationContainer (Expo Router provides it) ────────
export default function AppNavigator() {
  const { user, isAuthenticated } = useAppStore();
  const showOnboarding = !isAuthenticated || !user?.onboardingComplete;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {showOnboarding ? (
        <RootStack.Screen name="Onboarding" component={OnboardingNavigator} />
      ) : (
        <RootStack.Screen name="MainNav" component={MainNavigator} />
      )}
    </RootStack.Navigator>
  );
}