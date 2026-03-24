import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns';
import { Colors } from '../theme';
import { RiskLevel } from '../types';

// ─── Date helpers ─────────────────────────────────────────────────────────────
export const formatDate = (date: string | Date): string =>
  format(new Date(date), 'dd MMM yyyy');

export const formatRelative = (date: string | Date): string =>
  formatDistanceToNow(new Date(date), { addSuffix: true });

export const daysUntil = (date: string | Date): number =>
  differenceInDays(new Date(date), new Date());

export const isExpired = (date: string | Date): boolean =>
  isPast(new Date(date));

export const getDaysLabel = (days: number | null | undefined): string => {
  if (days === null || days === undefined) return 'No date set';
  if (days < 0) return `Overdue by ${Math.abs(days)} days`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days} days remaining`;
};

// ─── Risk helpers ─────────────────────────────────────────────────────────────
export const getRiskColor = (risk: RiskLevel): string => ({
  high: Colors.riskHigh,
  medium: Colors.riskMedium,
  low: Colors.riskLow,
}[risk] || Colors.textSecondary);

export const getRiskEmoji = (risk: RiskLevel): string => ({
  high: '🔴',
  medium: '🟡',
  low: '🟢',
}[risk] || '⚪');

// ─── Certainty score helpers ──────────────────────────────────────────────────
export const getCertaintyColor = (score: number): string => {
  if (score >= 85) return Colors.verdigris;
  if (score >= 65) return Colors.yellow;
  return Colors.sweetSalmon;
};

export const getCertaintyLabel = (score: number): string => {
  if (score >= 85) return 'High confidence';
  if (score >= 65) return 'Learning your preferences';
  return 'Early suggestion';
};

// ─── Currency ─────────────────────────────────────────────────────────────────
export const formatAED = (amount: number): string =>
  `AED ${amount.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── Time saved ───────────────────────────────────────────────────────────────
export const formatTimeSaved = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

// ─── String helpers ───────────────────────────────────────────────────────────
export const capitalize = (str: string): string =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

export const truncate = (str: string, length: number): string =>
  str.length > length ? `${str.substring(0, length)}...` : str;
