import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offersAPI, paymentsAPI } from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { formatNaira, formatTimeAgo } from '../../utils/helpers';
import { useSelector } from 'react-redux';

const REASONS = [
  'My budget is lower',
  'The job is smaller than standard',
  'First time customer',
  'Can start immediately',
];

export default function NegotiationScreen({ route, navigation }: any) {
  const { jobId, vendorName, serviceName, vendorStartingPrice } = route.params;
  const { user } = useSelector((s: any) => s.auth);
  const isVendor = user?.role === 'vendor';

  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [offerAmount, setOfferAmount] = useState('');
  const [selectedReason, setSelectedReason] = useState('');
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer'>('card');

  useEffect(() => { loadThread(); }, []);

  const loadThread = async () => {
    try {
      const res = await offersAPI.getNegotiationThread(jobId);
      setThread(res.data.data);
    } catch { Alert.alert('Error', 'Failed to load negotiation'); }
    finally { setLoading(false); }
  };

  const currentPendingOffer = thread?.offers?.find((o: any) => o.status === 'pending');
  const isMyTurn = currentPendingOffer && currentPendingOffer.offered_by !== user?.id;
  const agreedAmount = thread?.job?.agreed_amount;
  const jobStatus = thread?.job?.status;

  const handleCounter = async () => {
    if (!offerAmount || isNaN(parseFloat(offerAmount))) {
      Alert.alert('Invalid amount', 'Please enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await offersAPI.respondToOffer(currentPendingOffer.id, 'counter', {
        amount: Math.round(parseFloat(offerAmount) * 100), // to kobo
        reason: selectedReason,
      });
      setShowOfferModal(false);
      setOfferAmount('');
      await loadThread();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to counter');
    } finally { setSubmitting(false); }
  };

  const handleAccept = async (offerId: string) => {
    Alert.alert(
      'Accept offer?',
      `Accept ${formatNaira(currentPendingOffer?.amount)} and proceed to payment?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept & Pay',
          onPress: async () => {
            setSubmitting(true);
            try {
              if (isVendor) {
                await offersAPI.respondToOffer(offerId, 'accept');
              } else {
                await offersAPI.acceptCounter(offerId);
              }
              await loadThread();
              setShowPaymentModal(true);
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to accept');
            } finally { setSubmitting(false); }
          }
        }
      ]
    );
  };

  const handleDecline = async (offerId: string) => {
    Alert.alert('Decline offer?', 'This will cancel the negotiation.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          await offersAPI.respondToOffer(offerId, 'decline');
          navigation.goBack();
        }
      }
    ]);
  };

  const handlePayment = async () => {
    setSubmitting(true);
    try {
      const res = await paymentsAPI.initiate(jobId, paymentMethod);
      setShowPaymentModal(false);
      navigation.navigate('Payment', { paymentData: res.data.data, jobId });
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Payment failed');
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{vendorName}</Text>
          <Text style={styles.headerSubtitle}>{serviceName}</Text>
        </View>
      </View>

      {/* Job reference */}
      {thread?.job?.reference && (
        <View style={styles.refBanner}>
          <Text style={styles.refText}>Ref: {thread.job.reference}</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Agreed state */}
        {jobStatus === 'payment_pending' && agreedAmount && (
          <View style={styles.agreedBanner}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <View>
              <Text style={styles.agreedTitle}>Terms agreed!</Text>
              <Text style={styles.agreedAmount}>{formatNaira(agreedAmount)}</Text>
            </View>
            <TouchableOpacity style={styles.payNowBtn} onPress={() => setShowPaymentModal(true)}>
              <Text style={styles.payNowText}>Pay Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Offer thread */}
        {thread?.offers?.map((offer: any, index: number) => {
          const isMine = offer.offered_by === user?.id;
          return (
            <View key={offer.id} style={[styles.offerBubble, isMine ? styles.myOffer : styles.theirOffer]}>
              <Text style={styles.offerByText}>
                {isMine ? 'You' : offer.offered_by_name} · Round {offer.round}
              </Text>
              <Text style={styles.offerAmount}>{formatNaira(offer.amount)}</Text>
              {offer.reason && <Text style={styles.offerReason}>{offer.reason}</Text>}
              <View style={styles.offerFooter}>
                <Text style={styles.offerTime}>{formatTimeAgo(offer.created_at)}</Text>
                <View style={[styles.statusPill,
                  offer.status === 'accepted' && styles.statusAccepted,
                  offer.status === 'declined' && styles.statusDeclined,
                  offer.status === 'expired' && styles.statusExpired,
                ]}>
                  <Text style={[styles.statusText,
                    offer.status === 'accepted' && styles.statusTextAccepted,
                    offer.status === 'declined' && styles.statusTextDeclined,
                  ]}>{offer.status}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Action bar */}
      {isMyTurn && currentPendingOffer && jobStatus === 'negotiating' && (
        <View style={styles.actionBar}>
          <Text style={styles.actionPrompt}>
            {isVendor ? 'Customer offered' : 'Vendor countered'} {formatNaira(currentPendingOffer.amount)}
          </Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(currentPendingOffer.id)}>
              <Text style={styles.declineBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.counterBtn} onPress={() => setShowOfferModal(true)}>
              <Text style={styles.counterBtnText}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(currentPendingOffer.id)}>
              <Ionicons name="checkmark" size={18} color={Colors.textInverse} />
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Counter offer modal */}
      <Modal visible={showOfferModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Make a counter offer</Text>

            <View style={styles.amountInput}>
              <Text style={styles.nairaSymbol}>₦</Text>
              <TextInput
                style={styles.amountField}
                placeholder="Enter amount"
                keyboardType="numeric"
                value={offerAmount}
                onChangeText={setOfferAmount}
                autoFocus
              />
            </View>

            <Text style={styles.reasonLabel}>Reason (optional)</Text>
            <View style={styles.reasonsList}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.reasonChip, selectedReason === r && styles.reasonChipSelected]}
                  onPress={() => setSelectedReason(selectedReason === r ? '' : r)}
                >
                  <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextSelected]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowOfferModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleCounter} disabled={submitting}>
                {submitting ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.modalSubmitText}>Send Counter</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment modal */}
      <Modal visible={showPaymentModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Pay {formatNaira(agreedAmount)}</Text>
            <Text style={styles.modalSubtitle}>This will be held securely in escrow until the job is complete.</Text>

            <TouchableOpacity style={[styles.paymentOption, paymentMethod === 'card' && styles.paymentOptionSelected]}
              onPress={() => setPaymentMethod('card')}>
              <Ionicons name="card-outline" size={22} color={paymentMethod === 'card' ? Colors.primary : Colors.textSecondary} />
              <View style={styles.paymentOptionInfo}>
                <Text style={styles.paymentOptionTitle}>Card Payment</Text>
                <Text style={styles.paymentOptionSub}>Debit or credit card</Text>
              </View>
              {paymentMethod === 'card' && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.paymentOption, paymentMethod === 'bank_transfer' && styles.paymentOptionSelected]}
              onPress={() => setPaymentMethod('bank_transfer')}>
              <Ionicons name="business-outline" size={22} color={paymentMethod === 'bank_transfer' ? Colors.primary : Colors.textSecondary} />
              <View style={styles.paymentOptionInfo}>
                <Text style={styles.paymentOptionTitle}>Bank Transfer</Text>
                <Text style={styles.paymentOptionSub}>Transfer from any bank</Text>
              </View>
              {paymentMethod === 'bank_transfer' && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
            </TouchableOpacity>

            <View style={styles.escrowNote}>
              <Ionicons name="lock-closed" size={14} color={Colors.escrow} />
              <Text style={styles.escrowNoteText}>Payment held in escrow. Released only after you confirm the job is complete.</Text>
            </View>

            <TouchableOpacity style={styles.modalSubmit} onPress={handlePayment} disabled={submitting}>
              {submitting ? <ActivityIndicator color={Colors.textInverse} /> : (
                <Text style={styles.modalSubmitText}>Pay {formatNaira(agreedAmount)}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: Spacing.sm },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  headerSubtitle: { fontSize: Typography.sm, color: Colors.textSecondary },
  refBanner: { backgroundColor: Colors.primaryLight, padding: Spacing.sm, alignItems: 'center' },
  refText: { fontSize: Typography.sm, color: Colors.primary, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: 120 },
  agreedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg, padding: Spacing.base, gap: Spacing.md, marginBottom: Spacing.base },
  agreedTitle: { fontSize: Typography.sm, color: Colors.success, fontWeight: '600' },
  agreedAmount: { fontSize: Typography.xl, color: Colors.success, fontWeight: '700' },
  payNowBtn: { marginLeft: 'auto', backgroundColor: Colors.success, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  payNowText: { color: Colors.textInverse, fontWeight: '700', fontSize: Typography.sm },
  offerBubble: { maxWidth: '80%', borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4 },
  myOffer: { alignSelf: 'flex-end', backgroundColor: Colors.primary },
  theirOffer: { alignSelf: 'flex-start', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  offerByText: { fontSize: Typography.sm, color: Colors.textInverse, opacity: 0.8 },
  offerAmount: { fontSize: Typography.xl, fontWeight: '700', color: Colors.textInverse },
  offerReason: { fontSize: Typography.sm, color: Colors.textInverse, opacity: 0.9 },
  offerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  offerTime: { fontSize: 11, color: Colors.textInverse, opacity: 0.7 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full, backgroundColor: 'rgba(255,255,255,0.2)' },
  statusAccepted: { backgroundColor: Colors.successLight },
  statusDeclined: { backgroundColor: Colors.dangerLight },
  statusExpired: { backgroundColor: Colors.surfaceAlt },
  statusText: { fontSize: 10, color: Colors.textInverse, fontWeight: '600', textTransform: 'uppercase' },
  statusTextAccepted: { color: Colors.success },
  statusTextDeclined: { color: Colors.danger },
  actionBar: { backgroundColor: Colors.surface, padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.border, gap: Spacing.sm },
  actionPrompt: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  actionButtons: { flexDirection: 'row', gap: Spacing.sm },
  declineBtn: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.danger },
  declineBtnText: { fontSize: Typography.base, fontWeight: '600', color: Colors.danger },
  counterBtn: { flex: 1, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.primary },
  counterBtnText: { fontSize: Typography.base, fontWeight: '600', color: Colors.primary },
  acceptBtn: { flex: 1.5, height: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, borderRadius: BorderRadius.md, backgroundColor: Colors.primary },
  acceptBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, gap: Spacing.base },
  modalTitle: { fontSize: Typography.lg, fontWeight: '700', color: Colors.textPrimary },
  modalSubtitle: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 20 },
  amountInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.base, height: 56 },
  nairaSymbol: { fontSize: Typography.xl, fontWeight: '700', color: Colors.textSecondary, marginRight: Spacing.sm },
  amountField: { flex: 1, fontSize: Typography.xl, fontWeight: '700', color: Colors.textPrimary },
  reasonLabel: { fontSize: Typography.sm, fontWeight: '600', color: Colors.textSecondary },
  reasonsList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reasonChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  reasonChipSelected: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  reasonText: { fontSize: Typography.sm, color: Colors.textSecondary },
  reasonTextSelected: { color: Colors.primary, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: Spacing.sm },
  modalCancel: { flex: 1, height: 52, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border },
  modalCancelText: { fontSize: Typography.base, fontWeight: '600', color: Colors.textSecondary },
  modalSubmit: { flex: 2, height: 52, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, backgroundColor: Colors.primary },
  modalSubmitText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
  paymentOption: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border, gap: Spacing.md },
  paymentOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  paymentOptionInfo: { flex: 1 },
  paymentOptionTitle: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  paymentOptionSub: { fontSize: Typography.sm, color: Colors.textSecondary },
  escrowNote: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.escrowLight, padding: Spacing.md, borderRadius: BorderRadius.md },
  escrowNoteText: { flex: 1, fontSize: Typography.sm, color: Colors.escrow, lineHeight: 18 },
});
