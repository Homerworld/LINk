import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Badge, Empty } from '../../components/ui';
import { Colors, Spacing, naira } from '../../constants/theme';
import { jobAPI, walletAPI, kycAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

const STATUS: any = {
  active: ['In progress', 'indigo'],
  completed: ['Awaiting confirmation', 'yellow'],
  confirmed: ['Completed', 'green'],
  disputed: ['Disputed', 'red'],
};

export default function VendorDashboardScreen({ navigation }: any) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [kyc, setKyc] = useState<string>('pending');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, j, k] = await Promise.all([walletAPI.get().catch(() => null), jobAPI.mine().catch(() => []), kycAPI.status().catch(() => ({ kycStatus: 'pending' }))]);
      setWallet(w); setJobs(j); setKyc(k.kycStatus || 'pending');
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const activeJobs = jobs.filter(j => ['active', 'completed'].includes(j.status));

  return (
    <SafeAreaView style={s.c}>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Text style={s.hi}>Hi, {user?.fullName?.split(' ')[0]} 👋</Text>

        {kyc !== 'approved' && (
          <TouchableOpacity onPress={() => navigation.navigate('KYC')}>
            <Card style={s.kycCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.kycTitle}>{kyc === 'under_review' ? 'Verification under review' : 'Finish getting verified'}</Text>
                <Text style={s.kycSub}>{kyc === 'under_review' ? 'You\'ll be live once an admin approves you.' : 'Customers only see verified vendors. Tap to complete.'}</Text>
              </View>
              <Badge text={kyc.replace('_', ' ')} color={kyc === 'under_review' ? 'yellow' : 'gray'} />
            </Card>
          </TouchableOpacity>
        )}

        <View style={s.statsRow}>
          <Card style={s.stat}>
            <Text style={s.statLabel}>Available</Text>
            <Text style={s.statValue}>{naira(wallet?.availableBalance || 0)}</Text>
          </Card>
          <Card style={s.stat}>
            <Text style={s.statLabel}>In escrow</Text>
            <Text style={[s.statValue, { color: Colors.escrow }]}>{naira(wallet?.escrowBalance || 0)}</Text>
          </Card>
        </View>
        <Card>
          <Text style={s.statLabel}>Total earned</Text>
          <Text style={[s.statValue, { color: Colors.success }]}>{naira(wallet?.totalEarned || 0)}</Text>
        </Card>

        <Text style={s.section}>Active jobs</Text>
        {activeJobs.length === 0 ? (
          <Empty title="No active jobs" subtitle="When a customer pays for an agreed offer, the job lands here." />
        ) : activeJobs.map((j) => {
          const [label, color] = STATUS[j.status] || [j.status, 'gray'];
          return (
            <TouchableOpacity key={j.id} activeOpacity={0.85} onPress={() => navigation.navigate('JobDetail', { jobId: j.id })}>
              <Card>
                <View style={s.row}>
                  <Text style={s.jobService}>{j.serviceName}</Text>
                  <Badge text={label} color={color} />
                </View>
                <Text style={s.jobOther}>for {j.customerName}</Text>
                <Text style={s.jobAmt}>{naira(j.vendorPayout)} payout</Text>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  hi: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary },
  kycCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.warningLight, borderColor: '#FDE68A' },
  kycTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  kycSub: { fontSize: 13, color: '#B45309', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: Spacing.base },
  stat: { flex: 1 },
  statLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  statValue: { fontSize: 22, fontWeight: '900', color: Colors.textPrimary, marginTop: 4 },
  section: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobService: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  jobOther: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  jobAmt: { fontSize: 16, fontWeight: '800', color: Colors.success, marginTop: 6 },
});
