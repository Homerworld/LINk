import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Keyboard, Image, Animated
} from 'react-native';
import { useSelector } from 'react-redux';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { searchAPI } from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { formatNaira, formatDistance } from '../../utils/helpers';

const DEBOUNCE_MS = 300;

export default function HomeScreen({ navigation }: any) {
  const { user } = useSelector((s: any) => s.auth);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Chip filters
  const [filters, setFilters] = useState({
    available_now: false,
    verified_only: false,
    top_rated: false,
    max_distance_km: 20,
  });

  const debounceTimer = useRef<any>(null);
  const inputRef = useRef<TextInput>(null);

  // Get GPS location on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission is required to find nearby vendors.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation(loc.coords);
    })();
  }, []);

  // Debounced autocomplete
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (query.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }

    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await searchAPI.autocomplete(query);
        setSuggestions(res.data.data);
        setShowSuggestions(true);
      } catch { setSuggestions([]); }
    }, DEBOUNCE_MS);
  }, [query]);

  const selectService = useCallback(async (service: any) => {
    setSelectedService(service);
    setQuery(service.name);
    setSuggestions([]);
    setShowSuggestions(false);
    Keyboard.dismiss();
    await fetchVendors(service.id, filters);
  }, [filters, location]);

  const fetchVendors = async (serviceId: string, activeFilters: any) => {
    if (!location) { setLocationError('Waiting for your location...'); return; }
    setLoading(true);
    try {
      const res = await searchAPI.searchVendors({
        service_id: serviceId,
        lat: location.latitude,
        lng: location.longitude,
        ...activeFilters,
      });
      setVendors(res.data.data.vendors);
    } catch (err) {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFilter = async (key: string) => {
    const newFilters = { ...filters, [key]: !filters[key as keyof typeof filters] };
    setFilters(newFilters as any);
    if (selectedService) await fetchVendors(selectedService.id, newFilters);
  };

  const renderChip = (label: string, key: string, icon: string) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, (filters as any)[key] && styles.chipActive]}
      onPress={() => toggleFilter(key)}
    >
      <Ionicons name={icon as any} size={13} color={(filters as any)[key] ? Colors.primary : Colors.textSecondary} />
      <Text style={[styles.chipText, (filters as any)[key] && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderVendorCard = ({ item: vendor }: any) => (
    <TouchableOpacity
      style={styles.vendorCard}
      onPress={() => navigation.navigate('VendorProfile', { vendorId: vendor.id, lat: location?.latitude, lng: location?.longitude })}
      activeOpacity={0.9}
    >
      <Image
        source={{ uri: vendor.cover_image || 'https://via.placeholder.com/80' }}
        style={styles.vendorImage}
      />
      <View style={styles.vendorInfo}>
        <View style={styles.vendorHeader}>
          <Text style={styles.vendorName} numberOfLines={1}>{vendor.business_name || vendor.full_name}</Text>
          {vendor.is_verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.verified} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          )}
        </View>

        <View style={styles.vendorMeta}>
          <Ionicons name="location-outline" size={12} color={Colors.textTertiary} />
          <Text style={styles.vendorDistance}>{formatDistance(vendor.distance_km)}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Ionicons name="star" size={12} color={Colors.accent} />
          <Text style={styles.vendorRating}>{vendor.avg_rating ? parseFloat(vendor.avg_rating).toFixed(1) : 'New'}</Text>
          {vendor.total_reviews > 0 && <Text style={styles.reviewCount}>({vendor.total_reviews})</Text>}
        </View>

        {/* Service tags */}
        <View style={styles.tagRow}>
          {(vendor.service_tags || []).slice(0, 3).map((tag: string, i: number) => (
            <View key={i} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.vendorPrice}>
          {vendor.price_negotiable && !vendor.price_min
            ? 'Negotiable'
            : vendor.price_min
            ? `From ${formatNaira(vendor.price_min)}`
            : 'Price on request'}
        </Text>
      </View>

      <View style={styles.cardAction}>
        {vendor.is_available_now && (
          <View style={styles.availableDot} />
        )}
        <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="What service do you need?"
            placeholderTextColor={Colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            onFocus={() => query.length > 0 && setShowSuggestions(true)}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); setSelectedService(null); setVendors([]); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.dropdown}>
            {suggestions.map((s) => (
              <TouchableOpacity key={s.id} style={styles.dropdownItem} onPress={() => selectService(s)}>
                <Ionicons name="flash-outline" size={16} color={Colors.primary} />
                <Text style={styles.dropdownText}>{s.name}</Text>
                <Text style={styles.dropdownCategory}>{s.category}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Chip filters */}
      {selectedService && (
        <View style={styles.chipRow}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[
              { label: 'Available Now', key: 'available_now', icon: 'time-outline' },
              { label: 'Verified Only', key: 'verified_only', icon: 'shield-checkmark-outline' },
              { label: 'Top Rated', key: 'top_rated', icon: 'star-outline' },
            ]}
            renderItem={({ item }) => renderChip(item.label, item.key, item.icon)}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.chipList}
          />
        </View>
      )}

      {/* Location error */}
      {locationError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="location-outline" size={16} color={Colors.danger} />
          <Text style={styles.errorText}>{locationError}</Text>
        </View>
      ) : null}

      {/* Results */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Finding vendors near you...</Text>
        </View>
      ) : selectedService ? (
        <FlatList
          data={vendors}
          renderItem={renderVendorCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.resultsHeader}>
              {vendors.length} {selectedService.name}s near you
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No vendors found</Text>
              <Text style={styles.emptySubtitle}>Try expanding your distance or removing filters.</Text>
            </View>
          }
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.greeting}>Good morning, {user?.full_name?.split(' ')[0]} 👋</Text>
          <Text style={styles.placeholderText}>Search for any service above to find verified vendors near you.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchContainer: { backgroundColor: Colors.surface, paddingHorizontal: Spacing.base, paddingTop: 56, paddingBottom: Spacing.base, zIndex: 100 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, height: 48, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, height: '100%' },
  dropdown: { position: 'absolute', top: 112, left: Spacing.base, right: Spacing.base, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, ...Shadows.lg, zIndex: 200, borderWidth: 1, borderColor: Colors.border },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: Spacing.sm },
  dropdownText: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary, fontWeight: '500' },
  dropdownCategory: { fontSize: Typography.sm, color: Colors.textTertiary },
  chipRow: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  chipList: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  chipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chipText: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: Colors.primary },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dangerLight, margin: Spacing.base, padding: Spacing.md, borderRadius: BorderRadius.md, gap: Spacing.sm },
  errorText: { flex: 1, fontSize: Typography.sm, color: Colors.danger },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.base },
  loadingText: { fontSize: Typography.base, color: Colors.textSecondary },
  listContent: { paddingHorizontal: Spacing.base, paddingBottom: 100 },
  resultsHeader: { fontSize: Typography.sm, color: Colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.base, marginBottom: Spacing.sm },
  vendorCard: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadows.sm, borderWidth: 1, borderColor: Colors.borderLight },
  vendorImage: { width: 72, height: 72, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceAlt },
  vendorInfo: { flex: 1, marginLeft: Spacing.md, gap: 4 },
  vendorHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  vendorName: { flex: 1, fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  verifiedText: { fontSize: 11, color: Colors.verified, fontWeight: '600' },
  vendorMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vendorDistance: { fontSize: Typography.sm, color: Colors.textSecondary },
  metaDot: { color: Colors.textTertiary, fontSize: Typography.sm },
  vendorRating: { fontSize: Typography.sm, color: Colors.textPrimary, fontWeight: '600' },
  reviewCount: { fontSize: Typography.sm, color: Colors.textTertiary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tag: { backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 11, color: Colors.primary, fontWeight: '500' },
  vendorPrice: { fontSize: Typography.sm, color: Colors.textSecondary, marginTop: 2 },
  cardAction: { justifyContent: 'center', alignItems: 'center', gap: 6, paddingLeft: Spacing.sm },
  availableDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyTitle: { fontSize: Typography.lg, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: Spacing.xl },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xxxl },
  greeting: { fontSize: Typography.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  placeholderText: { fontSize: Typography.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
});
