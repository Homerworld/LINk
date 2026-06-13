import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Field, Card, Badge } from '../../components/ui';
import { Colors, Spacing, naira } from '../../constants/theme';
import { searchAPI, offerAPI } from '../../services/api';

export default function VendorProfileScreen({ route, navigation }: any) {
  const { vendorId } = route.params;
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showOffer, setShowOffer] = useState(false);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [service, setService] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await searchAPI.vendor(vendorId);
        setVendor(v);
        setService((v.services || [])[0] || 'Service');
      } catch (e: any) {
        Alert.alert('Error', e.message);
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [vendorId]);

  const sendOffer = async () => {
    const naue = parseInt(amount, 10);
    if (!naue || naue < 100) return Alert.alert('Enter amount', 'Enter a valid amount in Naira (min ₦100).');
    setSending(true);
    try {
      const offer = await offerAPI.create({
        vendorId,
        serviceName: service,
        description: desc.trim() || undefined,
        amount: naue * 100, // kobo
      });
      setShowOffer(false);
      setAmount(''); setDesc('');
      navigation.navigate('Negotiation', { offerId: offer.id });
    } catch (e: any) {
      Alert.alert('Could not send offer', e.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <SafeAreaView style={s.c}><ActivityIndicator style={{ marginTop: 60 }} size="large" color={Colors.primary} /></SafeAreaView>;
  if (!vendor) return null;

  return (
    <SafeAreaView style={s.c}>
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={s.topTitle}>Vendor</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.base }}>
        <Card>
          <View style={s.row}>
            <View style={s.avatar}><Text style={s.avatarTxt}>{vendor.fullName?.[0]?.toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{vendor.fullName}</Text>
              {vendor.locationArea ? <Text style={s.area}>{vendor.locationArea}</Text> : null}
              <View style={s.statsRow}>
                {vendor.avgRating > 0 && <Text style={s.stat}>★ {Number(vendor.avgRating).toFixed(1)} ({vendor.totalReviews || 0})</Text>}
                <Text style={s.stat}>{vendor.totalJobs || 0} jobs done</Text>
              </View>
            </View>
          </View>
          <View style={s.tags}>
            {(vendor.services || []).map((sv: string) => <Badge key={sv} text={sv} color="indigo" />)}
          </View>
          {(vendor.priceMin || vendor.priceMax) ? (
            <Text style={s.price}>
              Typical: {vendor.priceMin ? naira(vendor.priceMin) : ''}{vendor.priceMin && vendor.priceMax ? ' – ' : ''}{vendor.priceMax ? naira(vendor.priceMax) : ''}
            </Text>
          ) : null}
          {vendor.availabilityText ? <Text style={s.avail}>{vendor.availabilityText}</Text> : null}
        </Card>

        <Button title="Make an offer" onPress={() => setShowOffer(true)} />
        <Text style={s.note}>You propose a price. The vendor can accept, decline, or counter — up to 3 rounds. No payment until you both agree.</Text>
      </ScrollView>

      <Modal visible={showOffer} transparent animationType="slide" onRequestClose={() => setShowOffer(false)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Make an offer</Text>
            <Text style={s.modalSub}>to {vendor.fullName} for {service}</Text>
            <View style={{ gap: Spacing.base, marginTop: Spacing.base }}>
              <Field label="Your offer (₦)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="e.g. 15000" />
              <Field label="Describe the job (optional)" value={desc} onChangeText={setDesc} placeholder="What do you need done?" multiline />
              <Button title="Send offer" onPress={sendOffer} loading={sending} />
              <Button title="Cancel" variant="ghost" onPress={() => setShowOffer(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  topTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  row: { flexDirection: 'row', gap: Spacing.base },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 24, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  area: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: Spacing.base, marginTop: 6 },
  stat: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.base },
  price: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginTop: Spacing.base },
  avail: { fontSize: 14, color: Colors.textSecondary, marginTop: 6 },
  note: { fontSize: 13, color: Colors.textTertiary, lineHeight: 20, textAlign: 'center', paddingHorizontal: Spacing.base },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.base },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
});
