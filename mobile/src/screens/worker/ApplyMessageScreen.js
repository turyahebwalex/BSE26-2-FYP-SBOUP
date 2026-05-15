import React, { useState } from 'react';
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
import { opportunityAPI } from '../../services/api';

const ApplyMessageScreen = ({ route, navigation }) => {
  const { opportunityId, opportunityTitle, employerId, instructions } = route.params || {};
  
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please write a message to the employer');
      return;
    }

    setSending(true);
    try {
      await opportunityAPI.applyViaMessage({
        opportunityId,
        message: message.trim(),
      });
      
      Alert.alert(
        'Application Sent',
        'Your message has been sent to the employer. They will review your application and get back to you.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to send application';
      Alert.alert('Error', errorMsg);
    } finally {
      setSending(false);
    }
  };

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
          <Text style={styles.headerTitle}>Apply via Message</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.jobCard}>
            <Text style={styles.jobTitle}>{opportunityTitle || 'Position'}</Text>
            <View style={styles.infoRow}>
              <Ionicons name="briefcase-outline" size={16} color="#6B7280" />
              <Text style={styles.infoText}>Application via Direct Message</Text>
            </View>
          </View>

          <View style={styles.instructionCard}>
            <Ionicons name="information-circle-outline" size={20} color="#F97316" />
            <Text style={styles.instructionText}>
              {instructions || 
                'Send a message introducing yourself, your skills, and why you are interested in this position. The employer will review your message and respond if interested.'}
            </Text>
          </View>

          <Text style={styles.label}>Your Message</Text>
          <TextInput
            style={styles.messageInput}
            multiline
            numberOfLines={10}
            placeholder="Dear Hiring Manager,

I am writing to express my interest in this position. I have experience in...

My skills include...
I am available to start immediately..."

            placeholderTextColor="#9CA3AF"
            value={message}
            onChangeText={setMessage}
            textAlignVertical="top"
          />

          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>💡 Tips for a great application:</Text>
            <Text style={styles.tipItem}>• Introduce yourself clearly</Text>
            <Text style={styles.tipItem}>• Highlight your relevant skills and experience</Text>
            <Text style={styles.tipItem}>• Explain why you're interested in this role</Text>
            <Text style={styles.tipItem}>• Keep it professional and concise</Text>
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.sendButton, (!message.trim() || sending) && styles.disabledButton]}
            onPress={handleSend}
            disabled={!message.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send-outline" size={20} color="#FFFFFF" />
                <Text style={styles.sendButtonText}>Send Application</Text>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
  },
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#9A3412',
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  messageInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 200,
    textAlignVertical: 'top',
  },
  tipsCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 8,
  },
  tipItem: {
    fontSize: 12,
    color: '#065F46',
    marginBottom: 4,
    lineHeight: 18,
  },
  bottomBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  sendButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default ApplyMessageScreen;