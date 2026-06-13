import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Card, Badge } from '../../components/ui';
import { Colors, Spacing, naira } from '../../constants/theme';
import { offerAPI, paymentAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

export default function NegotiationScreen({ route, navigation }: any) {
  const { offerId } = route.params;
  const { user } = useAuth();
  const [offer, setOffer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [counter, setCounter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const o = await offerAPI.get(offerId);
      setOffer(o);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isCustomer = user?.id === offer?.customerId;
  const isVendor = user?.id === offer?.vendorId;
  // Whose turn? pending → vendor acts; countered → customer acts
  const myTurn = (offer?.status === 'pending' && isVendor) || (offer?.status === 'countered' && isCustomer);
  const currentAmount = offer?.status === 'countered' ? offer?.vendorAmount : offer?.customerAmount;

  const act = async (action: string) => {
    setBusy(true);
    try {
      if (action === 'counter') {
        const naue = parseInt(counter, 10);
        if (!naue || naue < 100) { Alert.alert('Enter amount', 'Enter a valid counter amount (min ₦100).'); setBusy(false); return; }
        await offerAPI.respond(offerId, { action: 'counter', counterAmount: naue * 100 });
      } else {
        await offerAPI.respond(offerId, { action });
      }
      setCounter('');
      await load();
    } catch (e: any) {
      Alert.alert('Action failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const payNow = async () => {
    setBusy(true);
    try {
      const r = await paymentAPI.initiate(offerId);
      // Dev mode: confirm immediately so we can test the job flow
      if (r.devMode) {
        await paymentAPI.devConfirm(r.reference);
        Alert.alert('Payment confirmed', 'Your payment is held safely in escrow. The job is now active.', [
          { text: 'View job', onPress: () => navigation.navigate('Main', { screen: 'Jobs' }) },
        ]);
      } else {
        Alert.alert('Continue payment', `Open this link to pay:\n${r.authorizationUrl}`);
      }
    } catch (e: any) {
      Alert.alert('Payment failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <SafeAreaView style={s.c}><ActivityIndicator style={{ marginTop: 60 }} size="large" color={Colors.primary} /></SafeAreaView>;
  if (!offer) return null;

  const statusColor: any = { pending: 'yellow', countered: 'yellow', accepted: 'green', rejected: 'red', expired: 'gray' };

  return (
    <SafeAreaView style={s.c}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={s.topTitle}>Negotiation</Text>
        <TouchableOpacity onPress={load}><Ionicons name="refresh" size={22} color={Colors.primary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
        <Card>
          <View style={s.cardTop}>
            <Text style={s.service}>{offer.serviceName}</Text>
            <Badge text={offer.status} color={statusColor[offer.status]} />
          </View>
          <Text style={s.parties}>{offer.customerName} → {offer.vendorName}</Text>
          {offer.description ? <Text style={s.desc}>{offer.description}</Text> : null}
          <View style={s.amountBox}>
            <Text style={s.amountLabel}>{offer.status === 'countered' ? 'Vendor counter offer' : 'Current offer'}</Text>
            <Text style={s.amount}>{naira(currentAmount)}</Text>
          </View>
          <Text style={s.round}>Round {offer.roundNumber} of 3</Text>
        </Card>

        {offer.status === 'accepted' && (
          <Card style={{ gap: Spacing.base }}>
            <Text style={s.acceptedTitle}>Deal agreed at {naira(offer.finalAmount)}</Text>
            {isCustomer ? (
              <>
                <Text style={s.note}>Pay now to lock it in. Your money is held safely and only released to the vendor after you confirm the job is done.</Text>
                <Button title={`Pay ${naira(offer.finalAmount)}`} onPress={payNow} loading={busy} />
              </>
            ) : (
              <Text style={s.note}>Waiting for the customer to pay. You'll be notified once payment lands in escrow.</Text>
            )}
          </Card>
        )}

        {['pending', 'countered'].includes(offer.status) && (
          myTurn ? (
            <Card style={{ gap: Spacing.base }}>
              <Text style={s.actTitle}>Your move</Text>
              <Button title={`Accept ${naira(currentAmount)}`} variant="success" onPress={() => act('accept')} loading={busy} />
              <Field label="Or counter with (₦)" value={counter} onChangeText={setCounter} keyboardType="number-pad" placeholder="e.g. 12000" />
              <Button title="Send counter offer" onPress={() => act('counter')} loading={busy} disabled={offer.roundNumber >= 3} />
              {offer.roundNumber >= 3 && <Text style={s.note}>Final round reached — you can accept or decline, but not counter again.</Text>}
              <Button title="Decline" variant="danger" onPress={() => act('reject')} loading={busy} />
            </Card>
          ) : (
            <Card><Text style={s.note}>Waiting for the other person to respond. Pull back here to check for updates.</Text></Card>
          )
        )}

        {offer.status === 'rejected' && <Card><Text style={s.note}>This offer was declined.</Text></Card>}
        {offer.status === 'expired' && <Card><Text style={s.note}>This offer expired. Start a new one from the vendor's profile.</Text></Card>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  topTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  service: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  parties: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  desc: { fontSize: 14, color: Colors.textPrimary, marginTop: Spacing.sm, lineHeight: 20 },
  amountBox: { backgroundColor: Colors.primaryLight, borderRadius: 12, padding: Spacing.base, marginTop: Spacing.base, alignItems: 'center' },
  amountLabel: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  amount: { fontSize: 32, fontWeight: '900', color: Colors.primary, marginTop: 2 },
  round: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.sm },
  acceptedTitle: { fontSize: 16, fontWeight: '800', color: Colors.success, textAlign: 'center' },
  actTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  note: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center' },
});
