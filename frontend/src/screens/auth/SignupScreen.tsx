import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native'
import { useDispatch } from 'react-redux'
import { setUser, AppDispatch } from '../../store'
import { authAPI } from '../../services/api'
import * as SecureStore from 'expo-secure-store'
import { Colors } from '../../constants/theme'

export default function SignupScreen({ route, navigation }: any) {
  const role = route.params?.role || 'customer'
  const dispatch = useDispatch<AppDispatch>()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!form.full_name || !form.phone || !form.password) {
      Alert.alert('Error', 'Please fill all required fields'); return
    }
    setLoading(true)
    try {
      const fn = role === 'vendor' ? authAPI.vendorSignup : authAPI.customerSignup
      const res = await fn(form)
      const { user, accessToken, refreshToken } = res.data.data
      await SecureStore.setItemAsync('accessToken', accessToken)
      await SecureStore.setItemAsync('refreshToken', refreshToken)
      dispatch(setUser({ user, accessToken }))
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Signup failed')
    }
    setLoading(false)
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 16 }}>
        <Text style={{ color: Colors.primary, fontSize: 15 }}>← Back</Text>
      </TouchableOpacity>
      <Text style={s.title}>Create {role} account</Text>
      <Text style={s.sub}>{role === 'vendor' ? 'Offer your services to nearby customers' : 'Find trusted vendors near you'}</Text>
      {[
        { key: 'full_name', label: 'Full name', kb: 'default', ac: 'words', secure: false },
        { key: 'email', label: 'Email (optional)', kb: 'email-address', ac: 'none', secure: false },
        { key: 'phone', label: 'Phone number', kb: 'phone-pad', ac: 'none', secure: false },
        { key: 'password', label: 'Password (min 8 chars)', kb: 'default', ac: 'none', secure: true },
      ].map(f => (
        <View key={f.key} style={{ gap: 4 }}>
          <Text style={s.label}>{f.label}</Text>
          <TextInput style={s.input} value={(form as any)[f.key]} onChangeText={v => setForm({ ...form, [f.key]: v })}
            keyboardType={f.kb as any} autoCapitalize={f.ac as any} secureTextEntry={f.secure} />
        </View>
      ))}
      <TouchableOpacity style={s.btn} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Create Account</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  content: { padding: 32, paddingTop: 60, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  input: { height: 52, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, backgroundColor: '#fff' },
  btn: { height: 56, backgroundColor: Colors.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  btnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
})
