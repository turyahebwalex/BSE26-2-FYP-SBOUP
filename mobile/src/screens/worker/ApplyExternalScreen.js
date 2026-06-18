import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { opportunityAPI } from '../../services/api';
import * as WebBrowser from 'expo-web-browser';

const ApplyExternalScreen = ({ route, navigation }) => {
  const { url, opportunityTitle } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [externalUrl, setExternalUrl] = useState(url);

  useEffect(() => {
    if (!externalUrl) {
      fetchExternalUrl();
    }
  }, []);

  const fetchExternalUrl = async () => {
    const oppId = route.params?.opportunityId;
    if (!oppId) return;
    
    setLoading(true);
    try {
      const response = await opportunityAPI.getExternalApplyUrl(oppId);
      setExternalUrl(response.data.url);
    } catch (error) {
      Alert.alert('Error', 'Could not load application link');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInBrowser = async () => {
    if (!externalUrl) {
      Alert.alert('Error', 'No application link available');
      return;
    }
    
    try {
      await WebBrowser.openBrowserAsync(externalUrl, {
        controlsColor: '#F97316',
        toolbarColor: '#FFFFFF',
      });
    } catch (error) {
     
      const canOpen = await Linking.canOpenURL(externalUrl);
      if (canOpen) {
        await Linking.openURL(externalUrl);
      } else {
        Alert.alert('Error', 'Could not open the application link');
      }
    }
  };

  const handleCopyLink = async () => {
    if (!externalUrl) return;
    // Note: You'll need to install @react-native-clipboard/clipboard
    // For now, we'll just alert the user
    Alert.alert('Link', externalUrl, [
      { text: 'OK' },
      { text: 'Open', onPress: handleOpenInBrowser },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Loading application link...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>External Application</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="link-outline" size={48} color="#10B981" />
          </View>
        </View>

        <Text style={styles.title}>Complete Your Application</Text>
        <Text style={styles.description}>
          You will be redirected to an external website to complete your application for:
        </Text>

        <View style={styles.jobCard}>
          <Text style={styles.jobTitle}>{opportunityTitle || 'the position'}</Text>
        </View>

        <View style={styles.warningCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#F59E0B" />
          <Text style={styles.warningText}>
            This is an external application. The employer uses a third-party form (Google Forms, Typeform, etc.). Your application will be processed outside this app.
          </Text>
        </View>

        <TouchableOpacity style={styles.continueButton} onPress={handleOpenInBrowser}>
          <Ionicons name="open-outline" size={20} color="#FFFFFF" />
          <Text style={styles.continueButtonText}>Continue to Application</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.copyButton} onPress={handleCopyLink}>
          <Ionicons name="copy-outline" size={18} color="#6B7280" />
          <Text style={styles.copyButtonText}>Copy application link</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButtonLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  iconContainer: {
    marginTop: 40,
    marginBottom: 24,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  warningCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 32,
    gap: 10,
    width: '100%',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  continueButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  copyButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  backButtonLink: {
    marginTop: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});

export default ApplyExternalScreen;