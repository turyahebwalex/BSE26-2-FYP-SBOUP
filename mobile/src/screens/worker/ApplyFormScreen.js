import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { applicationAPI, profileAPI } from '../../services/api';

const ApplyFormScreen = ({ route, navigation }) => {
  const { opportunityId, opportunityTitle, requiredDocuments, customQuestions } = route.params || {};
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState(null);
  const [submitted, setSubmitted] = useState(false); // Track if already submitted
  
  
  const [coverLetter, setCoverLetter] = useState('');
  const [notes, setNotes] = useState('');
  const [cv, setCv] = useState(null);
  const [coverLetterFile, setCoverLetterFile] = useState(null);
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [customAnswers, setCustomAnswers] = useState({});

  const isSubmittingRef = useRef(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data } = await profileAPI.getMyProfile();
      console.log('📱 Profile loaded');
      
      if (data?.profile?._id) {
        setProfile(data.profile);
      } else if (data?._id) {
        setProfile(data);
      } else {
        Alert.alert(
          'Profile Required',
          'Please complete your profile before applying.',
          [{ text: 'Go to Profile', onPress: () => navigation.navigate('ProfileTab') }]
        );
      }
    } catch (error) {
      console.log('Profile fetch error:', error);
      Alert.alert('Error', 'Could not load profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const pickDocument = async (type) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ],
      copyToCacheDirectory: true,
    });
    
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      if (type === 'cv') {
        setCv(asset);
      } else if (type === 'coverLetter') {
        setCoverLetterFile(asset);
      }
      return asset;
    }
    return null;
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos');
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setAdditionalDocs([...additionalDocs, {
        uri: asset.uri,
        name: `image_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        type: 'image',
      }]);
    }
  };

  const addAdditionalDocument = async () => {
    Alert.alert(
      'Add Document',
      'Choose document type',
      [
        { text: 'PDF/Word Document', onPress: async () => {
          const doc = await pickDocument('additional');
          if (doc) {
            setAdditionalDocs([...additionalDocs, { ...doc, type: 'document' }]);
          }
        }},
        { text: 'Image', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const removeDocument = (index) => {
    setAdditionalDocs(additionalDocs.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Prevent multiple submissions
    if (isSubmittingRef.current || submittedRef.current || submitted) {
      console.log('Submission already in progress or completed');
      return;
    }

    const requiredDocsList = requiredDocuments || ['cv'];
    if (requiredDocsList.includes('cv') && !cv) {
      Alert.alert('Error', 'Please upload your CV/Resume');
      return;
    }

    if (!opportunityId) {
      Alert.alert('Error', 'Missing opportunity information');
      return;
    }

    if (!profile?._id) {
      Alert.alert('Error', 'Please complete your profile before applying');
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    
    try {
      const applicationData = {
        opportunityId: opportunityId,
        profileId: profile._id,
        coverLetter: coverLetter || '',
        notes: notes || '',
      };
      
      console.log('Submitting application (single attempt)...');
      
      const response = await applicationAPI.apply(applicationData);
      
      console.log('Application submitted successfully');
      
      // Mark as submitted to prevent further attempts
      submittedRef.current = true;
      setSubmitted(true);
      
      Alert.alert(
        'Application Submitted',
        'Your application has been sent successfully! The employer will review it and get back to you.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.log('Submit error:', error.response?.data);
      const errorMsg = error.response?.data?.error || 
                       error.response?.data?.message || 
                       'Failed to submit application';
      Alert.alert('Error', errorMsg);
     
      isSubmittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          <Text style={styles.successTitle}>Application Submitted!</Text>
          <Text style={styles.successText}>Your application has been sent to the employer.</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Apply for Job</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.jobCard}>
            <Text style={styles.jobTitle}>{opportunityTitle || 'Position'}</Text>
          </View>

          {/* CV Upload - Required */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              CV/Resume <Text style={styles.requiredStar}>*</Text>
            </Text>
            <TouchableOpacity style={styles.uploadButton} onPress={() => pickDocument('cv')}>
              <Ionicons name="document-text-outline" size={24} color="#F97316" />
              <Text style={styles.uploadButtonText}>
                {cv ? cv.name : 'Upload your CV (PDF, DOC, DOCX)'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cover Letter - Optional */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cover Letter (Optional)</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Write a cover letter explaining why you're a great fit for this position..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={6}
              value={coverLetter}
              onChangeText={setCoverLetter}
              textAlignVertical="top"
            />
          </View>

          {/* Additional Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Additional Notes (Optional)</Text>
            <TextInput
              style={styles.textAreaSmall}
              placeholder="Any additional information you'd like the employer to know..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              value={notes}
              onChangeText={setNotes}
              textAlignVertical="top"
            />
          </View>

          {/* Note about file uploads */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color="#F97316" />
            <Text style={styles.infoText}>
              Your CV will be attached automatically. The employer will be able to download and review it.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.submitButton, (submitting || submitted) && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={submitting || submitted}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send-outline" size={20} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Submit Application</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  goBackButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  goBackButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  keyboardView: {
    flex: 1,
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
    padding: 16,
  },
  jobCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  jobTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#92400E',
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  requiredStar: {
    color: '#EF4444',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: '#F97316',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#FFF7ED',
  },
  uploadButtonText: {
    flex: 1,
    fontSize: 13,
    color: '#F97316',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 120,
    marginTop: 8,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 80,
    marginTop: 8,
    textAlignVertical: 'top',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    marginBottom: 20,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
  },
  bottomBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  submitButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default ApplyFormScreen;