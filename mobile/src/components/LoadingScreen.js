import React from 'react';
import { View, Text, ActivityIndicator, Image, StyleSheet } from 'react-native';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/skillbridge_logo_transparent.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      
      <Text style={styles.brand}>
        <Text style={styles.brandSkill}>Skill</Text>
        <Text style={styles.brandBridge}>Bridge</Text>
      </Text>
      <Text style={styles.tagline}>Connecting Skills to Opportunities</Text>
      <ActivityIndicator size="small" color="#F97316" style={styles.spinner} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 260,
    height: 260,
    marginBottom: 12,
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  brandSkill: {
    color: '#F97316',
  },
  brandBridge: {
    color: '#111827',
  },
  tagline: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 28,
    letterSpacing: 0.3,
  },
  spinner: {
    marginTop: 4,
  },
});

export default LoadingScreen;
