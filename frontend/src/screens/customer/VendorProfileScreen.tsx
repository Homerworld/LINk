import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '../../constants/theme'
export default function VendorProfileScreen({ navigation }: any) {
  return (
    <View style={s.c}>
      <Text style={s.t}>VendorProfileScreen</Text>
      <Text style={s.sub}>Coming soon</Text>
    </View>
  )
}
const s = StyleSheet.create({ c: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }, t: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary }, sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 8 } })
