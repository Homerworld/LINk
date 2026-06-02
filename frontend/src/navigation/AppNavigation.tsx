import React, { useEffect, useState } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, ActivityIndicator } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { useSelector, useDispatch } from 'react-redux'
import { Ionicons } from '@expo/vector-icons'
import { setUser, clearAuth, RootState, AppDispatch } from '../store'
import { authAPI } from '../services/api'
import { Colors } from '../constants/theme'

// Screens — imported lazily to keep structure clean
import LoginScreen from '../screens/auth/LoginScreen'
import SignupScreen from '../screens/auth/SignupScreen'
import RoleSelectScreen from '../screens/auth/RoleSelectScreen'
import HomeScreen from '../screens/customer/HomeScreen'
import VendorProfileScreen from '../screens/customer/VendorProfileScreen'
import NegotiationScreen from '../screens/customer/NegotiationScreen'
import CustomerJobsScreen from '../screens/customer/CustomerJobsScreen'
import VendorDashboardScreen from '../screens/vendor/VendorDashboardScreen'
import VendorKYCScreen from '../screens/vendor/VendorKYCScreen'
import WalletScreen from '../screens/vendor/WalletScreen'
import JobScreen from '../screens/shared/JobScreen'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

function CustomerTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textTertiary,
      tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border, height: 70, paddingBottom: 8 },
      tabBarIcon: ({ focused, color }) => {
        const icons: Record<string, [string, string]> = {
          Discover: ['search', 'search-outline'],
          MyJobs: ['briefcase', 'briefcase-outline'],
        }
        const [a, i] = icons[route.name] || ['ellipse', 'ellipse-outline']
        return <Ionicons name={(focused ? a : i) as any} size={22} color={color} />
      },
    })}>
      <Tab.Screen name="Discover" component={HomeScreen} options={{ tabBarLabel: 'Discover' }} />
      <Tab.Screen name="MyJobs" component={CustomerJobsScreen} options={{ tabBarLabel: 'My Jobs' }} />
    </Tab.Navigator>
  )
}

function VendorTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textTertiary,
      tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border, height: 70, paddingBottom: 8 },
      tabBarIcon: ({ focused, color }) => {
        const icons: Record<string, [string, string]> = {
          Dashboard: ['grid', 'grid-outline'],
          Wallet: ['wallet', 'wallet-outline'],
        }
        const [a, i] = icons[route.name] || ['ellipse', 'ellipse-outline']
        return <Ionicons name={(focused ? a : i) as any} size={22} color={color} />
      },
    })}>
      <Tab.Screen name="Dashboard" component={VendorDashboardScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { isAuthenticated, user } = useSelector((s: RootState) => s.auth)
  if (!isAuthenticated) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
      </Stack.Navigator>
    )
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={user?.role === 'vendor' ? VendorTabs : CustomerTabs} />
      <Stack.Screen name="VendorProfile" component={VendorProfileScreen} />
      <Stack.Screen name="Negotiation" component={NegotiationScreen} />
      <Stack.Screen name="Job" component={JobScreen} />
      <Stack.Screen name="VendorKYC" component={VendorKYCScreen} options={{ presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  )
}

export default function AppNavigation() {
  const dispatch = useDispatch<AppDispatch>()
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('accessToken')
        if (token) {
          const res = await authAPI.getMe()
          dispatch(setUser({ user: res.data.data, accessToken: token }))
        }
      } catch {
        await SecureStore.deleteItemAsync('accessToken')
        dispatch(clearAuth())
      } finally {
        setBooting(false)
      }
    })()
  }, [])

  if (booting) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <Text style={{ fontSize: 48, fontWeight: '900', color: Colors.primary, letterSpacing: -2 }}>Link</Text>
        <ActivityIndicator style={{ marginTop: 24 }} color={Colors.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  )
}
