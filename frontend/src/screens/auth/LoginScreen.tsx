import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useDispatch } from 'react-redux'
import { loginUser, AppDispatch } from '../../store'
import { Colors } from '../../constants/theme'

export default function LoginScreen({ navigation }: any) {
  const dispatch = useDispatch<AppDispatch>()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!phone || !password) { Alert.alert('Error', 'Enter phone and password'); return }
    setLoading(true)
    const result = await dispatch(loginUser({ phone, password }))
    if (loginUser.rejected.match(result)) Alert.alert('Login failed', result.payload as string)
    setLoading(false)
  }

  return (
    <View style={s.c}>
      <Text style={s.logo}>Link</Text>
      <Text style={s.title}>Welcome back</Text>
      <TextInput style={s.input} placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <TextInput style={s.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Sign In</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={s.link}>Create an account</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background, padding: 32, justifyContent: 'center', gap: 12 },
  logo: { fontSize: 40, fontWeight: '900', color: Colors.primary, letterSpacing: -1, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary, marginBottom: 8 },
  input: { height: 52, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, backgroundColor: '#fff' },
  btn: { height: 56, backgroundColor: Colors.primary, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  btnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
  link: { textAlign: 'center', color: Colors.primary, fontWeight: '600', fontSize: 14 },
})
