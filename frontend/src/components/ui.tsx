import React from 'react';
import { Text, TextInput, TouchableOpacity, View, ActivityIndicator, StyleSheet, TextInputProps } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

export function Button({ title, onPress, loading, disabled, variant = 'primary', style }: any) {
  const bg =
    variant === 'primary' ? Colors.primary :
    variant === 'success' ? Colors.success :
    variant === 'danger' ? Colors.danger :
    variant === 'ghost' ? 'transparent' : Colors.primary;
  const txt = variant === 'ghost' ? Colors.primary : '#fff';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : 1 },
        variant === 'ghost' && { borderWidth: 1.5, borderColor: Colors.primary },
        style,
      ]}>
      {loading ? <ActivityIndicator color={txt} /> : <Text style={[styles.btnText, { color: txt }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }: { label?: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={styles.input}
        placeholderTextColor={Colors.textTertiary}
        {...props}
      />
    </View>
  );
}

export function Card({ children, style }: any) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ text, color = 'gray' }: { text: string; color?: string }) {
  const map: Record<string, [string, string]> = {
    green: [Colors.successLight, Colors.success],
    yellow: [Colors.warningLight, '#B45309'],
    red: [Colors.dangerLight, Colors.danger],
    indigo: [Colors.primaryLight, Colors.primary],
    gray: [Colors.surfaceAlt, Colors.textSecondary],
  };
  const [bg, fg] = map[color] || map.gray;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { height: 54, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  input: { height: 52, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.base, fontSize: 15, backgroundColor: Colors.surface, color: Colors.textPrimary },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.borderLight },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
