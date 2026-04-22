import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

import { setUser, clearAuth } from '../store/index';
import { authAPI } from '../services/api';
import { Colors, Typography } from '../constants/theme';

// Auth screens
import { LoginScreen, RoleSelectScreen, CustomerSignupScreen } from '../screens/auth/AuthScreens';
import VendorSignupScreen from '../screens/auth/VendorSignupScreen';

// Customer screens
import HomeScreen from '../screens/customer/HomeScreen';
import VendorProfileScreen from '../screens/customer/VendorProfileScreen';
import NegotiationScreen from '../screens/customer/NegotiationScreen';
import CustomerJobsScreen from '../screens/customer/CustomerJobsScreen';

// Vendor screens
import VendorDashboardScreen from '../screens/vendor/VendorDashboardScreen';
import VendorKYCScreen from '../screens/vendor/VendorKYCScreen';
import WalletScreen from '../screens/vendor/WalletScreen';

// Shared screens
import JobScreen from '../screens/shared/JobScreen';
import NotificationsScreen from '../screens/shared/NotificationsScreen';
import ReviewScreen from '../screens/shared/ReviewScreen';
import DisputeScreen from '../screens/shared/DisputeScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ── Customer Tab Navigator ────────────────────────────────────────
function CustomerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingBottom: 8,
          height: 70,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: -2 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Home: ['search', 'search-outline'],
            MyJobs: ['briefcase', 'briefcase-outline'],
            Notifications: ['notifications', 'notifications-outline'],
          };
          const [active, inactive] = icons[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={(focused ? active : inactive) as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Discover' }} />
      <Tab.Screen name="MyJobs" component={CustomerJobsScreen} options={{ tabBarLabel: 'My Jobs' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
    </Tab.Navigator>
  );
}

// ── Vendor Tab Navigator ──────────────────────────────────────────
function VendorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingBottom: 8,
          height: 70,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: -2 },
        tabBarIcon: ({ focused, color }) => {
          const icons: Record<string, [string, string]> = {
            Dashboard: ['grid', 'grid-outline'],
            Wallet: ['wallet', 'wallet-outline'],
            Notifications: ['notifications', 'notifications-outline'],
          };
          const [active, inactive] = icons[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={(focused ? active : inactive) as any} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={VendorDashboardScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
    </Tab.Navigator>
  );
}

// ── Root Navigator ────────────────────────────────────────────────
function RootNavigator() {
  const { isAuthenticated, user } = useSelector((s: any) => s.auth);
  const isVendor = user?.role === 'vendor';

  if (!isAuthenticated) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="CustomerSignup" component={CustomerSignupScreen} />
        <Stack.Screen name="VendorSignup" component={VendorSignupScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Main tabs */}
      <Stack.Screen name="Main" component={isVendor ? VendorTabs : CustomerTabs} />

      {/* Shared modal screens */}
      <Stack.Screen name="VendorProfile" component={VendorProfileScreen}
        options={{ presentation: 'card' }} />
      <Stack.Screen name="Negotiation" component={NegotiationScreen}
        options={{ presentation: 'card' }} />
      <Stack.Screen name="Job" component={JobScreen}
        options={{ presentation: 'card' }} />
      <Stack.Screen name="ReviewScreen" component={ReviewScreen}
        options={{ presentation: 'modal' }} />
      <Stack.Screen name="DisputeScreen" component={DisputeScreen}
        options={{ presentation: 'card' }} />
      <Stack.Screen name="VendorKYC" component={VendorKYCScreen}
        options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="KYCSubmitted" component={KYCSubmittedScreen}
        options={{ presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  );
}

// ── KYC Submitted confirmation screen ────────────────────────────
function KYCSubmittedScreen({ navigation }: any) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: Colors.background, gap: 20 }}>
      <Ionicons name="shield-checkmark" size={80} color={Colors.primary} />
      <Text style={{ fontSize: 28, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' }}>Submitted!</Text>
      <Text style={{ fontSize: 16, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 }}>
        We're reviewing your profile. This usually takes 24–48 hours. You'll get a notification when approved.
      </Text>
      <View style={{ backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 16, width: '100%' }}>
        <Text style={{ fontSize: 14, color: Colors.primary, textAlign: 'center', lineHeight: 20 }}>
          While you wait, make sure your portfolio images clearly show your best work. This is the first thing customers see.
        </Text>
      </View>
    </View>
  );
}

// ── App Entry with auth restore ───────────────────────────────────
export default function AppNavigation() {
  const dispatch = useDispatch<any>();
  const [booting, setBooting] = React.useState(true);

  useEffect(() => {
    restoreAuth();
    setupNotifications();
  }, []);

  const restoreAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        // Validate token by fetching user profile
        const res = await authAPI.refreshToken(await SecureStore.getItemAsync('refreshToken') || '');
        if (res?.data?.data?.accessToken) {
          await SecureStore.setItemAsync('accessToken', res.data.data.accessToken);
          // Fetch user details — decode from token or fetch /me endpoint
          const jwt = require('jwt-decode');
          const decoded = jwt.default(res.data.data.accessToken);
          // We'll set partial user from token, full details loaded on each screen
          dispatch(setUser({ user: { id: decoded.userId }, accessToken: res.data.data.accessToken }));
        }
      }
    } catch {
      await SecureStore.deleteItemAsync('accessToken');
      dispatch(clearAuth());
    } finally {
      setBooting(false);
    }
  };

  const setupNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      const token = await Notifications.getExpoPushTokenAsync();
      try { await authAPI.updatePushToken(token.data); } catch { }
    }
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  };

  if (booting) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <Text style={{ fontSize: 48, fontWeight: '900', color: Colors.primary, letterSpacing: -2 }}>Link</Text>
        <ActivityIndicator style={{ marginTop: 24 }} color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}
