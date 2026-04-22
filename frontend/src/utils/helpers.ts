export const formatNaira = (kobo: number): string => {
  if (!kobo && kobo !== 0) return '₦0';
  const naira = kobo / 100;
  return `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export const formatDistance = (km: number): string => {
  if (!km && km !== 0) return '';
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)}km away`;
};

export const formatTimeAgo = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const formatShortDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

export const koboToNaira = (kobo: number): number => kobo / 100;
export const nairaToKobo = (naira: number): number => Math.round(naira * 100);

export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('234')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+234${cleaned.slice(1)}`;
  return phone;
};

export const truncate = (str: string, n: number): string =>
  str?.length > n ? str.slice(0, n - 1) + '…' : str;

export const getInitials = (name: string): string => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
};

export const formatTransactionType = (type: string): string => {
  const map: Record<string, string> = {
    escrow_in: 'Payment secured',
    escrow_out: 'Escrow released',
    payout: 'Job payment',
    withdrawal: 'Withdrawal',
    refund: 'Refund',
    fee: 'Platform fee',
  };
  return map[type] || type;
};
