import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import colors from '../../theme/colors';
import spacing from '../../theme/spacing';
import typography from '../../theme/typography';

/**
 * SBOUP Avatar Component
 *
 * @param {string}          src    - image URI
 * @param {string}          name   - used for initials fallback
 * @param {'sm'|'md'|'lg'}  size
 * @param {boolean}         online - show green dot
 * @param {object}          style
 */
const sizes = {
  sm: 32,
  md: 40,
  lg: 56,
};

const dotSizes = {
  sm: 8,
  md: 10,
  lg: 14,
};

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const Avatar = ({
  src,
  name = '',
  size = 'md',
  online = false,
  style,
  ...rest
}) => {
  const [imgError, setImgError] = useState(false);
  const dim = sizes[size] ?? sizes.md;
  const dotDim = dotSizes[size] ?? dotSizes.md;
  const showImage = !!src && !imgError;

  return (
    <View style={[{ width: dim, height: dim }, style]} {...rest}>
      <View
        style={[
          styles.circle,
          { width: dim, height: dim, borderRadius: dim / 2 },
          !showImage && styles.fallback,
        ]}
        accessibilityLabel={name || 'Avatar'}
      >
        {showImage ? (
          <Image
            source={{ uri: src }}
            style={{ width: dim, height: dim, borderRadius: dim / 2 }}
            onError={() => setImgError(true)}
          />
        ) : (
          <Text style={[styles.initials, { fontSize: dim * 0.35 }]}>
            {getInitials(name)}
          </Text>
        )}
      </View>

      {online && (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotDim,
              height: dotDim,
              borderRadius: dotDim / 2,
              bottom: 0,
              right: 0,
            },
          ]}
          accessibilityLabel="Online"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    backgroundColor: colors.primaryLight,
  },
  initials: {
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  onlineDot: {
    position: 'absolute',
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});

export default Avatar;
