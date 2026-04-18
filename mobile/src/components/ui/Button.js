import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import colors from '../../theme/colors';
import spacing from '../../theme/spacing';
import typography from '../../theme/typography';

/**
 * SBOUP Button Component
 *
 * @param {'primary'|'secondary'|'ghost'} variant
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} loading
 * @param {boolean} disabled
 * @param {function} onPress
 * @param {object} style       - override container style
 * @param {object} textStyle   - override label style
 */
const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onPress,
  style,
  textStyle,
  ...rest
}) => {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.textInverse : colors.primary}
        />
      ) : (
        <Text style={[styles.label, styles[`label_${variant}`], styles[`labelSize_${size}`], textStyle]}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: spacing.radius.full,
    minHeight: spacing.touchTarget,
    borderWidth: 2,
    borderColor: 'transparent',
  },

  // Variants
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },

  // Sizes
  size_sm: { paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  size_md: { paddingHorizontal: spacing[6], paddingVertical: spacing[3] },
  size_lg: { paddingHorizontal: spacing[8], paddingVertical: spacing[4] },

  // Labels
  label: {
    fontWeight: typography.weight.semibold,
  },
  label_primary:   { color: colors.textInverse },
  label_secondary: { color: colors.primary },
  label_ghost:     { color: colors.primary },

  labelSize_sm: { fontSize: typography.size.sm },
  labelSize_md: { fontSize: typography.size.md },
  labelSize_lg: { fontSize: typography.size.lg },

  disabled: { opacity: 0.5 },
});

export default Button;
