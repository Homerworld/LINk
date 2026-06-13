import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Field, Card, Empty } from '../../components/ui';
import { Colors, Spacing, naira } from '../../constants/theme';
import { walletAPI } from '../../services/api';

export default function WalletScreen({ navigation }: any) {
  const [wallet, setWallet] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([walletAPI.get().catch(() => null), walletAPI.transactions().catch(() => [])]);
      setWallet(w); setTxns(t);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const withdraw = async () => {
    const naue = parseInt(amount, 10);
    if (!naue || naue < 2000) return Alert.alert('Minimum ₦2,000', 'Withdrawals start at ₦2,000.');
    if (!/^\d{4}$/.test(pin)) return Alert.alert('PIN', 'Enter your 4-digit PIN.');
    setBusy(true);
    try {
      await walletAPI.withdraw(naue * 100, pin);
      setAmount(''); setPin('');
      await load();
      Alert.alert('Requested', 'Withdrawal initiated. Expect payment within 24 hours.');
    } catch (e: any) {
      Alert.alert('Withdrawal failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.c}>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={s.head}>
          <Text style={s.h}>Wallet</Text>
        </View>

        <Card style={s.balanceCard}>
          <Text style={s.balLabel}>Available to withdraw</Text>
          <Text style={s.balValue}>{naira(wallet?.availableBalance || 0)}</Text>
          <View style={s.balRow}>
            <Text style={s.balSub}>In escrow: {naira(wallet?.escrowBalance || 0)}</Text>
            <Text style={s.balSub}>Earned: {naira(wallet?.totalEarned || 0)}</Text>
          </View>
        </Card>

        <Card style={{ gap: Spacing.base }}>
          <Text style={s.section}>Withdraw</Text>
          {wallet?.accountNumber ? (
            <Text style={s.hint}>To {wallet.bankName} · {wallet.accountNumber}</Text>
          ) : (
            <Text style={s.hint}>Add a payout account in your KYC first.</Text>
          )}
          <Field label="Amount (₦)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="Min 2000" />
          <Field label="4-digit PIN" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={4} placeholder="••••" />
          <Button title="Withdraw" onPress={withdraw} loading={busy} />
          <Button title="Set / change PIN" variant="ghost" onPress={() => navigation.navigate('SetPin')} />
        </Card>

        <Text style={s.section}>Recent activity</Text>
        {txns.length === 0 ? (
          <Empty title="No transactions yet" subtitle="Payments and withdrawals will appear here." />
        ) : txns.map((t) => (
          <Card key={t.id} style={s.txn}>
            <View style={{ flex: 1 }}>
              <Text style={s.txnType}>{t.type?.replace('_', ' ')}</Text>
              <Text style={s.txnDesc}>{t.description}</Text>
            </View>
            <Text style={[s.txnAmt, { color: t.type === 'withdrawal' ? Colors.danger : Colors.success }]}>
              {t.type === 'withdrawal' ? '-' : '+'}{naira(t.amount)}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary },
  balanceCard: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  balLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  balValue: { fontSize: 36, fontWeight: '900', color: '#fff', marginTop: 4 },
  balRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  balSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  section: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  hint: { fontSize: 13, color: Colors.textTertiary, marginTop: -4 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  txnType: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, textTransform: 'capitalize' },
  txnDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  txnAmt: { fontSize: 16, fontWeight: '800' },
});
