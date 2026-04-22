import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { useDispatch } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { loginUser } from '../../store/index';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

export function LoginScreen({ navigation }: any) {
  const dispatch = useDispatch<any>();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) { Alert.alert('Error', 'Please enter phone and password'); return; }
    setLoading(true);
    const result = await dispatch(loginUser({ phone, password }));
    setLoading(false);
    if (loginUser.rejected.match(result)) {
      Alert.alert('Login failed', result.payload as string);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoSection}>
          <Text style={styles.logo}>Link</Text>
          <Text style={styles.tagline}>Find your service, agree on a deal, and book.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Welcome back</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone number</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="080XXXXXXXX"
                placeholderTextColor={Colors.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Your password"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('RoleSelect')}>
            <Text style={styles.secondaryBtnText}>Create an account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function RoleSelectScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.logoSection}>
        <Text style={styles.logo}>Link</Text>
        <Text style={styles.tagline}>Join your local services community.</Text>
      </View>

      <View style={styles.roleSection}>
        <Text style={styles.title}>How will you use Link?</Text>

        <TouchableOpacity style={styles.roleCard} onPress={() => navigation.navigate('CustomerSignup')}>
          <View style={[styles.roleIcon, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="search" size={32} color={Colors.primary} />
          </View>
          <View style={styles.roleInfo}>
            <Text style={styles.roleTitle}>I'm a Customer</Text>
            <Text style={styles.roleSubtitle}>Looking for services in my area</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.roleCard} onPress={() => navigation.navigate('VendorSignup')}>
          <View style={[styles.roleIcon, { backgroundColor: Colors.successLight }]}>
            <Ionicons name="briefcase" size={32} color={Colors.success} />
          </View>
          <View style={styles.roleInfo}>
            <Text style={styles.roleTitle}>I'm a Vendor</Text>
            <Text style={styles.roleSubtitle}>Offering services to customers</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.loginLinkText}>Already have an account? <Text style={styles.loginLinkBold}>Sign in</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

export function CustomerSignupScreen({ navigation }: any) {
  const [step, setStep] = useState(1); // 1=form, 2=otp
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const { authAPI } = require('../../services/api');
  const dispatch = useDispatch<any>();

  const sendOtp = async () => {
    if (!form.phone) { Alert.alert('Error', 'Enter your phone number first'); return; }
    setLoading(true);
    try {
      await authAPI.sendOtp(form.phone, 'signup');
      setStep(2);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const verifyAndSignup = async () => {
    setLoading(true);
    try {
      await authAPI.verifyOtp(form.phone, otp, 'signup');
      const res = await authAPI.customerSignup(form);
      const { user, accessToken, refreshToken } = res.data.data;
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);
      const { setUser } = require('../../store/index');
      dispatch(setUser({ user, accessToken }));
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Signup failed');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => step === 1 ? navigation.goBack() : setStep(1)}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.form}>
          <Text style={styles.title}>{step === 1 ? 'Create your account' : 'Verify your number'}</Text>
          <Text style={styles.subtitle}>{step === 1 ? 'Find trusted vendors near you.' : `Enter the 6-digit code sent to ${form.phone}`}</Text>

          {step === 1 ? (
            <>
              {[
                { key: 'full_name', label: 'Full name', placeholder: 'Adewale Johnson', icon: 'person-outline', keyboard: 'default' },
                { key: 'email', label: 'Email address', placeholder: 'wale@email.com', icon: 'mail-outline', keyboard: 'email-address' },
                { key: 'phone', label: 'Phone number', placeholder: '080XXXXXXXX', icon: 'call-outline', keyboard: 'phone-pad' },
                { key: 'password', label: 'Password', placeholder: 'Min. 8 characters', icon: 'lock-closed-outline', keyboard: 'default', secure: true },
              ].map((field) => (
                <View key={field.key} style={styles.inputGroup}>
                  <Text style={styles.label}>{field.label}</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name={field.icon as any} size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={field.placeholder}
                      placeholderTextColor={Colors.textTertiary}
                      value={(form as any)[field.key]}
                      onChangeText={(v) => setForm({ ...form, [field.key]: v })}
                      keyboardType={field.keyboard as any}
                      secureTextEntry={field.secure}
                      autoCapitalize={field.key === 'full_name' ? 'words' : 'none'}
                    />
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.primaryBtn} onPress={sendOtp} disabled={loading}>
                {loading ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.primaryBtnText}>Continue</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.otpContainer}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="000000"
                  placeholderTextColor={Colors.textTertiary}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={verifyAndSignup} disabled={loading || otp.length < 6}>
                {loading ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.primaryBtnText}>Create Account</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.resendBtn} onPress={sendOtp}>
                <Text style={styles.resendText}>Resend code</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: Spacing.xl },
  logoSection: { alignItems: 'center', paddingTop: 60, paddingBottom: Spacing.xxxl },
  logo: { fontSize: 52, fontWeight: '900', color: Colors.primary, letterSpacing: -2 },
  tagline: { fontSize: Typography.base, color: Colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center' },
  form: { gap: Spacing.base },
  title: { fontSize: Typography.xxl, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 22, marginTop: -Spacing.sm },
  inputGroup: { gap: Spacing.sm },
  label: { fontSize: Typography.sm, fontWeight: '600', color: Colors.textSecondary },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.base, height: 52 },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  eyeBtn: { padding: Spacing.sm },
  primaryBtn: { height: 56, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, marginTop: Spacing.sm },
  primaryBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
  secondaryBtn: { height: 56, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border },
  secondaryBtnText: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  divider: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: Typography.sm, color: Colors.textTertiary },
  roleSection: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.base },
  roleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.base, gap: Spacing.base, borderWidth: 1.5, borderColor: Colors.border },
  roleIcon: { width: 64, height: 64, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center' },
  roleInfo: { flex: 1 },
  roleTitle: { fontSize: Typography.md, fontWeight: '700', color: Colors.textPrimary },
  roleSubtitle: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  loginLink: { padding: Spacing.xl, alignItems: 'center' },
  loginLinkText: { fontSize: Typography.base, color: Colors.textSecondary },
  loginLinkBold: { color: Colors.primary, fontWeight: '700' },
  backBtn: { paddingTop: 56, paddingBottom: Spacing.base },
  otpContainer: { alignItems: 'center', paddingVertical: Spacing.xl },
  otpInput: { fontSize: 36, fontWeight: '800', letterSpacing: 16, color: Colors.textPrimary, textAlign: 'center', borderBottomWidth: 2, borderBottomColor: Colors.primary, paddingBottom: Spacing.sm, minWidth: 200 },
  resendBtn: { alignItems: 'center', padding: Spacing.base },
  resendText: { fontSize: Typography.base, color: Colors.primary, fontWeight: '600' },
});
