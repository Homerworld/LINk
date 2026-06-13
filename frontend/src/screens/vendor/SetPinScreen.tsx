import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Card } from '../../components/ui';
import { Colors, Spacing } from '../../constants/theme';
import { authAPI } from '../../services/api';

export default function SetPinScreen({ navigation }: any) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!/^\d{4}$/.test(pin)) return Alert.alert('Invalid PIN', 'Your PIN must be exactly 4 digits.');
    if (pin !== confirm) return Alert.alert('PINs do not match', 'Please enter the same PIN twice.');
    setBusy(true);
    try {
      await authAPI.setPin(pin);
      Alert.alert('PIN set', 'You can now withdraw your earnings.', [{ text: 'Done', onPress: () => navigation.goBack() }]);
    } catch (e: any) {
      Alert.alert('Could not set PIN', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.c}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={s.topTitle}>Withdrawal PIN</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={{ padding: Spacing.base, gap: Spacing.base }}>
        <Card style={{ gap: Spacing.base }}>
          <Text style={s.note}>Set a 4-digit PIN. You'll enter it each time you withdraw, so your earnings stay protected.</Text>
          <Field label="New 4-digit PIN" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" />
          <Field label="Confirm PIN" value={confirm} onChangeText={setConfirm} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" />
          <Button title="Save PIN" onPress={save} loading={busy} />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  topTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  note: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
});
