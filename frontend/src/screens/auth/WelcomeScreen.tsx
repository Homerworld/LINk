import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Button } from '../../components/ui';
import { Colors, Spacing } from '../../constants/theme';

export default function WelcomeScreen({ navigation }: any) {
  return (
    <SafeAreaView style={s.c}>
      <View style={s.top}>
        <Text style={s.logo}>Link</Text>
        <Text style={s.tag}>Find trusted local services{'\n'}near you, fast.</Text>
      </View>
      <View style={s.actions}>
        <Button title="I need a service" onPress={() => navigation.navigate('Signup', { role: 'customer' })} />
        <Button title="I offer a service" variant="success" onPress={() => navigation.navigate('Signup', { role: 'vendor' })} />
        <Button title="I already have an account" variant="ghost" onPress={() => navigation.navigate('Login')} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background, justifyContent: 'space-between', padding: Spacing.xl },
  top: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.base },
  logo: { fontSize: 64, fontWeight: '900', color: Colors.primary, letterSpacing: -2 },
  tag: { fontSize: 18, color: Colors.textSecondary, textAlign: 'center', lineHeight: 26 },
  actions: { gap: Spacing.md, paddingBottom: Spacing.lg },
});
