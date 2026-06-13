import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Badge, Field } from '../../components/ui';
import { Colors, Spacing, naira } from '../../constants/theme';
import { jobAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

const STATUS: any = {
  pending_payment: ['Awaiting payment', 'yellow'],
  active: ['In progress', 'indigo'],
  completed: ['Awaiting your confirmation', 'yellow'],
  confirmed: ['Completed', 'green'],
  disputed: ['Disputed', 'red'],
  refunded: ['Refunded', 'gray'],
};

export default function JobDetailScreen({ route, navigation }: any) {
  const { jobId } = route.params;
  const { user } = useAuth();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');

  const load = useCallback(async () => {
    try { setJob(await jobAPI.get(jobId)); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, [jobId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isCustomer = user?.id === job?.customerId;
  const isVendor = user?.id === job?.vendorId;

  const run = async (fn: () => Promise<any>, successMsg?: string) => {
    setBusy(true);
    try { await fn(); if (successMsg) Alert.alert('Done', successMsg); await load(); }
    catch (e: any) { Alert.alert('Action failed', e.message); }
    finally { setBusy(false); }
  };

  const dispute = () => {
    Alert.alert('Raise a dispute', 'What went wrong?', [
      { text: 'Vendor never started', onPress: () => run(() => jobAPI.dispute(jobId, { issue: 'never_started' }), 'Dispute raised. Support will review.') },
      { text: 'Work incomplete', onPress: () => run(() => jobAPI.dispute(jobId, { issue: 'incomplete' }), 'Dispute raised. Support will review.') },
      { text: 'Poor quality', onPress: () => run(() => jobAPI.dispute(jobId, { issue: 'quality' }), 'Dispute raised. Support will review.') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading) return <SafeAreaView style={s.c}><ActivityIndicator style={{ marginTop: 60 }} size="large" color={Colors.primary} /></SafeAreaView>;
  if (!job) return null;

  const [label, color] = STATUS[job.status] || [job.status, 'gray'];
  const other = isCustomer ? job.vendorName : job.customerName;
  const alreadyReviewed = isCustomer ? !!job.customerRating : !!job.vendorReview;

  return (
    <SafeAreaView style={s.c}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={s.topTitle}>Job</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
        <Card>
          <View style={s.row}>
            <Text style={s.service}>{job.serviceName}</Text>
            <Badge text={label} color={color} />
          </View>
          <Text style={s.other}>with {other}</Text>
          <View style={s.amountBox}>
            <Text style={s.amountLabel}>Agreed price</Text>
            <Text style={s.amount}>{naira(job.agreedAmount)}</Text>
            {isVendor && <Text style={s.payout}>You receive {naira(job.vendorPayout)} after 10% fee</Text>}
          </View>
        </Card>

        {/* VENDOR: mark complete */}
        {isVendor && job.status === 'active' && (
          <Card style={{ gap: Spacing.md }}>
            <Text style={s.note}>Finished the work? Mark it complete and the customer has 24 hours to confirm before funds release automatically.</Text>
            <Button title="Mark as complete" variant="success" onPress={() => run(() => jobAPI.complete(jobId), 'Customer notified to confirm.')} loading={busy} />
          </Card>
        )}

        {/* CUSTOMER: confirm or dispute */}
        {isCustomer && job.status === 'completed' && (
          <Card style={{ gap: Spacing.md }}>
            <Text style={s.note}>The vendor marked this job done. Confirm to release payment, or raise a dispute if there's a problem.</Text>
            <Button title="Confirm & release payment" variant="success" onPress={() => run(() => jobAPI.confirm(jobId), 'Payment released. Thank you!')} loading={busy} />
            <Button title="Raise a dispute" variant="danger" onPress={dispute} loading={busy} />
          </Card>
        )}

        {isCustomer && job.status === 'active' && (
          <Card style={{ gap: Spacing.md }}>
            <Text style={s.note}>Work is in progress. If something goes wrong you can raise a dispute.</Text>
            <Button title="Raise a dispute" variant="danger" onPress={dispute} loading={busy} />
          </Card>
        )}

        {/* Review after confirmed */}
        {job.status === 'confirmed' && !alreadyReviewed && (
          <Card style={{ gap: Spacing.md }}>
            <Text style={s.actTitle}>Leave a review</Text>
            {isCustomer && (
              <View style={s.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setRating(n)}>
                    <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={Colors.accent} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Field label="Comment (optional)" value={review} onChangeText={setReview} placeholder="How did it go?" multiline />
            <Button
              title="Submit review"
              onPress={() => run(() => jobAPI.review(jobId, { rating: isCustomer ? rating || 5 : undefined, review: review.trim() || undefined }), 'Thanks for your review!')}
              loading={busy}
              disabled={isCustomer && rating === 0}
            />
          </Card>
        )}

        {job.status === 'confirmed' && alreadyReviewed && (
          <Card><Text style={s.note}>This job is complete. Thanks for using Link!</Text></Card>
        )}

        {job.status === 'disputed' && (
          <Card><Text style={s.note}>This job is under dispute. Our support team will review the evidence and rule within 48 hours.</Text></Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  topTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  service: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  other: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  amountBox: { backgroundColor: Colors.primaryLight, borderRadius: 12, padding: Spacing.base, marginTop: Spacing.base, alignItems: 'center' },
  amountLabel: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  amount: { fontSize: 30, fontWeight: '900', color: Colors.primary, marginTop: 2 },
  payout: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  note: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center' },
  actTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm },
});
