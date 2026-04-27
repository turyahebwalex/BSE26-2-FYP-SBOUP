import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { opportunityAPI, applicationAPI, matchingAPI, profileAPI } from '../../services/api';

const OpportunityDetailScreen = ({ route, navigation }) => {
  const { opportunityId: routeOppId, opportunity: passedOpp, matchScore: passedScore } = route.params || {};
  const resolvedId =
    routeOppId || passedOpp?._id || passedOpp?.id || passedOpp?.opportunityId || null;
  const passedHasFullDetails = !!(passedOpp && passedOpp._id && passedOpp.description !== undefined);
  const [opportunity, setOpportunity] = useState(passedHasFullDetails ? passedOpp : null);
  const [matchScore, setMatchScore] = useState(passedScore || null);
  const [loading, setLoading] = useState(!passedHasFullDetails);
  const [applying, setApplying] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState(null);
  const [profileId, setProfileId] = useState(null);

  useEffect(() => {
    if (!passedHasFullDetails && resolvedId) {
      fetchOpportunity();
    }
    fetchProfileAndScore();
  }, [resolvedId]);

  const fetchOpportunity = async () => {
    try {
      const { data } = await opportunityAPI.getOne(resolvedId);
      setOpportunity(data.opportunity || data);
    } catch (err) {
      setError('Failed to load opportunity details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchProfileAndScore = async () => {
    try {
      const { data } = await profileAPI.getMyProfile();
      const pid = data.profile?._id || data._id;
      if (!pid) return;
      setProfileId(pid);
      if (resolvedId && matchScore == null) {
        try {
          const scoreRes = await matchingAPI.getMatchScore(pid, resolvedId);
          setMatchScore(scoreRes.data.score || scoreRes.data.matchScore);
        } catch (_) {}
      }
    } catch (_) {}
  };

  const handleApply = async () => {
    if (!profileId) {
      Alert.alert('Profile Required', 'Please create your profile before applying.');
      return;
    }
    const submitOppId =
      resolvedId || opportunity?._id || opportunity?.id || opportunity?.opportunityId;
    if (!submitOppId) {
      Alert.alert('Error', 'Missing opportunity reference. Please reopen this opportunity.');
      return;
    }
    setApplying(true);
    try {
      await applicationAPI.apply({
        opportunityId: submitOppId,
        profileId,
        coverLetter: coverLetter.trim(),
      });
      setApplied(true);
      setShowApplyForm(false);
      Alert.alert('Success', 'Your application has been submitted!');
    } catch (err) {
      const data = err.response?.data;
      const detailMsg = Array.isArray(data?.details)
        ? data.details.map((d) => `${d.field}: ${d.message}`).join('\n')
        : null;
      const msg = data?.message || detailMsg || data?.error || 'Failed to apply.';
      Alert.alert('Error', msg);
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !opportunity) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>{error || 'Opportunity not found.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const {
    title,
    description,
    companyId,
    postedByUserId,
    location,
    category,
    requiredSkills,
    compensationRange,
    experienceLevel,
    deadline,
  } = opportunity;

  const displaySkills = requiredSkills || [];
  const displayCompany = companyId?.name || postedByUserId?.fullName || 'Company';

  const typeBadgeColors = {
    formal: { bg: '#DBEAFE', text: '#1D4ED8' },
    contract: { bg: '#FEF3C7', text: '#D97706' },
    freelance: { bg: '#D1FAE5', text: '#059669' },
    apprenticeship: { bg: '#EDE9FE', text: '#7C3AED' },
  };
  const badge = typeBadgeColors[category] || typeBadgeColors.formal;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color="#1F2937" />
            </TouchableOpacity>
            {matchScore != null && (
              <View style={styles.matchBadge}>
                <Ionicons name="sparkles" size={14} color="#F97316" />
                <Text style={styles.matchText}>{Math.round(matchScore)}% Match</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.company}>{displayCompany}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={16} color="#6B7280" />
              <Text style={styles.metaText}>{location || 'Uganda'}</Text>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.typeBadgeText, { color: badge.text }]}>
                {(category || 'formal').charAt(0).toUpperCase() + (category || 'formal').slice(1)}
              </Text>
            </View>
          </View>
        </View>

        {/* Compensation */}
        {compensationRange && (compensationRange.min || compensationRange.max) && (
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Ionicons name="cash-outline" size={18} color="#F97316" />
              <Text style={styles.infoTitle}>Compensation</Text>
            </View>
            <Text style={styles.infoText}>
              {`${compensationRange.currency || 'UGX'} ${
                compensationRange.min ? compensationRange.min.toLocaleString() : '—'
              }${compensationRange.max ? ` – ${compensationRange.max.toLocaleString()}` : ''}${
                compensationRange.period ? ` / ${compensationRange.period}` : ''
              }`}
            </Text>
          </View>
        )}

        {/* Experience Level */}
        {experienceLevel && (
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Ionicons name="trophy-outline" size={18} color="#F97316" />
              <Text style={styles.infoTitle}>Experience Level</Text>
            </View>
            <Text style={styles.infoText}>
              {experienceLevel.charAt(0).toUpperCase() + experienceLevel.slice(1)}
            </Text>
          </View>
        )}

        {/* Deadline */}
        {deadline && (
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Ionicons name="calendar-outline" size={18} color="#F97316" />
              <Text style={styles.infoTitle}>Application Deadline</Text>
            </View>
            <Text style={styles.infoText}>
              {new Date(deadline).toLocaleDateString('en-UG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{description || 'No description provided.'}</Text>
        </View>

        {/* Required Skills */}
        {displaySkills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Required Skills</Text>
            <View style={styles.skillsContainer}>
              {displaySkills.map((skill, index) => {
                const skillName =
                  typeof skill === 'string'
                    ? skill
                    : skill.skillName || skill.name || skill.skill;
                return (
                  <View key={skill._id || index} style={styles.skillChip}>
                    <Text style={styles.skillChipText}>{skillName}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Apply Form */}
        {showApplyForm && !applied && (
          <View style={styles.applyForm}>
            <Text style={styles.sectionTitle}>Cover Letter (Optional)</Text>
            <TextInput
              style={styles.coverLetterInput}
              placeholder="Tell the employer why you're a great fit..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              value={coverLetter}
              onChangeText={setCoverLetter}
            />
            <View style={styles.applyFormButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowApplyForm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, applying && styles.buttonDisabled]}
                onPress={handleApply}
                disabled={applying}
              >
                {applying ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Application</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Apply Button */}
      {!showApplyForm && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.applyButton,
              applied && styles.appliedButton,
            ]}
            onPress={() => {
              if (!applied) {
                setShowApplyForm(true);
              }
            }}
            disabled={applied}
          >
            <Ionicons
              name={applied ? 'checkmark-circle' : 'paper-plane-outline'}
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.applyButtonText}>
              {applied ? 'Applied' : 'Apply Now'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 16,
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#F97316',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  headerSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#F97316',
  },
  matchText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F97316',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  company: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 14,
    color: '#6B7280',
  },
  typeBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  infoText: {
    fontSize: 15,
    color: '#1F2937',
    paddingLeft: 26,
  },
  section: {
    marginTop: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  skillChipText: {
    fontSize: 13,
    color: '#EA580C',
    fontWeight: '500',
  },
  applyForm: {
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
  coverLetterInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    minHeight: 120,
    marginBottom: 12,
  },
  applyFormButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#F97316',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  applyButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  appliedButton: {
    backgroundColor: '#10B981',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default OpportunityDetailScreen;
