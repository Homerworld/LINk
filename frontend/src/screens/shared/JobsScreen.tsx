import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Badge, Empty } from '../../components/ui';
import { Colors, Spacing, naira } from '../../constants/theme';
import { jobAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

const STATUS: any = {
  pending_payment: ['Awaiting payment', 'yellow'],
  active: ['In progress', 'indigo'],
  completed: ['Awaiting confirmation', 'yellow'],
  confirmed: ['Completed', 'green'],
  disputed: ['Disputed', 'red'],
  refunded: ['Refunded', 'gray'],
};

export default function JobsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setJobs(await jobAPI.mine()); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.c}>
      <Text style={s.h}>Jobs</Text>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        renderItem={({ item }) => {
          const [label, color] = STATUS[item.status] || [item.status, 'gray'];
          const other = user?.id === item.customerId ? item.vendorName : item.customerName;
          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}>
              <Card>
                <View style={s.row}>
                  <Text style={s.service}>{item.serviceName}</Text>
                  <Badge text={label} color={color} />
                </View>
                <Text style={s.other}>with {other}</Text>
                <Text style={s.amt}>{naira(item.agreedAmount)}</Text>
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Empty title="No jobs yet" subtitle="Once an offer is paid, the job appears here and you can track it to completion." />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  h: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary, paddingHorizontal: Spacing.base, paddingTop: Spacing.base },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  service: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  other: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  amt: { fontSize: 18, fontWeight: '800', color: Colors.primary, marginTop: 6 },
});
