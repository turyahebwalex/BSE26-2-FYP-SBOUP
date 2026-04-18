import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import colors from '../theme/colors';
import spacing from '../theme/spacing';
import typography from '../theme/typography';

const LoadingScreen = () => (
  <View style={styles.container}>
    <Text style={styles.brand}>SBOUP</Text>
    <Text style={styles.tagline}>Connecting Skills to Opportunities</Text>
    <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  brand: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.primary,
    marginBottom: spacing[2],
    letterSpacing: 1,
  },
  tagline: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing[8],
  },
  spinner: {
    marginBottom: spacing[3],
  },
  loadingText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
});

export default LoadingScreen;
