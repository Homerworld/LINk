import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Field } from '../../components/ui';
import { Colors, Spacing } from '../../constants/theme';
import { authAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

export default function SignupScreen({ route, navigation }: any) {
  const role: 'customer' | 'vendor' = route.params?.role || 'customer';
  const { signIn } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (v: string) => setForm({ ...form, [k]: v });

  const submit = async () => {
    if (!form.fullName || !form.phone || !form.password)
      return Alert.alert('Missing info', 'Name, phone and password are required.');
    if (form.password.length < 8)
      return Alert.alert('Weak password', 'Password must be at least 8 characters.');
    setLoading(true);
    try {
      const fn = role === 'vendor' ? authAPI.signupVendor : authAPI.signupCustomer;
      const { user, accessToken, refreshToken } = await fn({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
      });
      await signIn(user, accessToken, refreshToken);
    } catch (e: any) {
      Alert.alert('Signup failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.c}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.title}>Create {role} account</Text>
          <Text style={s.sub}>
            {role === 'vendor' ? 'Start receiving job requests from nearby customers.' : 'Find and book trusted vendors near you.'}
          </Text>
          <View style={{ gap: Spacing.base, marginTop: Spacing.lg }}>
            <Field label="Full name" value={form.fullName} onChangeText={set('fullName')} placeholder="e.g. Tunde Bakare" />
            <Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="08012345678" />
            <Field label="Email (optional)" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" placeholder="you@email.com" />
            <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="At least 8 characters" />
            <Button title="Create account" onPress={submit} loading={loading} style={{ marginTop: Spacing.sm }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  body: { padding: Spacing.xl, paddingTop: Spacing.xxl },
  back: { color: Colors.primary, fontSize: 15, fontWeight: '600', marginBottom: Spacing.lg },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  sub: { fontSize: 15, color: Colors.textSecondary, marginTop: 6, lineHeight: 22 },
});
