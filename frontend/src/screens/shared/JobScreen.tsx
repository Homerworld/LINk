import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { jobsAPI, disputesAPI } from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { formatNaira, formatTimeAgo, formatDate } from '../../utils/helpers';
import { useSelector } from 'react-redux';

export default function JobScreen({ route, navigation }: any) {
  const { jobId } = route.params;
  const { user } = useSelector((s: any) => s.auth);
  const isVendor = user?.role === 'vendor';

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Voice recording
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef<any>(null);

  // Dispute
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeIssue, setDisputeIssue] = useState('');

  useEffect(() => { loadJob(); }, []);

  const loadJob = async () => {
    try {
      const res = await jobsAPI.getJob(jobId);
      setJob(res.data.data);
    } catch { Alert.alert('Error', 'Failed to load job'); }
    finally { setLoading(false); }
  };

  // ── Voice recording ───────────────────────────────────────────
  const startRecording = async () => {
    if (recordingDuration >= 60) {
      Alert.alert('Limit reached', 'Voice notes are limited to 60 seconds.');
      return;
    }
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimer.current = setInterval(() => {
        setRecordingDuration(d => {
          if (d >= 59) { stopRecording(); return d; }
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      Alert.alert('Error', 'Could not start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    clearInterval(recordingTimer.current);
    setIsRecording(false);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        Alert.alert(
          'Send voice note?',
          `Recording: ${recordingDuration}s`,
          [
            { text: 'Discard', style: 'destructive', onPress: () => FileSystem.deleteAsync(uri, { idempotent: true }) },
            { text: 'Send', onPress: () => sendVoiceNote(uri) },
          ]
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const sendVoiceNote = async (uri: string) => {
    // TODO: Upload to backend via multipart form
    Alert.alert('Voice note sent', 'Your voice note has been sent and recorded.');
  };

  // ── Job actions ───────────────────────────────────────────────
  const handleMarkComplete = async () => {
    Alert.alert(
      'Mark job complete?',
      'This will start the 24-hour confirmation window. The customer will have 24 hours to confirm or raise a dispute.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: async () => {
            setActionLoading(true);
            try {
              await jobsAPI.markComplete(jobId);
              await loadJob();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.message || 'Failed');
            } finally { setActionLoading(false); }
          }
        }
      ]
    );
  };

  const handleConfirmComplete = async () => {
    Alert.alert(
      'Confirm job complete?',
      'This will release the payment to your vendor.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm & Release', onPress: async () => {
          setActionLoading(true);
          try {
            await jobsAPI.confirmComplete(jobId);
            await loadJob();
            navigation.navigate('ReviewScreen', { jobId });
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.message || 'Failed');
          } finally { setActionLoading(false); }
        }}
      ]
    );
  };

  const handleRaiseDispute = async () => {
    if (!disputeIssue) { Alert.alert('Select issue type'); return; }
    setActionLoading(true);
    try {
      await disputesAPI.raise(jobId, disputeIssue);
      setShowDisputeModal(false);
      await loadJob();
      navigation.navigate('DisputeScreen', { jobId });
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to raise dispute');
    } finally { setActionLoading(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  if (!job) return <View style={styles.center}><Text>Job not found</Text></View>;

  const otherParty = isVendor ? job.customer_name : job.vendor_name;
  const otherPhoto = isVendor ? job.customer_photo : job.vendor_photo;
  const canCall = job.call_enabled;
  const isActive = job.status === 'in_progress';
  const isPendingConfirm = job.status === 'completed_pending';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{job.service_name}</Text>
        <View style={[styles.statusPill, getStatusStyle(job.status)]}>
          <Text style={[styles.statusText, getStatusTextStyle(job.status)]}>{formatStatus(job.status)}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Job reference card */}
        <View style={styles.refCard}>
          <Text style={styles.refLabel}>Job reference</Text>
          <Text style={styles.refValue}>{job.reference}</Text>
        </View>

        {/* Other party */}
        <View style={styles.partyCard}>
          <Image source={{ uri: otherPhoto || 'https://via.placeholder.com/48' }} style={styles.partyPhoto} />
          <View style={styles.partyInfo}>
            <Text style={styles.partyName}>{otherParty}</Text>
            <Text style={styles.partyRole}>{isVendor ? 'Customer' : 'Vendor'}</Text>
          </View>
          {canCall && (
            <TouchableOpacity style={styles.callBtn}>
              <Ionicons name="call" size={20} color={Colors.textInverse} />
            </TouchableOpacity>
          )}
        </View>

        {/* Financial summary */}
        <View style={styles.finCard}>
          <View style={styles.finRow}>
            <Text style={styles.finLabel}>Agreed amount</Text>
            <Text style={styles.finValue}>{formatNaira(job.agreed_amount)}</Text>
          </View>
          {isVendor && (
            <>
              <View style={styles.finDivider} />
              <View style={styles.finRow}>
                <Text style={styles.finLabel}>Platform fee (10%)</Text>
                <Text style={styles.finNegative}>-{formatNaira(job.platform_fee)}</Text>
              </View>
              <View style={styles.finRow}>
                <Text style={[styles.finLabel, { fontWeight: '700' }]}>You receive</Text>
                <Text style={[styles.finValue, { color: Colors.success }]}>{formatNaira(job.vendor_payout)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Escrow lock indicator */}
        <View style={styles.escrowCard}>
          <Ionicons name="lock-closed" size={16} color={Colors.escrow} />
          <Text style={styles.escrowText}>
            {formatNaira(job.vendor_payout)} secured in escrow
          </Text>
        </View>

        {/* 24hr deadline */}
        {isPendingConfirm && job.completion_deadline && (
          <View style={styles.deadlineCard}>
            <Ionicons name="time-outline" size={16} color={Colors.warning} />
            <Text style={styles.deadlineText}>
              {isVendor
                ? `Payment auto-releases: ${formatDate(job.completion_deadline)}`
                : `Confirm or dispute by: ${formatDate(job.completion_deadline)}`}
            </Text>
          </View>
        )}

        {/* Voice note recorder */}
        {canCall && (
          <View style={styles.commCard}>
            <Text style={styles.commTitle}>Communication</Text>
            <Text style={styles.commNote}>All calls and voice notes are recorded as contract evidence.</Text>

            <TouchableOpacity
              style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <Ionicons name={isRecording ? 'stop-circle' : 'mic'} size={22} color={isRecording ? Colors.danger : Colors.primary} />
              <Text style={[styles.recordBtnText, isRecording && styles.recordBtnTextActive]}>
                {isRecording ? `Recording... ${recordingDuration}s (tap to stop)` : 'Record voice note (60s max)'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View style={styles.actionBar}>
        {isVendor && isActive && (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleMarkComplete} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator color={Colors.textInverse} /> : (
              <>
                <Ionicons name="checkmark-done" size={20} color={Colors.textInverse} />
                <Text style={styles.primaryBtnText}>Mark Job Complete</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {!isVendor && isPendingConfirm && (
          <View style={styles.customerActions}>
            <TouchableOpacity style={styles.disputeBtn} onPress={() => setShowDisputeModal(true)}>
              <Text style={styles.disputeBtnText}>Raise Dispute</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmComplete} disabled={actionLoading}>
              {actionLoading ? <ActivityIndicator color={Colors.textInverse} /> : (
                <Text style={styles.confirmBtnText}>Confirm Complete</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const ISSUE_OPTIONS = [
  { key: 'never_started', label: 'Service was never started', icon: 'ban-outline' },
  { key: 'incomplete', label: 'Service was incomplete', icon: 'cut-outline' },
  { key: 'quality', label: 'Quality doesn\'t match agreement', icon: 'alert-circle-outline' },
  { key: 'no_show', label: 'Vendor was a no-show', icon: 'person-remove-outline' },
];

const formatStatus = (s: string) => s?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
const getStatusStyle = (s: string) => {
  if (s === 'in_progress') return { backgroundColor: Colors.infoLight };
  if (s === 'completed') return { backgroundColor: Colors.successLight };
  if (s === 'completed_pending') return { backgroundColor: Colors.warningLight };
  if (s === 'disputed') return { backgroundColor: Colors.dangerLight };
  return { backgroundColor: Colors.surfaceAlt };
};
const getStatusTextStyle = (s: string) => {
  if (s === 'in_progress') return { color: Colors.info };
  if (s === 'completed') return { color: Colors.success };
  if (s === 'completed_pending') return { color: Colors.warning };
  if (s === 'disputed') return { color: Colors.danger };
  return { color: Colors.textSecondary };
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  backBtn: { padding: Spacing.sm },
  headerTitle: { flex: 1, fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  statusPill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: Typography.sm, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 120 },
  refCard: { backgroundColor: Colors.primaryLight, borderRadius: BorderRadius.lg, padding: Spacing.base, alignItems: 'center' },
  refLabel: { fontSize: Typography.sm, color: Colors.primary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  refValue: { fontSize: Typography.md, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  partyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, gap: Spacing.md, ...Shadows.sm, borderWidth: 1, borderColor: Colors.border },
  partyPhoto: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceAlt },
  partyInfo: { flex: 1 },
  partyName: { fontSize: Typography.base, fontWeight: '600', color: Colors.textPrimary },
  partyRole: { fontSize: Typography.sm, color: Colors.textSecondary },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.success, justifyContent: 'center', alignItems: 'center' },
  finCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, gap: Spacing.sm, ...Shadows.sm, borderWidth: 1, borderColor: Colors.border },
  finRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  finLabel: { fontSize: Typography.base, color: Colors.textSecondary },
  finValue: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  finNegative: { fontSize: Typography.base, fontWeight: '600', color: Colors.danger },
  finDivider: { height: 1, backgroundColor: Colors.borderLight },
  escrowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.escrowLight, borderRadius: BorderRadius.lg, padding: Spacing.base },
  escrowText: { fontSize: Typography.sm, color: Colors.escrow, fontWeight: '600' },
  deadlineCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.warningLight, borderRadius: BorderRadius.lg, padding: Spacing.base },
  deadlineText: { flex: 1, fontSize: Typography.sm, color: Colors.warning, fontWeight: '500' },
  commCard: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.base, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  commTitle: { fontSize: Typography.base, fontWeight: '700', color: Colors.textPrimary },
  commNote: { fontSize: Typography.sm, color: Colors.textSecondary, lineHeight: 18 },
  recordBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.base, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  recordBtnActive: { borderColor: Colors.danger, backgroundColor: Colors.dangerLight },
  recordBtnText: { flex: 1, fontSize: Typography.base, color: Colors.primary, fontWeight: '500' },
  recordBtnTextActive: { color: Colors.danger },
  actionBar: { backgroundColor: Colors.surface, padding: Spacing.base, paddingBottom: 34, borderTopWidth: 1, borderTopColor: Colors.border },
  primaryBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, height: 56 },
  primaryBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
  customerActions: { flexDirection: 'row', gap: Spacing.sm },
  disputeBtn: { flex: 1, height: 56, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.danger },
  disputeBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.danger },
  confirmBtn: { flex: 2, height: 56, justifyContent: 'center', alignItems: 'center', borderRadius: BorderRadius.lg, backgroundColor: Colors.success },
  confirmBtnText: { fontSize: Typography.base, fontWeight: '700', color: Colors.textInverse },
});
