import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Image, FlatList
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { kycAPI, searchAPI, paymentsAPI } from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

const TOTAL_STEPS = 8;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ID_TYPES = [
  { key: 'nin', label: 'NIN', icon: 'card-outline' },
  { key: 'voters_card', label: "Voter's Card", icon: 'people-outline' },
  { key: 'passport', label: 'Passport', icon: 'airplane-outline' },
  { key: 'drivers_licence', label: "Driver's Licence", icon: 'car-outline' },
];

export default function VendorKYCScreen({ navigation }: any) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step data
  const [idType, setIdType] = useState('');
  const [bvn, setBvn] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [idDocUri, setIdDocUri] = useState('');
  const [selfieUri, setSelfieUri] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [allServices, setAllServices] = useState<any[]>([]);
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [locationArea, setLocationArea] = useState('');
  const [locationType, setLocationType] = useState('fixed');
  const [availabilityText, setAvailabilityText] = useState('');
  const [availableDays, setAvailableDays] = useState([1, 2, 3, 4, 5, 6]);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [priceNegotiable, setPriceNegotiable] = useState(true);
  const [banks, setBanks] = useState<any[]>([]);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [serviceQuery, setServiceQuery] = useState('');

  useEffect(() => {
    loadServices();
    loadBanks();
  }, []);

  const loadServices = async () => {
    try {
      const res = await searchAPI.getServices();
      setAllServices(res.data.data);
    } catch { }
  };

  const loadBanks = async () => {
    try {
      const res = await paymentsAPI.getBanks();
      setBanks(res.data.data);
    } catch { }
  };

  const progress = (step / TOTAL_STEPS) * 100;

  const pickImage = async (type: 'id' | 'selfie' | 'portfolio') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: type === 'portfolio',
    });
    if (result.canceled) return;

    if (type === 'portfolio') {
      const newImages = result.assets.map(a => a.uri);
      if (portfolioImages.length + newImages.length > 4) {
        Alert.alert('Limit', 'Maximum 4 portfolio images'); return;
      }
      setPortfolioImages([...portfolioImages, ...newImages]);
    } else if (type === 'id') {
      setIdDocUri(result.assets[0].uri);
    } else {
      setSelfieUri(result.assets[0].uri);
    }
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission required'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled) setSelfieUri(result.assets[0].uri);
  };

  const uploadFormData = (uri: string, fieldName: string) => {
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'file.jpg';
    formData.append(fieldName, { uri, name: filename, type: 'image/jpeg' } as any);
    return formData;
  };

  const resolveAccount = async () => {
    if (accountNumber.length !== 10 || !bankCode) return;
    setLoading(true);
    try {
      const res = await kycAPI.submitIdentity({ id_type: idType, bvn, bank_code: bankCode, account_number: accountNumber });
      setAccountName(res.data.data.account_name);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Could not verify account');
    } finally { setLoading(false); }
  };

  const nextStep = async () => {
    setLoading(true);
    try {
      if (step === 3) {
        // Upload ID document
        if (!idDocUri) { Alert.alert('Required', 'Please upload your ID document'); return; }
        await kycAPI.uploadIdDocument(uploadFormData(idDocUri, 'file'));
      } else if (step === 4) {
        // Upload selfie
        if (!selfieUri) { Alert.alert('Required', 'Please take a selfie'); return; }
        await kycAPI.uploadSelfie(uploadFormData(selfieUri, 'file'));
      } else if (step === 5) {
        // Submit services
        if (selectedServices.length === 0) { Alert.alert('Required', 'Select at least one service'); return; }
        await kycAPI.addServices(selectedServices);
      } else if (step === 6) {
        // Upload portfolio
        if (portfolioImages.length === 0) { Alert.alert('Required', 'Upload at least one portfolio image'); return; }
        const formData = new FormData();
        portfolioImages.forEach((uri, i) => {
          formData.append('files', { uri, name: `portfolio_${i}.jpg`, type: 'image/jpeg' } as any);
        });
        await kycAPI.uploadPortfolio(formData);
      } else if (step === 7) {
        // Location and availability
        if (!locationArea) { Alert.alert('Required', 'Enter your service area'); return; }
        await kycAPI.updateLocation({
          location_type: locationType,
          location_area: locationArea,
          availability_text: availabilityText,
          available_days: availableDays,
          price_min: priceMin ? Math.round(parseFloat(priceMin) * 100) : null,
          price_max: priceMax ? Math.round(parseFloat(priceMax) * 100) : null,
          price_negotiable: priceNegotiable,
        });
      } else if (step === 8) {
        // Submit for review
        await kycAPI.submit();
        navigation.replace('KYCSubmitted');
        return;
      }

      setStep(step + 1);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const filteredServices = allServices.filter(s =>
    s.name.toLowerCase().includes(serviceQuery.toLowerCase())
  );

  const toggleDay = (day: number) => {
    if (availableDays.includes(day)) {
      setAvailableDays(availableDays.filter(d => d !== day));
    } else {
      setAvailableDays([...availableDays, day]);
    }
  };

  const toggleService = (id: string) => {
    if (selectedServices.includes(id)) {
      setSelectedServices(selectedServices.filter(s => s !== id));
    } else if (selectedServices.length < 4) {
      setSelectedServices([...selectedServices, id]);
    } else {
      Alert.alert('Limit', 'Maximum 4 service tags. Jack of all trades, master of none!');
    }
  };

  const renderStep = () => {
    switch (step) {
      // Step 1 — ID type selection
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Choose your ID type</Text>
            <Text style={styles.stepSubtitle}>We use this to verify your identity.</Text>
            {ID_TYPES.map(item => (
              <TouchableOpacity
                key={item.key}
                style={[styles.optionCard, idType === item.key && styles.optionCardSelected]}
                onPress={() => setIdType(item.key)}
              >
                <Ionicons name={item.icon as any} size={24} color={idType === item.key ? Colors.primary : Colors.textSecondary} />
                <Text style={[styles.optionLabel, idType === item.key && styles.optionLabelSelected]}>{item.label}</Text>
                {idType === item.key && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        );

      // Step 2 — BVN + Bank account
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Financial verification</Text>
            <Text style={styles.stepSubtitle}>Your BVN and bank account are required for withdrawals.</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>BVN (Bank Verification Number)</Text>
              <TextInput style={styles.input} placeholder="11-digit BVN" keyboardType="numeric"
                maxLength={11} value={bvn} onChangeText={setBvn} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank</Text>
              <TouchableOpacity style={styles.bankSelector} onPress={() => setShowBankPicker(true)}>
                <Text style={[styles.bankSelectorText, bankName && styles.bankSelectorTextSelected]}>
                  {bankName || 'Select your bank'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {showBankPicker && (
              <View style={styles.bankList}>
                {banks.slice(0, 30).map((bank: any) => (
                  <TouchableOpacity key={bank.code} style={styles.bankItem}
                    onPress={() => { setBankCode(bank.code); setBankName(bank.name); setShowBankPicker(false); }}>
                    <Text style={styles.bankItemText}>{bank.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account number</Text>
              <View style={styles.accountRow}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="10-digit account number"
                  keyboardType="numeric" maxLength={10} value={accountNumber} onChangeText={setAccountNumber} />
                <TouchableOpacity style={styles.verifyBtn} onPress={resolveAccount} disabled={loading || accountNumber.length !== 10}>
                  {loading ? <ActivityIndicator size="small" color={Colors.textInverse} /> : <Text style={styles.verifyBtnText}>Verify</Text>}
                </TouchableOpacity>
              </View>
            </View>

            {accountName ? (
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.successText}>{accountName}</Text>
              </View>
            ) : null}
          </View>
        );

      // Step 3 — Upload ID document
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Upload your ID</Text>
            <Text style={styles.stepSubtitle}>Take a clear photo of your {ID_TYPES.find(t => t.key === idType)?.label}.</Text>
            <TouchableOpacity style={styles.uploadArea} onPress={() => pickImage('id')}>
              {idDocUri ? (
                <Image source={{ uri: idDocUri }} style={styles.uploadPreview} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={48} color={Colors.textTertiary} />
                  <Text style={styles.uploadText}>Tap to upload ID document</Text>
                  <Text style={styles.uploadHint}>Clear photo, all corners visible</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        );

      // Step 4 — Live selfie
      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Take a selfie</Text>
            <Text style={styles.stepSubtitle}>Must be taken now — not a gallery photo. Look directly at the camera.</Text>
            <TouchableOpacity style={styles.uploadArea} onPress={launchCamera}>
              {selfieUri ? (
                <Image source={{ uri: selfieUri }} style={styles.selfiePreview} />
              ) : (
                <>
                  <Ionicons name="camera" size={64} color={Colors.primary} />
                  <Text style={styles.uploadText}>Tap to take selfie</Text>
                  <Text style={styles.uploadHint}>Opens camera directly</Text>
                </>
              )}
            </TouchableOpacity>
            {selfieUri && (
              <TouchableOpacity style={styles.retakeBtn} onPress={launchCamera}>
                <Ionicons name="refresh" size={16} color={Colors.primary} />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      // Step 5 — Service tags
      case 5:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What services do you offer?</Text>
            <Text style={styles.stepSubtitle}>Select up to 4. These appear as tags on your profile.</Text>

            <View style={styles.selectedTags}>
              {selectedServices.map(id => {
                const s = allServices.find(sv => sv.id === id);
                return s ? (
                  <TouchableOpacity key={id} style={styles.selectedTag} onPress={() => toggleService(id)}>
                    <Text style={styles.selectedTagText}>{s.name}</Text>
                    <Ionicons name="close" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                ) : null;
              })}
              {selectedServices.length === 0 && (
                <Text style={styles.noTagsText}>No services selected yet</Text>
              )}
            </View>

            <TextInput style={styles.input} placeholder="Search services..."
              value={serviceQuery} onChangeText={setServiceQuery} />

            <ScrollView style={styles.serviceList} nestedScrollEnabled>
              {filteredServices.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.serviceItem, selectedServices.includes(s.id) && styles.serviceItemSelected]}
                  onPress={() => toggleService(s.id)}
                >
                  <Text style={[styles.serviceItemText, selectedServices.includes(s.id) && styles.serviceItemTextSelected]}>
                    {s.name}
                  </Text>
                  <Text style={styles.serviceCategory}>{s.category}</Text>
                  {selectedServices.includes(s.id) && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        );

      // Step 6 — Portfolio images
      case 6:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Show your work</Text>
            <Text style={styles.stepSubtitle}>Upload 3–4 photos of your best work. The first photo is your cover image.</Text>

            <View style={styles.portfolioGrid}>
              {portfolioImages.map((uri, i) => (
                <View key={i} style={styles.portfolioItem}>
                  <Image source={{ uri }} style={styles.portfolioImage} />
                  {i === 0 && <View style={styles.coverBadge}><Text style={styles.coverBadgeText}>Cover</Text></View>}
                  <TouchableOpacity style={styles.removeImg}
                    onPress={() => setPortfolioImages(portfolioImages.filter((_, idx) => idx !== i))}>
                    <Ionicons name="close-circle" size={22} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {portfolioImages.length < 4 && (
                <TouchableOpacity style={styles.addImageBtn} onPress={() => pickImage('portfolio')}>
                  <Ionicons name="add" size={32} color={Colors.textTertiary} />
                  <Text style={styles.addImageText}>{portfolioImages.length === 0 ? 'Add photos' : 'Add more'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );

      // Step 7 — Location + pricing
      case 7:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Location & pricing</Text>
            <Text style={styles.stepSubtitle}>This helps customers find and book you.</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Service area</Text>
              <TextInput style={styles.input} placeholder="e.g. Lekki, Lagos"
                value={locationArea} onChangeText={setLocationArea} />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Service type</Text>
              <View style={styles.toggleRow}>
                {[{ k: 'fixed', l: 'Fixed location' }, { k: 'mobile', l: 'I travel to customers' }, { k: 'both', l: 'Both' }].map(opt => (
                  <TouchableOpacity key={opt.k}
                    style={[styles.toggleBtn, locationType === opt.k && styles.toggleBtnActive]}
                    onPress={() => setLocationType(opt.k)}>
                    <Text style={[styles.toggleBtnText, locationType === opt.k && styles.toggleBtnTextActive]}>{opt.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Available days</Text>
              <View style={styles.daysRow}>
                {DAYS.map((d, i) => (
                  <TouchableOpacity key={i}
                    style={[styles.dayBtn, availableDays.includes(i) && styles.dayBtnActive]}
                    onPress={() => toggleDay(i)}>
                    <Text style={[styles.dayBtnText, availableDays.includes(i) && styles.dayBtnTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Availability description (optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. Mon-Sat, 8am-6pm"
                value={availabilityText} onChangeText={setAvailabilityText} />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Price range</Text>
                <TouchableOpacity style={styles.negotiableToggle} onPress={() => setPriceNegotiable(!priceNegotiable)}>
                  <Ionicons name={priceNegotiable ? 'checkbox' : 'square-outline'} size={18} color={Colors.primary} />
                  <Text style={styles.negotiableText}>Negotiable</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.priceRow}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Min ₦"
                  keyboardType="numeric" value={priceMin} onChangeText={setPriceMin} />
                <Text style={styles.priceDash}>—</Text>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Max ₦"
                  keyboardType="numeric" value={priceMax} onChangeText={setPriceMax} />
              </View>
            </View>
          </View>
        );

      // Step 8 — Bank details confirm + submit
      case 8:
        return (
          <View style={styles.stepContent}>
            <View style={styles.readyIcon}>
              <Ionicons name="shield-checkmark" size={64} color={Colors.primary} />
            </View>
            <Text style={styles.stepTitle}>Ready to submit</Text>
            <Text style={styles.stepSubtitle}>We'll review your profile within 24–48 hours. You'll get a notification when approved.</Text>

            <View style={styles.summaryCard}>
              {[
                { label: 'Identity document', done: !!idDocUri },
                { label: 'Selfie verification', done: !!selfieUri },
                { label: 'BVN verified', done: !!bvn },
                { label: 'Bank account', done: !!accountName },
                { label: 'Service tags', done: selectedServices.length > 0 },
                { label: 'Portfolio images', done: portfolioImages.length > 0 },
                { label: 'Location & pricing', done: !!locationArea },
              ].map(item => (
                <View key={item.label} style={styles.summaryRow}>
                  <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={18}
                    color={item.done ? Colors.success : Colors.textTertiary} />
                  <Text style={[styles.summaryText, !item.done && styles.summaryTextMuted]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        );

      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <View style={styles.stepHeader}>
        <Text style={styles.stepCount}>Step {step} of {TOTAL_STEPS}</Text>
        <Text style={styles.stepHint}>
          {['Choose ID type', 'Bank verification', 'Upload ID', 'Selfie', 'Services', 'Portfolio', 'Location', 'Review'][step - 1]}
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {renderStep()}
      </ScrollView>

      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
            <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.nextBtn} onPress={nextStep} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.textInverse} /> : (
            <Text style={styles.nextBtnText}>{step === TOTAL_STEPS ? 'Submit for Review' : 'Continue'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  progressBar: { height: 4, backgroundColor: Colors.border },
  progressFill: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  stepHeader: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.base, paddingBottom: Spacing.sm },
  stepCount: { fontSize: Typography.sm, color: Colors.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepHint: { fontSize: Typography.lg, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.xl, paddingBottom: 40 },
  stepContent: { gap: Spacing.base },
  stepTitle: { fontSize: Typography.xl, fontWeight: '800', color: Colors.textPrimary },
  stepSubtitle: { fontSize: Typography.base, color: Colors.textSecondary, lineHeight: 22, marginTop: -Spacing.sm },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, padding: Spacing.base, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border },
  optionCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  optionLabel: { flex: 1, fontSize: Typography.base, fontWeight: '500', color: Colors.textSecondary },
  optionLabelSelected: { color: Colors.primary, fontWeight: '700' },
  inputGroup: { gap: Spacing.sm },
  label: { fontSize: Typography.sm, fontWeight: '600', color: Colors.textSecondary },
  input: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.base, height: 52, fontSize: Typography.base, color: Colors.textPrimary },
  bankSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.base, height: 52 },
  bankSelectorText: { fontSize: Typography.base, color: Colors.textTertiary },
  bankSelectorTextSelected: { color: Colors.textPrimary },
  bankList: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, maxHeight: 200, overflow: 'hidden' },
  bankItem: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  bankItemText: { fontSize: Typography.base, color: Colors.textPrimary },
  accountRow: { flexDirection: 'row', gap: Spacing.sm },
  verifyBtn: { height: 52, paddingHorizontal: Spacing.base, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.lg },
  verifyBtnText: { fontSize: Typography.sm, fontWeight: '700', color: Colors.textInverse },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.successLight, padding: Spacing.md, borderRadius: BorderRadius.md },
  successText: { fontSize: Typography.base, color: Colors.success, fontWeight: '600' },
  uploadArea: { height: 200, borderRadius: BorderRadius.xl, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surfaceAlt, gap: Spacing.sm, overflow: 'hidden' },
  uploadPreview: { width: '100%', height: '100%', borderRadius: BorderRadius.xl },
  selfiePreview: { width: 180, height: 180, borderRadius: 90 },
  uploadText: { fontSize: Typography.base, fontWeight: '600', color: Colors.textSecondary },
  uploadHint: { fontSize: Typography.sm, color: Colors.textTertiary },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  retakeBtnText: { fontSize: Typography.base, color: Colors.primary, fontWeight: '600' },
  selectedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, minHeight: 40 },
  selectedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary },
  selectedTagText: { fontSize: Typography.sm, color: Colors.primary, fontWeight: '600' },
  noTagsText: { fontSize: Typography.sm, color: Colors.textTertiary, fontStyle: 'italic' },
  serviceList: { maxHeight: 280 },
  serviceItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  serviceItemSelected: { backgroundColor: Colors.primaryLight },
  serviceItemText: { flex: 1, fontSize: Typography.base, color: Colors.textPrimary },
  serviceItemTextSelected: { color: Colors.primary, fontWeight: '600' },
  serviceCategory: { fontSize: Typography.sm, color: Colors.textTertiary, marginRight: Spacing.sm },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  portfolioItem: { width: '48%', aspectRatio: 1, borderRadius: BorderRadius.lg, overflow: 'hidden', position: 'relative' },
  portfolioImage: { width: '100%', height: '100%' },
  coverBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: Colors.primary, borderRadius: BorderRadius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  coverBadgeText: { fontSize: 10, color: Colors.textInverse, fontWeight: '700' },
  removeImg: { position: 'absolute', top: 4, right: 4 },
  addImageBtn: { width: '48%', aspectRatio: 1, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surfaceAlt, gap: 4 },
  addImageText: { fontSize: Typography.sm, color: Colors.textTertiary },
  toggleRow: { gap: Spacing.sm },
  toggleBtn: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  toggleBtnActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  toggleBtnText: { fontSize: Typography.base, color: Colors.textSecondary, fontWeight: '500' },
  toggleBtnTextActive: { color: Colors.primary, fontWeight: '700' },
  daysRow: { flexDirection: 'row', gap: Spacing.sm },
  dayBtn: { flex: 1, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  dayBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayBtnText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  dayBtnTextActive: { color: Colors.textInverse },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  negotiableToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  negotiableText: { fontSize: Typography.sm, color: Colors.primary, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  priceDash: { fontSize: Typography.base, color: Colors.textTertiary, fontWeight: '600' },
  readyIcon: { alignItems: 'center', paddingVertical: Spacing.xl },
  summaryCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryText: { fontSize: Typography.base, color: Colors.textPrimary },
  summaryTextMuted: { color: Colors.textTertiary },
  footer: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.base, paddingBottom: 34, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  backBtn: { width: 52, height: 52, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border },
  nextBtn: { flex: 1, height: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: BorderRadius.md },
  nextBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
});
