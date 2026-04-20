import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>SkillBridge</Text>
      <Text style={styles.tagline}>Connecting Skills to Opportunities</Text>
      <ActivityIndicator size="large" color="#F97316" style={styles.spinner} />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brand: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F97316',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 32,
  },
  spinner: {
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});

export default LoadingScreen;
