import React, { useState, forwardRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import colors from '../../theme/colors';
import spacing from '../../theme/spacing';
import typography from '../../theme/typography';

/**
 * SBOUP Input Component
 *
 * @param {string}          label
 * @param {string}          error
 * @param {React.ReactNode} leftIcon
 * @param {React.ReactNode} rightIcon
 * @param {object}          style       - override container style
 * @param {object}          inputStyle  - override TextInput style
 */
const Input = forwardRef(({
  label,
  error,
  leftIcon,
  rightIcon,
  style,
  inputStyle,
  ...rest
}, ref) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, style]}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}

      <View style={[
        styles.inputRow,
        focused && styles.inputFocused,
        error  && styles.inputError,
      ]}>
        {leftIcon && (
          <View style={styles.iconLeft}>{leftIcon}</View>
        )}

        <TextInput
          ref={ref}
          style={[
            styles.input,
            leftIcon  ? styles.inputWithLeft  : null,
            rightIcon ? styles.inputWithRight : null,
            inputStyle,
          ]}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          accessibilityHint={error}
          {...rest}
        />

        {rightIcon && (
          <View style={styles.iconRight}>{rightIcon}</View>
        )}
      </View>

      {error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
});

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing[4],
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.surface,
    minHeight: spacing.touchTarget,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.size.base,
    color: colors.textPrimary,
  },
  inputWithLeft:  { paddingLeft: spacing[2] },
  inputWithRight: { paddingRight: spacing[2] },
  iconLeft: {
    paddingLeft: spacing[3],
  },
  iconRight: {
    paddingRight: spacing[3],
  },
  errorText: {
    marginTop: spacing[1],
    fontSize: typography.size.xs,
    color: colors.error,
  },
});

export default Input;
