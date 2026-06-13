import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { useAuth } from '../store/auth';

import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';

import HomeScreen from '../screens/customer/HomeScreen';
import VendorProfileScreen from '../screens/customer/VendorProfileScreen';
import NegotiationScreen from '../screens/customer/NegotiationScreen';

import OffersScreen from '../screens/shared/OffersScreen';
import JobsScreen from '../screens/shared/JobsScreen';
import JobDetailScreen from '../screens/shared/JobDetailScreen';
import AccountScreen from '../screens/shared/AccountScreen';

import VendorDashboardScreen from '../screens/vendor/VendorDashboardScreen';
import VendorKYCScreen from '../screens/vendor/VendorKYCScreen';
import WalletScreen from '../screens/vendor/WalletScreen';
import SetPinScreen from '../screens/vendor/SetPinScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabIcon = (map: Record<string, [string, string]>) => ({ route }: any) => ({
  headerShown: false,
  tabBarActiveTintColor: Colors.primary,
  tabBarInactiveTintColor: Colors.textTertiary,
  tabBarStyle: { height: 64, paddingBottom: 10, paddingTop: 6, borderTopColor: Colors.border },
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
  tabBarIcon: ({ color, focused }: any) => {
    const [on, off] = map[route.name] || ['ellipse', 'ellipse-outline'];
    return <Ionicons name={(focused ? on : off) as any} size={22} color={color} />;
  },
});

function CustomerTabs() {
  return (
    <Tab.Navigator screenOptions={tabIcon({ Discover: ['search', 'search-outline'], Offers: ['pricetags', 'pricetags-outline'], Jobs: ['briefcase', 'briefcase-outline'], Account: ['person', 'person-outline'] })}>
      <Tab.Screen name="Discover" component={HomeScreen} />
      <Tab.Screen name="Offers" component={OffersScreen} />
      <Tab.Screen name="Jobs" component={JobsScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

function VendorTabs() {
  return (
    <Tab.Navigator screenOptions={tabIcon({ Home: ['home', 'home-outline'], Offers: ['pricetags', 'pricetags-outline'], Jobs: ['briefcase', 'briefcase-outline'], Wallet: ['wallet', 'wallet-outline'], Account: ['person', 'person-outline'] })}>
      <Tab.Screen name="Home" component={VendorDashboardScreen} />
      <Tab.Screen name="Offers" component={OffersScreen} />
      <Tab.Screen name="Jobs" component={JobsScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigation() {
  const { user, booting } = useAuth();

  if (booting) {
    return (
      <View style={s.boot}>
        <Text style={s.logo}>Link</Text>
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={user.role === 'vendor' ? VendorTabs : CustomerTabs} />
            <Stack.Screen name="VendorProfile" component={VendorProfileScreen} />
            <Stack.Screen name="Negotiation" component={NegotiationScreen} />
            <Stack.Screen name="JobDetail" component={JobDetailScreen} />
            <Stack.Screen name="KYC" component={VendorKYCScreen} options={{ headerShown: true, title: 'Get verified' }} />
            <Stack.Screen name="SetPin" component={SetPinScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  logo: { fontSize: 56, fontWeight: '900', color: Colors.primary, letterSpacing: -2 },
});
