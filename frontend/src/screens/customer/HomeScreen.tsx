import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Badge, Empty } from '../../components/ui';
import { Colors, Spacing, Radius, naira } from '../../constants/theme';
import { searchAPI } from '../../services/api';

export default function HomeScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchAPI.autocomplete(query.trim());
        if (!cancelled) setSuggestions(r);
      } catch {}
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  const runSearch = useCallback(async (serviceName: string) => {
    setActiveService(serviceName);
    setQuery(serviceName);
    setSuggestions([]);
    setLoading(true);
    try {
      const r = await searchAPI.vendors({ service: serviceName, limit: 30 });
      setVendors(r);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <SafeAreaView style={s.c}>
      <View style={s.header}>
        <Text style={s.logo}>Link</Text>
        <Text style={s.sub}>What do you need done?</Text>
        <View style={s.searchRow}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <TextInput
            style={s.searchInput}
            placeholder="Search a service e.g. Plumber"
            placeholderTextColor={Colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => query.trim() && runSearch(query.trim())}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); setVendors([]); setActiveService(null); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        {suggestions.length > 0 && (
          <Card style={s.suggestions}>
            {suggestions.map((item) => (
              <TouchableOpacity key={item.id || item.name} style={s.suggestion} onPress={() => runSearch(item.name)}>
                <Text style={s.sugName}>{item.name}</Text>
                <Text style={s.sugCat}>{item.category}</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={Colors.primary} />
      ) : activeService && vendors.length === 0 ? (
        <Empty title={`No "${activeService}" vendors near you yet`} subtitle="Try another service, or check back soon as more vendors join." />
      ) : (
        <FlatList
          data={vendors}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md }}
          ListHeaderComponent={activeService ? <Text style={s.resultsLabel}>{vendors.length} vendor{vendors.length === 1 ? '' : 's'} found</Text> : null}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('VendorProfile', { vendorId: item.id })}>
              <Card>
                <View style={s.cardTop}>
                  <Text style={s.vName}>{item.fullName}</Text>
                  {item.avgRating > 0 && (
                    <View style={s.rating}>
                      <Ionicons name="star" size={13} color={Colors.accent} />
                      <Text style={s.ratingTxt}>{Number(item.avgRating).toFixed(1)}</Text>
                    </View>
                  )}
                </View>
                {item.locationArea ? <Text style={s.area}>{item.locationArea}</Text> : null}
                <View style={s.tags}>
                  {(item.services || []).slice(0, 4).map((sv: string) => <Badge key={sv} text={sv} color="indigo" />)}
                </View>
                {(item.priceMin || item.priceMax) ? (
                  <Text style={s.price}>
                    {item.priceMin ? naira(item.priceMin) : ''}{item.priceMin && item.priceMax ? ' – ' : ''}{item.priceMax ? naira(item.priceMax) : ''}
                    {item.priceNegotiable ? '  · negotiable' : ''}
                  </Text>
                ) : null}
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={!activeService ? (
            <Empty title="Search to get started" subtitle="Type a service above — like Plumber, Tailor, or Hair Braiding — to see vendors near you." />
          ) : null}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingTop: Spacing.lg, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl },
  logo: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  sub: { fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 2, marginBottom: Spacing.base },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: Radius.md, paddingHorizontal: Spacing.base, height: 50 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  suggestions: { marginTop: Spacing.sm, padding: 0, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  sugName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  sugCat: { fontSize: 12, color: Colors.textTertiary },
  resultsLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4, fontWeight: '600' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vName: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingTxt: { fontSize: 14, fontWeight: '700', color: Colors.accent },
  area: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  price: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginTop: Spacing.sm },
});
