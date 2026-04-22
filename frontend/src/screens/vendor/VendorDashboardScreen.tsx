import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletAPI, jobsAPI, kycAPI } from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { formatNaira, formatShortDate, formatTransactionType } from '../../utils/helpers';
import { useSelector } from 'react-redux';

export default function VendorDashboardScreen({ navigation }: any) {
  const { user } = useSelector((s: any) => s.auth);
  const [wallet, setWallet] = useState<any>(null);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [kycStatus, setKycStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [walletRes, activeRes, recentRes, kycRes] = await Promise.all([
        walletAPI.getWallet(),
        jobsAPI.getMyJobs({ status: 'in_progress' }),
        jobsAPI.getMyJobs({ limit: 5 }),
        kycAPI.getStatus(),
      ]);
      setWallet(walletRes.data.data);
      setActiveJobs(activeRes.data.data);
      setRecentJobs(recentRes.data.data);
      setKycStatus(kycRes.data.data);
    } catch { }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  const isKycApproved = kycStatus?.kyc_status === 'approved';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.full_name?.split(' ')[0]}</Text>
          <Text style={styles.subGreeting}>
            {isKycApproved ? 'Your profile is live' : 'Complete your verification'}
          </Text>
        </View>
        <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* KYC prompt if not approved */}
      {!isKycApproved && (
        <TouchableOpacity
          style={[styles.kycBanner, kycStatus?.kyc_status === 'under_review' && styles.kycBannerReview]}
          onPress={() => kycStatus?.kyc_status === 'pending' && navigation.navigate('VendorKYC')}
        >
          <Ionicons
            name={kycStatus?.kyc_status === 'under_review' ? 'time-outline' : 'shield-outline'}
            size={20}
            color={kycStatus?.kyc_status === 'under_review' ? Colors.warning : Colors.primary}
          />
          <View style={styles.kycBannerInfo}>
            <Text style={styles.kycBannerTitle}>
              {kycStatus?.kyc_status === 'under_review' ? 'Verification under review' :
               kycStatus?.kyc_status === 'rejected' ? 'Verification rejected — resubmit' :
               'Complete your verification'}
            </Text>
            <Text style={styles.kycBannerSub}>
              {kycStatus?.kyc_status === 'under_review' ? 'Usually 24-48 hours. We\'ll notify you.' :
               kycStatus?.kyc_status === 'rejected' ? kycStatus?.kyc_rejection_reason :
               'Required to go live and receive bookings'}
            </Text>
          </View>
          {kycStatus?.kyc_status !== 'under_review' && <Ionicons name="chevron-forward" size={18} color={Colors.primary} />}
        </TouchableOpacity>
      )}

      {/* Wallet card */}
      <View style={styles.walletCard}>
        <View style={styles.walletHeader}>
          <Text style={styles.walletLabel}>Available balance</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Wallet')}>
            <Text style={styles.walletLink}>View wallet</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.walletBalance}>{wallet ? formatNaira(wallet.available_balance) : '₦0'}</Text>

        <View style={styles.walletRow}>
          <View style={styles.walletStat}>
            <Ionicons name="lock-closed-outline" size={14} color={Colors.escrow} />
            <Text style={styles.walletStatLabel}>In escrow</Text>
            <Text style={styles.walletStatValue}>{wallet ? formatNaira(wallet.escrow_balance) : '₦0'}</Text>
          </View>
          <View style={styles.walletDivider} />
          <View style={styles.walletStat}>
            <Ionicons name="trending-up-outline" size={14} color={Colors.success} />
            <Text style={styles.walletStatLabel}>Total earned</Text>
            <Text style={styles.walletStatValue}>{wallet ? formatNaira(wallet.total_earned) : '₦0'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.withdrawBtn} onPress={() => navigation.navigate('Wallet')}>
          <Ionicons name="arrow-down-circle-outline" size={18} color={Colors.textInverse} />
          <Text style={styles.withdrawBtnText}>Withdraw Funds</Text>
        </TouchableOpacity>
      </View>

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active jobs</Text>
          {activeJobs.map(job => (
            <TouchableOpacity key={job.id} style={styles.jobCard}
              onPress={() => navigation.navigate('Job', { jobId: job.id })}>
              <View style={[styles.jobStatusDot, { backgroundColor: Colors.info }]} />
              <View style={styles.jobInfo}>
                <Text style={styles.jobService}>{job.service_name}</Text>
                <Text style={styles.jobParty}>{job.other_party_name}</Text>
              </View>
              <View style={styles.jobRight}>
                <Text style={styles.jobAmount}>{formatNaira(job.agreed_amount)}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Profile health */}
      {isKycApproved && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile health</Text>
          <View style={styles.healthCard}>
            {[
              { label: 'Response rate', value: '—', icon: 'chatbubble-outline', color: Colors.primary },
              { label: 'Completion rate', value: '—', icon: 'checkmark-circle-outline', color: Colors.success },
              { label: 'Avg rating', value: '—', icon: 'star-outline', color: Colors.accent },
            ].map(stat => (
              <View key={stat.label} style={styles.healthStat}>
                <Ionicons name={stat.icon as any} size={20} color={stat.color} />
                <Text style={styles.healthValue}>{stat.value}</Text>
                <Text style={styles.healthLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Recent transactions */}
      {recentJobs.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent jobs</Text>
          {recentJobs.map(job => (
            <TouchableOpacity key={job.id} style={styles.txRow}
              onPress={() => navigation.navigate('Job', { jobId: job.id })}>
              <View style={styles.txIcon}>
                <Ionicons name="briefcase-outline" size={16} color={Colors.primary} />
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txTitle}>{job.service_name}</Text>
                <Text style={styles.txSub}>{job.other_party_name} · {formatShortDate(job.created_at)}</Text>
              </View>
              <Text style={[styles.txAmount, job.status === 'completed' && styles.txAmountGreen]}>
                {job.agreed_amount ? formatNaira(job.agreed_amount) : '—'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, paddingTop: 56, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.base },
  greeting: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary },
  subGreeting: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  notifBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border },
  kycBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.primary },
  kycBannerReview: { backgroundColor: Colors.warningLight, borderColor: Colors.warning },
  kycBannerInfo: { flex: 1 },
  kycBannerTitle: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  kycBannerSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },
  walletCard: { backgroundColor: Colors.primary, borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.base, gap: Spacing.md },
  walletHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walletLabel: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  walletLink: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  walletBalance: { fontSize: 40, fontWeight: '900', color: Colors.textInverse, letterSpacing: -1 },
  walletRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: BorderRadius.lg, padding: Spacing.md },
  walletStat: { flex: 1, alignItems: 'center', gap: 4 },
  walletDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: Spacing.sm },
  walletStatLabel: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.7)' },
  walletStatValue: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
  withdrawBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: BorderRadius.lg, height: 48 },
  withdrawBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
  section: { marginBottom: Spacing.base },
  sectionTitle: { fontSize: Typography.sm, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  jobCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, gap: Spacing.md, ...Shadows.sm, borderWidth: 1, borderColor: Colors.borderLight },
  jobStatusDot: { width: 10, height: 10, borderRadius: 5 },
  jobInfo: { flex: 1 },
  jobService: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  jobParty: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  jobRight: { alignItems: 'flex-end', gap: 4 },
  jobAmount: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  healthCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadows.sm, borderWidth: 1, borderColor: Colors.borderLight },
  healthStat: { flex: 1, alignItems: 'center', gap: 4 },
  healthValue: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary },
  healthLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: Spacing.md },
  txIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  txInfo: { flex: 1 },
  txTitle: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  txSub: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  txAmount: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  txAmountGreen: { color: Colors.success },
});
