import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../theme';
import { getCertaintyColor, getCertaintyLabel } from '../../utils';

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ label, color }: { label: string; color?: string }) {
  const bg = color ? `${color}22` : `${Colors.verdigris}22`;
  const text = color || Colors.verdigris;
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: color || Colors.verdigris }]}>
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

// ─── CertaintyScore ───────────────────────────────────────────────────────────
export function CertaintyScore({ score }: { score: number }) {
  const color = getCertaintyColor(score);
  const label = getCertaintyLabel(score);
  return (
    <View style={styles.certaintyRow}>
      <View style={[styles.certaintyBar]}>
        <View style={[styles.certaintyFill, { width: `${score}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.certaintyScore, { color }]}>{score}%</Text>
      <Text style={styles.certaintyLabel}>{label}</Text>
    </View>
  );
}

// ─── ScreenHeader ─────────────────────────────────────────────────────────────
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle && <Text style={styles.screenSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider() {
  return <View style={styles.divider} />;
}

// ─── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold },

  certaintyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  certaintyBar: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  certaintyFill: { height: '100%', borderRadius: 2 },
  certaintyScore: { fontSize: Typography.size.sm, fontWeight: Typography.weight.bold, width: 36 },
  certaintyLabel: { fontSize: Typography.size.xs, color: Colors.textTertiary },

  screenHeader: { paddingHorizontal: Spacing.screen, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  screenTitle: { color: Colors.textPrimary, fontSize: Typography.size.xl, fontWeight: Typography.weight.bold },
  screenSubtitle: { color: Colors.textSecondary, fontSize: Typography.size.sm, marginTop: 4 },

  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm },

  emptyState: { alignItems: 'center', padding: Spacing.xxl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { color: Colors.textPrimary, fontSize: Typography.size.md, fontWeight: Typography.weight.semibold },
  emptySubtitle: { color: Colors.textSecondary, fontSize: Typography.size.sm, marginTop: Spacing.xs, textAlign: 'center' },
});
