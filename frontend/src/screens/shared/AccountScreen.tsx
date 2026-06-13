import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Button } from '../../components/ui';
import { Colors, Spacing } from '../../constants/theme';
import { useAuth } from '../../store/auth';

export default function AccountScreen({ navigation }: any) {
  const { user, signOut } = useAuth();

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const Row = ({ icon, label, value, onPress }: any) => (
    <TouchableOpacity disabled={!onPress} onPress={onPress} style={s.row} activeOpacity={onPress ? 0.6 : 1}>
      <Ionicons name={icon} size={20} color={Colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} /> : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.c}>
      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
        <Text style={s.h}>Account</Text>

        <Card style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg }}>
          <View style={s.avatar}><Text style={s.avatarTxt}>{user?.fullName?.[0]?.toUpperCase()}</Text></View>
          <Text style={s.name}>{user?.fullName}</Text>
          <Text style={s.role}>{user?.role === 'vendor' ? 'Vendor account' : 'Customer account'}</Text>
        </Card>

        <Card style={{ padding: 0 }}>
          <Row icon="call-outline" label="Phone" value={user?.phone} />
          {user?.email ? <Row icon="mail-outline" label="Email" value={user.email} /> : null}
          {user?.role === 'vendor' && (
            <Row icon="shield-checkmark-outline" label="Verification & services" value="Manage your KYC" onPress={() => navigation.navigate('KYC')} />
          )}
        </Card>

        <Button title="Sign out" variant="danger" onPress={confirmSignOut} />
        <Text style={s.version}>Link v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  h: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 30, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  role: { fontSize: 13, color: Colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowLabel: { fontSize: 13, color: Colors.textTertiary },
  rowValue: { fontSize: 15, color: Colors.textPrimary, fontWeight: '600', marginTop: 1 },
  version: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.sm },
});
