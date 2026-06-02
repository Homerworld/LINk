import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '../../constants/theme'

export default function RoleSelectScreen({ navigation }: any) {
  return (
    <View style={s.c}>
      <Text style={s.logo}>Link</Text>
      <Text style={s.tag}>Find trusted local services near you</Text>
      <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Signup', { role: 'customer' })}>
        <Text style={s.btnTxt}>I need a service</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.btn, { backgroundColor: Colors.success }]} onPress={() => navigation.navigate('Signup', { role: 'vendor' })}>
        <Text style={s.btnTxt}>I offer a service</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={s.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', padding: 32, gap: 16 },
  logo: { fontSize: 56, fontWeight: '900', color: Colors.primary, letterSpacing: -2, textAlign: 'center' },
  tag: { fontSize: 16, color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: Colors.primary, borderRadius: 14, height: 56, justifyContent: 'center', alignItems: 'center' },
  btnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
  link: { textAlign: 'center', color: Colors.primary, fontWeight: '600', fontSize: 14 },
})
