import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'cta';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const variantStyles = {
  primary: { bg: Colors.verdigris, text: Colors.background, border: Colors.verdigris },
  secondary: { bg: Colors.surfaceElevated, text: Colors.textPrimary, border: Colors.border },
  ghost: { bg: Colors.transparent, text: Colors.verdigris, border: Colors.verdigris },
  danger: { bg: Colors.crimson, text: Colors.textPrimary, border: Colors.crimson },
  cta: { bg: Colors.yellow, text: Colors.background, border: Colors.yellow },
};

export default function Button({ label, onPress, variant = 'primary', loading, disabled, fullWidth, style }: ButtonProps) {
  const v = variantStyles[variant];
  return (
    <TouchableOpacity
      style={[
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        fullWidth && { width: '100%' },
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
    >
      {loading
        ? <ActivityIndicator color={v.text} size="small" />
        : <Text style={[styles.label, { color: v.text }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  label: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold },
  disabled: { opacity: 0.45 },
});
