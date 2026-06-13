import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, Field } from '../../components/ui';
import { Colors, Spacing } from '../../constants/theme';
import { authAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!phone || !password) return Alert.alert('Missing info', 'Enter your phone and password.');
    setLoading(true);
    try {
      const { user, accessToken, refreshToken } = await authAPI.login(phone.trim(), password);
      await signIn(user, accessToken, refreshToken);
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.c}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={s.body}>
          <Text style={s.logo}>Link</Text>
          <Text style={s.title}>Welcome back</Text>
          <View style={{ gap: Spacing.base, marginTop: Spacing.lg }}>
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08012345678" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" />
            <Button title="Sign in" onPress={submit} loading={loading} style={{ marginTop: Spacing.sm }} />
            <TouchableOpacity onPress={() => navigation.navigate('Welcome')}>
              <Text style={s.link}>New here? Create an account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  logo: { fontSize: 40, fontWeight: '900', color: Colors.primary, letterSpacing: -1 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.sm },
  link: { textAlign: 'center', color: Colors.primary, fontWeight: '600', fontSize: 14, marginTop: Spacing.sm },
});
