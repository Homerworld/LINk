import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Field, Card, Badge } from '../../components/ui';
import { Colors, Spacing } from '../../constants/theme';
import { kycAPI, searchAPI, paymentAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

export default function VendorKYCScreen() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // form state
  const [allServices, setAllServices] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [area, setArea] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [banks, setBanks] = useState<any[]>([]);
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const load = useCallback(async () => {
    try {
      const st = await kycAPI.status();
      setStatus(st);
      setPicked(st.services || []);
      setArea(st.locationArea || '');
      const svc = await searchAPI.services();
      setAllServices(svc);
      const bk = await paymentAPI.banks();
      setBanks(bk);
    } catch (e: any) {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (name: string) => {
    setPicked((p) => p.includes(name) ? p.filter(x => x !== name) : (p.length >= 4 ? (Alert.alert('Limit', 'Max 4 services.'), p) : [...p, name]));
  };

  const submitAll = async () => {
    if (picked.length === 0) return Alert.alert('Pick services', 'Select at least one service you offer.');
    if (!area) return Alert.alert('Location', 'Enter the area you work in.');
    if (!accountNumber || !bankCode) return Alert.alert('Bank', 'Add your bank account for payouts.');
    setBusy(true);
    try {
      await kycAPI.identity({ idType: 'nin', bankCode, bankName, accountNumber, accountName: accountName || 'Account Holder' });
      await kycAPI.services(picked);
      await kycAPI.location({
        locationArea: area, locationType: 'both',
        priceMin: priceMin ? parseInt(priceMin) * 100 : undefined,
        priceMax: priceMax ? parseInt(priceMax) * 100 : undefined,
        priceNegotiable: true,
      });
      await kycAPI.submit();
      await refreshUser();
      await load();
      Alert.alert('Submitted', 'Your details are in for review. An admin will approve you shortly.');
    } catch (e: any) {
      Alert.alert('Submit failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <SafeAreaView style={s.c}><ActivityIndicator style={{ marginTop: 60 }} size="large" color={Colors.primary} /></SafeAreaView>;

  const kyc = status?.kycStatus || 'pending';
  const statusColor: any = { pending: 'gray', under_review: 'yellow', approved: 'green', rejected: 'red', info_requested: 'yellow' };

  return (
    <SafeAreaView style={s.c}>
      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
        <View style={s.head}>
          <Text style={s.h}>Get verified</Text>
          <Badge text={kyc.replace('_', ' ')} color={statusColor[kyc]} />
        </View>

        {kyc === 'approved' ? (
          <Card><Text style={s.note}>You're verified and live. Customers can now find you in search. 🎉</Text></Card>
        ) : kyc === 'under_review' ? (
          <Card><Text style={s.note}>Your details are under review. You'll be live as soon as an admin approves you. You can still update your info below.</Text></Card>
        ) : (
          <Card><Text style={s.note}>Fill this in to start receiving jobs. Customers only see verified vendors.</Text></Card>
        )}

        <Card style={{ gap: Spacing.md }}>
          <Text style={s.section}>Services you offer (max 4)</Text>
          <View style={s.chips}>
            {allServices.map((sv) => (
              <TouchableOpacity key={sv.id} onPress={() => toggle(sv.name)}
                style={[s.chip, picked.includes(sv.name) && s.chipOn]}>
                <Text style={[s.chipTxt, picked.includes(sv.name) && s.chipTxtOn]}>{sv.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card style={{ gap: Spacing.base }}>
          <Text style={s.section}>Where & pricing</Text>
          <Field label="Area you cover" value={area} onChangeText={setArea} placeholder="e.g. Yaba, Lagos" />
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <View style={{ flex: 1 }}><Field label="From (₦)" value={priceMin} onChangeText={setPriceMin} keyboardType="number-pad" placeholder="5000" /></View>
            <View style={{ flex: 1 }}><Field label="To (₦)" value={priceMax} onChangeText={setPriceMax} keyboardType="number-pad" placeholder="20000" /></View>
          </View>
        </Card>

        <Card style={{ gap: Spacing.base }}>
          <Text style={s.section}>Payout account</Text>
          <Text style={s.hint}>Where your earnings are paid out.</Text>
          <View style={s.chips}>
            {banks.slice(0, 12).map((b) => (
              <TouchableOpacity key={b.code} onPress={() => { setBankCode(b.code); setBankName(b.name); }}
                style={[s.chip, bankCode === b.code && s.chipOn]}>
                <Text style={[s.chipTxt, bankCode === b.code && s.chipTxtOn]}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Field label="Account number" value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" placeholder="0123456789" />
          <Field label="Account name" value={accountName} onChangeText={setAccountName} placeholder="As it appears at your bank" />
        </Card>

        <Button title="Submit for review" onPress={submitAll} loading={busy} />
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary },
  section: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textTertiary, marginTop: -4 },
  note: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTxtOn: { color: '#fff' },
});
