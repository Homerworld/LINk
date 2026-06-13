export const Colors = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryLight: '#EEF2FF',
  accent: '#F59E0B',
  success: '#10B981',
  successLight: '#D1FAE5',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  escrow: '#8B5CF6',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F4F6',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
};

export const Spacing = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32 };
export const Radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 };

export const naira = (kobo: number) =>
  `\u20A6${((kobo || 0) / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
