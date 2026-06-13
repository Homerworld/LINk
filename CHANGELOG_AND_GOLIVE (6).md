import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card, Badge, Empty } from '../../components/ui';
import { Colors, Spacing, naira } from '../../constants/theme';
import { offerAPI } from '../../services/api';
import { useAuth } from '../../store/auth';

export default function OffersScreen({ navigation }: any) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setOffers(await offerAPI.mine()); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusColor: any = { pending: 'yellow', countered: 'yellow', accepted: 'green', rejected: 'red', expired: 'gray' };

  return (
    <SafeAreaView style={s.c}>
      <Text style={s.h}>Offers</Text>
      <FlatList
        data={offers}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        renderItem={({ item }) => {
          const amt = item.status === 'countered' ? item.vendorAmount : (item.finalAmount || item.customerAmount);
          const other = user?.id === item.customerId ? item.vendorName : item.customerName;
          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Negotiation', { offerId: item.id })}>
              <Card>
                <View style={s.row}>
                  <Text style={s.service}>{item.serviceName}</Text>
                  <Badge text={item.status} color={statusColor[item.status]} />
                </View>
                <Text style={s.other}>with {other}</Text>
                <Text style={s.amt}>{naira(amt)}</Text>
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Empty title="No offers yet" subtitle="When you make or receive an offer, it shows up here." />}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  h: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary, paddingHorizontal: Spacing.base, paddingTop: Spacing.base },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  service: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  other: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  amt: { fontSize: 18, fontWeight: '800', color: Colors.primary, marginTop: 6 },
});
