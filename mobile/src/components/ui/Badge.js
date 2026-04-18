import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../../theme/colors';
import spacing from '../../theme/spacing';
import typography from '../../theme/typography';

/**
 * SBOUP Badge Component
 *
 * @param {'active'|'filled'|'draft'|'match'} variant
 * @param {object} style
 */
const Badge = ({ children, variant = 'draft', style, ...rest }) => {
  const badgeColors = colors.badge[variant] ?? colors.badge.draft;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: badgeColors.bg },
        style,
      ]}
      {...rest}
    >
      <Text style={[styles.label, { color: badgeColors.text }]}>
        {children}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: spacing.radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  label: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
});

export default Badge;
