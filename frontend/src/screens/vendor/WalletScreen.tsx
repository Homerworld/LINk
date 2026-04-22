import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletAPI } from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { formatNaira, formatShortDate, formatTransactionType } from '../../utils/helpers';

export default function WalletScreen({ navigation }: any) {
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPin, setWithdrawPin] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [walletRes, txRes] = await Promise.all([walletAPI.getWallet(), walletAPI.getTransactions()]);
      setWallet(walletRes.data.data);
      setTransactions(txRes.data.data);
    } catch { }
    finally { setLoading(false); }
  };

  const handleWithdraw = async () => {
    const amount = Math.round(parseFloat(withdrawAmount) * 100); // to kobo
    if (!withdrawAmount || isNaN(amount) || amount < 200000) {
      Alert.alert('Invalid', 'Minimum withdrawal is ₦2,000'); return;
    }
    if (withdrawPin.length !== 4) { Alert.alert('Invalid', 'Enter your 4-digit PIN'); return; }

    setWithdrawing(true);
    try {
      const res = await walletAPI.withdraw(amount, withdrawPin);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawPin('');
      Alert.alert('Withdrawal initiated', `${res.data.data.amount_formatted} is being processed to ${res.data.data.bank_name}. Expect it within 24 hours.`);
      load();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Withdrawal failed');
    } finally { setWithdrawing(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balanceAmount}>{formatNaira(wallet?.available_balance || 0)}</Text>

          <View style={styles.escrowRow}>
            <Ionicons name="lock-closed-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.escrowText}>{formatNaira(wallet?.escrow_balance || 0)} in escrow</Text>
          </View>

          <View style={styles.bankInfo}>
            <Ionicons name="business-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.bankText}>
              {wallet?.bank_name || 'No bank linked'} {wallet?.account_number ? `· ****${wallet.account_number.slice(-4)}` : ''}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.withdrawBtn, (!wallet?.available_balance || wallet.available_balance < 200000) && styles.withdrawBtnDisabled]}
            onPress={() => setShowWithdrawModal(true)}
            disabled={!wallet?.available_balance || wallet.available_balance < 200000}
          >
            <Ionicons name="arrow-down-circle-outline" size={18} color={Colors.textInverse} />
            <Text style={styles.withdrawBtnText}>Withdraw Funds</Text>
          </TouchableOpacity>
        </View>

        {/* Total earned */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total earned</Text>
            <Text style={styles.statValue}>{formatNaira(wallet?.total_earned || 0)}</Text>
          </View>
        </View>

        {/* Transactions */}
        <Text style={styles.sectionTitle}>Transaction history</Text>

        {transactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        ) : (
          transactions.map((tx, i) => (
            <View key={i} style={styles.txRow}>
              <View style={[styles.txIcon, tx.type === 'payout' || tx.type === 'escrow_out' ? styles.txIconGreen : styles.txIconPurple]}>
                <Ionicons
                  name={tx.type === 'withdrawal' ? 'arrow-up' : tx.type === 'payout' ? 'checkmark' : 'lock-closed-outline'}
                  size={14}
                  color={Colors.textInverse}
                />
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txTitle}>{formatTransactionType(tx.type)}</Text>
                <Text style={styles.txSub}>{tx.job_reference || tx.description} · {formatShortDate(tx.created_at)}</Text>
              </View>
              <Text style={[styles.txAmount, tx.type === 'withdrawal' ? styles.txNegative : styles.txPositive]}>
                {tx.type === 'withdrawal' ? '-' : '+'}{formatNaira(tx.amount)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Withdrawal Modal */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Withdraw funds</Text>

            <View style={styles.availableRow}>
              <Text style={styles.availableLabel}>Available</Text>
              <Text style={styles.availableAmount}>{formatNaira(wallet?.available_balance || 0)}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount to withdraw</Text>
              <View style={styles.amountRow}>
                <Text style={styles.naira}>₦</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  autoFocus
                />
              </View>
              <Text style={styles.minNote}>Minimum withdrawal: ₦2,000</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Withdrawal PIN</Text>
              <View style={styles.pinRow}>
                <TextInput
                  style={styles.pinInput}
                  placeholder="••••"
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry={!showPin}
                  value={withdrawPin}
                  onChangeText={setWithdrawPin}
                />
                <TouchableOpacity onPress={() => setShowPin(!showPin)} style={styles.eyeBtn}>
                  <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>

            {wallet?.bank_name && (
              <View style={styles.bankConfirm}>
                <Ionicons name="business-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.bankConfirmText}>{wallet.bank_name} · ****{wallet.account_number?.slice(-4)}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowWithdrawModal(false); setWithdrawAmount(''); setWithdrawPin(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleWithdraw} disabled={withdrawing}>
                {withdrawing ? <ActivityIndicator color={Colors.textInverse} /> : <Text style={styles.confirmBtnText}>Withdraw</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: Typography.md, fontWeight: '700', color: Colors.textPrimary },
  content: { padding: Spacing.base, paddingBottom: 40 },
  balanceCard: { backgroundColor: Colors.primary, borderRadius: BorderRadius.xl, padding: Spacing.xl, gap: Spacing.md, marginBottom: Spacing.base },
  balanceLabel: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceAmount: { fontSize: 44, fontWeight: '900', color: Colors.textInverse, letterSpacing: -1 },
  escrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  escrowText: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.7)' },
  bankInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bankText: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.7)' },
  withdrawBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: BorderRadius.lg, height: 52 },
  withdrawBtnDisabled: { opacity: 0.5 },
  withdrawBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
  statsRow: { marginBottom: Spacing.base },
  statCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.border },
  statLabel: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '600' },
  statValue: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary, marginTop: 4 },
  sectionTitle: { fontSize: Typography.sm, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { fontSize: Typography.base, color: Colors.textTertiary },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: Spacing.md },
  txIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  txIconGreen: { backgroundColor: Colors.success },
  txIconPurple: { backgroundColor: Colors.escrow },
  txInfo: { flex: 1 },
  txTitle: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  txSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  txAmount: { fontSize: Typography.base, fontWeight: '700' },
  txPositive: { color: Colors.success },
  txNegative: { color: Colors.textPrimary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, gap: Spacing.base, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.sm },
  modalTitle: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary },
  availableRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.successLight, borderRadius: BorderRadius.md, padding: Spacing.md },
  availableLabel: { fontSize: Typography.sm, color: Colors.success, fontWeight: '600' },
  availableAmount: { fontSize: Typography.base, fontWeight: '800', color: Colors.success },
  inputGroup: { gap: Spacing.sm },
  inputLabel: { fontSize: Typography.sm, fontWeight: '600', color: Colors.textSecondary },
  amountRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, height: 56 },
  naira: { fontSize: Typography.xl, fontWeight: '700', color: Colors.textSecondary, marginRight: Spacing.sm },
  amountInput: { flex: 1, fontSize: Typography.xl, fontWeight: '700', color: Colors.textPrimary },
  minNote: { fontSize: Typography.sm, color: Colors.textTertiary },
  pinRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.base, height: 52 },
  pinInput: { flex: 1, fontSize: Typography.xl, fontWeight: '700', color: Colors.textPrimary, letterSpacing: 8 },
  eyeBtn: { padding: Spacing.sm },
  bankConfirm: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.md, padding: Spacing.md },
  bankConfirmText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  cancelBtn: { flex: 1, height: 52, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border },
  cancelBtnText: { fontSize: Typography.base, fontWeight: '600', color: Colors.textSecondary },
  confirmBtn: { flex: 2, height: 52, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, backgroundColor: Colors.primary },
  confirmBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
});
