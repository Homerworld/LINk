import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { searchAPI } from '../../services/api'
import { Colors, Spacing, BorderRadius } from '../../constants/theme'

export default function HomeScreen({ navigation }: any) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [selectedService, setSelectedService] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return }
    searchAPI.autocomplete(query).then(r => setSuggestions(r.data.data)).catch(() => {})
  }, [query])

  const searchVendors = async (service: any) => {
    setSelectedService(service)
    setSuggestions([])
    setQuery(service.name)
    setLoading(true)
    try {
      const res = await searchAPI.searchVendors({ service: service.name })
      setVendors(res.data.data)
    } catch { }
    setLoading(false)
  }

  return (
    <View style={s.c}>
      <View style={s.header}>
        <Text style={s.logo}>Link</Text>
        <Text style={s.sub}>Find services near you</Text>
        <View style={s.searchBox}>
          <TextInput style={s.searchInput} placeholder="Search for a service..." value={query} onChangeText={setQuery} />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); setVendors([]) }}>
              <Text style={{ color: Colors.textTertiary, padding: 8 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {suggestions.length > 0 && (
          <View style={s.suggestions}>
            {suggestions.map((s: any) => (
              <TouchableOpacity key={s.name} style={s.suggestion} onPress={() => searchVendors(s)}>
                <Text style={s.sugTxt}>{s.name}</Text>
                <Text style={s.sugCat}>{s.category}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} size="large" /> :
        vendors.length === 0 && selectedService ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No vendors found for "{selectedService.name}" in your area yet.</Text>
          </View>
        ) : (
          <FlatList data={vendors} keyExtractor={i => i.id} contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.card} onPress={() => navigation.navigate('VendorProfile', { vendorId: item.id })}>
                <View style={s.cardTop}>
                  <Text style={s.vendorName}>{item.full_name}</Text>
                  {item.avg_rating > 0 && <Text style={s.rating}>★ {parseFloat(item.avg_rating).toFixed(1)}</Text>}
                </View>
                <Text style={s.area}>{item.location_area || '—'}</Text>
                <Text style={s.services}>{(item.services || []).join(' · ')}</Text>
                {(item.price_min || item.price_max) && (
                  <Text style={s.price}>
                    {item.price_min ? `₦${(item.price_min / 100).toLocaleString()}` : ''}
                    {item.price_min && item.price_max ? ' – ' : ''}
                    {item.price_max ? `₦${(item.price_max / 100).toLocaleString()}` : ''}
                    {item.price_negotiable ? ' (negotiable)' : ''}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          />
        )
      }
    </View>
  )
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20 },
  logo: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2, marginBottom: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, height: 48 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  suggestions: { backgroundColor: '#fff', borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  sugTxt: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  sugCat: { fontSize: 12, color: Colors.textTertiary },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.borderLight, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vendorName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  rating: { fontSize: 14, fontWeight: '700', color: Colors.accent },
  area: { fontSize: 13, color: Colors.textSecondary },
  services: { fontSize: 12, color: Colors.textTertiary },
  price: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTxt: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center' },
})
