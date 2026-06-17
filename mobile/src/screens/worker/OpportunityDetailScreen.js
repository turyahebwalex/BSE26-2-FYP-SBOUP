import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { opportunityAPI, applicationAPI, matchingAPI, profileAPI, learningAPI } from '../../services/api';
import ReportBottomSheet from '../../components/ReportBottomSheet';

const SignalRow = ({ icon, label, value, pass }) => (
  <View style={styles.signalRow}>
    <View style={styles.signalLeft}>
      <Ionicons name={icon} size={16} color={pass ? '#10B981' : '#EF4444'} />
      <Text style={styles.signalLabel}>{label}</Text>
    </View>
    <View style={[styles.signalBadge, { backgroundColor: pass ? '#D1FAE5' : '#FEE2E2' }]}>
      <Text style={[styles.signalValue, { color: pass ? '#059669' : '#DC2626' }]}>{value}</Text>
    </View>
  </View>
);

const OpportunityDetailScreen = ({ route, navigation }) => {
  const { opportunityId: routeOppId, opportunity: passedOpp, matchScore: passedScore } = route.params || {};
  const resolvedId =
    routeOppId || passedOpp?._id || passedOpp?.id || passedOpp?.opportunityId || null;
  const passedHasFullDetails = !!(passedOpp && passedOpp._id && passedOpp.description !== undefined);

  // State declarations
  const [opportunity, setOpportunity] = useState(passedHasFullDetails ? passedOpp : null);
  const [matchScore, setMatchScore] = useState(passedScore || null);
  const [matchBreakdown, setMatchBreakdown] = useState(null);
  const [missingSkills, setMissingSkills] = useState([]);
  const [loading, setLoading] = useState(!passedHasFullDetails);
  const [applying, setApplying] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [attachments, setAttachments] = useState([]);   // { name, uri, type, size }
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [bridging, setBridging] = useState(false);
  const [aliasHints, setAliasHints] = useState([]);
  const [proficiencyShortfalls, setProficiencyShortfalls] = useState([]);
  
  // NEW: Application options state
  const [applicationOptions, setApplicationOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [showMethodSelector, setShowMethodSelector] = useState(false);

  // Opportunity-driven pathway generation
  const handleBridgeSkillGap = async () => {
    const oppId = opportunity?._id || opportunity?.id;
    if (!oppId) return;
    setBridging(true);
    try {
      const { data } = await learningAPI.generate({ opportunityId: oppId });
      const path = data?.learningPath || data?.data?.learningPath || null;
      const pathId = path?._id || path?.id || null;
      const alreadyExists = Boolean(data?.alreadyExists || data?.data?.alreadyExists);
      if (path) {
        const title = alreadyExists ? 'Learning path already exists' : 'Learning path created';
        const body = alreadyExists
          ? 'You already have a pathway for this role. Open it to keep going.'
          : 'Tailored for the gaps on this role.';
        Alert.alert(title, body, [
          {
            text: 'View',
            onPress: () => navigation.navigate('Learning', { focusPathId: pathId }),
          },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Created', 'Open Learning Paths to view it.');
      }
    } catch (err) {
      const msg = err?.response?.data?.error ||
        'Could not generate a learning path. The learning service may be unavailable.';
      Alert.alert('Error', msg);
    } finally {
      setBridging(false);
    }
  };

  const fetchApplicationOptions = async () => {
    const oppId = resolvedId || opportunity?._id;
    if (!oppId) return;
    
    setLoadingOptions(true);
    try {
      const response = await opportunityAPI.getApplicationOptions(oppId);
      setApplicationOptions(response.data);
      if (response.data.hasApplied) {
        setApplied(true);
      }
    } catch (err) {
      console.log('Failed to fetch application options:', err);
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    if (!passedHasFullDetails && resolvedId) {
      fetchOpportunity();
    }
    fetchProfileAndScore();
    fetchApplicationOptions();
  }, [resolvedId]);

  const fetchOpportunity = async () => {
    try {
      const { data } = await opportunityAPI.getOne(resolvedId);
      setOpportunity(data.opportunity || data);
    } catch {
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
      if (resolvedId) {
        try {
          const scoreRes = await matchingAPI.getMatchScore(pid, resolvedId);
          const d = scoreRes.data;
          setMatchScore(d.score ?? d.matchScore ?? null);
          if (d.breakdown) setMatchBreakdown(d.breakdown);
          if (d.missingSkills) setMissingSkills(d.missingSkills);
        } catch (_) {}


        // Check if the worker already applied to this opportunity
        try {
          const appsRes = await applicationAPI.getMyApplications();
          const apps = appsRes.data.applications || appsRes.data || [];
          const alreadyApplied = apps.some((a) => {
            const appOppId = a.opportunityId?._id || a.opportunityId || '';
            return String(appOppId) === String(resolvedId);
          });
          if (alreadyApplied) setApplied(true);
        } catch (_) {}

        // Enrich the breakdown card with the learning-engine's alias hints
        // and proficiency shortfalls so the worker sees 'did you mean…?'
        // suggestions BEFORE committing to a pathway. Best-effort: a
        // failure here just hides the enrichment, never blocks the card.

        try {
          const gapsRes = await learningAPI.skillGaps(resolvedId);
          const g = gapsRes.data || {};
          if (Array.isArray(g.aliasHints)) setAliasHints(g.aliasHints);
          if (Array.isArray(g.proficiencyShortfalls)) setProficiencyShortfalls(g.proficiencyShortfalls);
        } catch (_) {}
      }
    } catch (_) {}
  };


 
  const handleApplyPress = () => {

  // ── Attachment helpers ────────────────────────────────────────────────────
  const MAX_ATTACHMENTS = 5;

  const pickDocument = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setAttachments((prev) => [
          ...prev,
          { name: asset.name, uri: asset.uri, type: asset.mimeType || 'application/octet-stream', size: asset.size },
        ]);
      }
    } catch {
      Alert.alert('Error', 'Could not pick document.');
    }
  };

  const pickImage = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const name = asset.uri.split('/').pop() || 'image.jpg';
      setAttachments((prev) => [
        ...prev,
        { name, uri: asset.uri, type: 'image/jpeg', size: asset.fileSize || 0 },
      ]);
    }
  };

  const showAttachmentOptions = () => {
    Alert.alert('Add Attachment', 'Choose what to attach', [
      { text: 'Document (PDF / Word)', onPress: pickDocument },
      { text: 'Photo from Gallery',    onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApply = async () => {

    if (!profileId) {
      Alert.alert('Profile Required', 'Please complete your profile before applying.');
      return;
    }
    if (applied) {
      Alert.alert('Already Applied', 'You have already applied to this opportunity.');
      return;
    }
    setShowMethodSelector(true);
  };

 const handleMethodSelect = (method) => {
  setShowMethodSelector(false);
  
  if (method.type === 'in_app') {
    navigation.navigate('ApplyForm', {
      opportunityId: resolvedId || opportunity?._id,
      opportunityTitle: opportunity?.title,
      requiredDocuments: opportunity?.requiredDocuments,
      customQuestions: opportunity?.customQuestions,
    });
  } else if (method.type === 'message') {
    navigation.navigate('ApplyMessage', {
      opportunityId: resolvedId || opportunity?._id,
      opportunityTitle: opportunity?.title,
      employerId: opportunity?.postedByUserId,
      instructions: method.instructions,
    });
  } else if (method.type === 'external_link') {
    navigation.navigate('ApplyExternal', {
      opportunityId: resolvedId || opportunity?._id,
      url: method.url,
      opportunityTitle: opportunity?.title,
    });
  }
};

  const handleApply = async () => {
    const submitOppId = resolvedId || opportunity?._id || opportunity?.id || opportunity?.opportunityId;
    if (!submitOppId) {
      Alert.alert('Error', 'Missing opportunity reference. Please reopen this opportunity.');
      return;
    }
    setApplying(true);
    try {
      // Upload each attachment to the server first so the employer gets a real URL
      const uploadedAttachments = [];
      for (const att of attachments) {
        try {
          const formData = new FormData();
          formData.append('file', {
            uri:  att.uri,
            name: att.name,
            type: att.type || 'application/octet-stream',
          });
          const { data } = await applicationAPI.uploadAttachment(formData);
          uploadedAttachments.push({
            fileName: data.fileName,
            fileUrl:  data.fileUrl,
            fileType: data.fileType,
          });
        } catch {
          // If upload fails, fall back to local URI so the application still submits
          uploadedAttachments.push({
            fileName: att.name,
            fileUrl:  att.uri,
            fileType: att.type,
          });
        }
      }

      await applicationAPI.apply({
        opportunityId: submitOppId,
        profileId,
        coverLetter: coverLetter.trim(),
        attachments: uploadedAttachments,
      });
      setApplied(true);
      setShowApplyForm(false);
      setAttachments([]);
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

  const MethodSelectorModal = () => {
    if (!showMethodSelector || !applicationOptions?.availableMethods) return null;
    
    const methods = applicationOptions.availableMethods;
    
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.methodSelectorCard}>
          <Text style={styles.methodSelectorTitle}>How would you like to apply?</Text>
          <Text style={styles.methodSelectorSubtitle}>
            Choose your preferred application method for {opportunity?.title}
          </Text>
          
          {methods.map((method) => (
            <TouchableOpacity
              key={method.type}
              style={styles.methodOption}
              onPress={() => handleMethodSelect(method)}
            >
              <View style={[styles.methodIcon, { backgroundColor: method.color + '20' }]}>
                <Ionicons name={method.icon} size={24} color={method.color} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodName}>{method.label}</Text>
                <Text style={styles.methodDescription}>{method.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
          
          <TouchableOpacity
            style={styles.methodCancelButton}
            onPress={() => setShowMethodSelector(false)}
          >
            <Text style={styles.methodCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

 
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

 
  if (error || !opportunity) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
    <>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.headerSection}>
            <View style={styles.headerTop}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={22} color="#1F2937" />
              </TouchableOpacity>

              <View style={styles.headerRight}>
                {matchScore != null && (
                  <View style={styles.matchBadge}>
                    <Ionicons name="sparkles" size={14} color="#F97316" />
                    <Text style={styles.matchText}>{Math.round(matchScore)}% Match</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => setShowReport(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
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

          {/* Match Breakdown */}
          {matchScore != null && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Match Breakdown</Text>
              <View style={styles.breakdownCard}>
                <View style={styles.scoreBarRow}>
                  <Text style={styles.scoreBarLabel}>Overall Match</Text>
                  <Text style={styles.scoreBarValue}>{Math.round(matchScore)}%</Text>
                </View>
                <View style={styles.scoreBarTrack}>
                  <View
                    style={[
                      styles.scoreBarFill,
                      {
                        flex: Math.min(Math.round(matchScore), 100),
                        backgroundColor:
                          matchScore >= 60 ? '#10B981' : matchScore >= 30 ? '#F97316' : '#EF4444',
                      },
                    ]}
                  />
                  <View style={{ flex: 100 - Math.min(Math.round(matchScore), 100) }} />
                </View>

                {matchBreakdown && (
                  <View style={styles.signalList}>
                    <SignalRow
                      icon="code-slash-outline"
                      label="Skill match"
                      value={`${matchBreakdown.cosineScore ?? 0}%`}
                      pass={(matchBreakdown.cosineScore ?? 0) > 0}
                    />
                    <SignalRow
                      icon="location-outline"
                      label="Location"
                      value={matchBreakdown.locationMatch ? 'Match' : 'No match'}
                      pass={matchBreakdown.locationMatch}
                    />
                    <SignalRow
                      icon="cash-outline"
                      label="Salary fit"
                      value={matchBreakdown.salaryFit ? 'Within range' : 'Outside range'}
                      pass={matchBreakdown.salaryFit}
                    />
                    <SignalRow
                      icon="trophy-outline"
                      label="Experience level"
                      value={matchBreakdown.expFit ? 'Meets requirement' : 'Below requirement'}
                      pass={matchBreakdown.expFit}
                    />
                    <SignalRow
                      icon="checkmark-circle-outline"
                      label="Skills you have"
                      value={`${matchBreakdown.skillOverlap ?? 0} of ${
                        (matchBreakdown.skillOverlap ?? 0) + (matchBreakdown.skillGap ?? 0)
                      }`}
                      pass={(matchBreakdown.skillOverlap ?? 0) > 0}
                    />
                  </View>
                )}

                {missingSkills.length > 0 && (
                  <View style={styles.missingSection}>
                    <View style={styles.missingTitleRow}>
                      <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                      <Text style={styles.missingTitle}>Skills you are missing</Text>
                    </View>
                    <View style={styles.missingChips}>
                      {missingSkills.map((skill) => (
                        <View key={skill} style={styles.missingChip}>
                          <Text style={styles.missingChipText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.missingHint}>
                      Add these skills to your profile or bridge a learning path to improve your
                      score.
                    </Text>

                    {aliasHints.length > 0 && (
                      <View style={styles.hintsBlock}>
                        <Text style={styles.hintsHeader}>Did you mean…?</Text>
                        {aliasHints.slice(0, 3).map((h, i) => (
                          <Text key={`alias-${i}`} style={styles.hintItem}>
                            • You may already have{' '}
                            <Text style={styles.hintStrong}>{h.missingSkill}</Text> as{' '}
                            <Text style={styles.hintStrong}>{h.youMayAlreadyHave}</Text>.
                            {h.suggestion ? ` ${h.suggestion}` : ''}
                          </Text>
                        ))}
                      </View>
                    )}

                    {proficiencyShortfalls.length > 0 && (
                      <View style={styles.shortfallsBlock}>
                        <Text style={styles.hintsHeader}>Level up</Text>
                        {proficiencyShortfalls.slice(0, 3).map((p, i) => (
                          <Text key={`pf-${i}`} style={styles.hintItem}>
                            • <Text style={styles.hintStrong}>{p.skill}</Text> — you're at{' '}
                            <Text style={styles.hintStrong}>{p.current}</Text>, role needs{' '}
                            <Text style={styles.hintStrong}>{p.required}</Text>.
                          </Text>
                        ))}
                      </View>
                    )}

                    <TouchableOpacity
                      style={[styles.bridgeButton, bridging && styles.bridgeButtonDisabled]}
                      onPress={handleBridgeSkillGap}
                      disabled={bridging}
                      activeOpacity={0.8}
                    >
                      {bridging ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                          <Text style={styles.bridgeButtonText}>Bridge a skill gap</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* In-App Apply Form */}
          {showApplyForm && !applied && (
            <View style={styles.applyForm}>
              <Text style={styles.sectionTitle}>Cover Letter (Optional)</Text>

              {/* Cover letter input with attachment icon inside */}
              <View style={styles.coverLetterWrapper}>
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
                {/* Attachment icon — bottom-right of the text area */}
                <TouchableOpacity
                  style={styles.attachIconBtn}
                  onPress={showAttachmentOptions}
                  activeOpacity={0.7}
                >
                  <Ionicons name="attach" size={20} color="#F97316" />
                </TouchableOpacity>
              </View>

              {/* Attachment chips */}
              {attachments.length > 0 && (
                <View style={styles.attachmentList}>
                  {attachments.map((att, idx) => (
                    <View key={idx} style={styles.attachmentChip}>
                      <Ionicons
                        name={att.type?.startsWith('image') ? 'image-outline' : 'document-outline'}
                        size={14}
                        color="#F97316"
                      />
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {att.name}
                      </Text>
                      <TouchableOpacity onPress={() => removeAttachment(idx)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Helper text */}
              <Text style={styles.attachHint}>
                <Ionicons name="attach" size={12} color="#9CA3AF" /> Tap the clip icon to attach documents or photos (up to 5)
              </Text>

              <View style={styles.applyFormButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => { setShowApplyForm(false); setAttachments([]); }}
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

          {/* Report link */}
          <TouchableOpacity
            style={styles.reportLink}
            onPress={() => setShowReport(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="flag-outline" size={14} color="#9CA3AF" />
            <Text style={styles.reportLinkText}>Report this job posting</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Bottom Apply Button */}
        {!showApplyForm && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.applyButton, applied && styles.appliedButton]}
              onPress={handleApplyPress}
              disabled={applied}
            >
              <Ionicons
                name={applied ? 'checkmark-circle' : 'paper-plane-outline'}
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.applyButtonText}>{applied ? 'Applied' : 'Apply Now'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* Method Selector Modal */}
      <MethodSelectorModal />

      {/* Report bottom sheet */}
      <ReportBottomSheet
        visible={showReport}
        onClose={() => setShowReport(false)}
        targetId={resolvedId}
        targetType="opportunity"
        targetLabel={title ? `"${title}"` : 'this job posting'}
      />
    </>
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
    paddingBottom: 120,
  },

  // Header
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  menuButton: {
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

  // Info cards
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

  // Sections
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

  // Apply form
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
    paddingBottom: 36,   // extra bottom padding so text doesn't hide behind the icon
    fontSize: 15,
    color: '#1F2937',
    minHeight: 120,
  },
  coverLetterWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  attachIconBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#FDBA74',
    maxWidth: 200,
  },
  attachmentName: {
    flex: 1,
    fontSize: 12,
    color: '#EA580C',
    fontWeight: '500',
  },
  attachHint: {
    fontSize: 11,
    color: '#9CA3AF',
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

  // Method Selector Modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  methodSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  methodSelectorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  methodSelectorSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  methodDescription: {
    fontSize: 12,
    color: '#6B7280',
  },
  methodCancelButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  methodCancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#9CA3AF',
  },

  // Report link
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 16,
    marginBottom: 8,
  },
  reportLinkText: {
    fontSize: 13,
    color: '#9CA3AF',
  },

  // Bottom bar
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

  // Match Breakdown
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  scoreBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreBarLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  scoreBarValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  scoreBarTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  scoreBarFill: {
    borderRadius: 4,
  },
  signalList: {
    gap: 10,
  },
  signalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  signalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalLabel: {
    fontSize: 14,
    color: '#374151',
  },
  signalBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  signalValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  missingSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  missingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  missingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  missingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  missingChip: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  missingChipText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
  missingHint: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 17,
  },
  hintsBlock: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  shortfallsBlock: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  hintsHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hintItem: {
    fontSize: 12,
    color: '#14532D',
    lineHeight: 17,
    marginTop: 2,
  },
  hintStrong: {
    fontWeight: '700',
  },
  bridgeButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F97316',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  bridgeButtonDisabled: {
    backgroundColor: '#FDBA74',
  },
  bridgeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default OpportunityDetailScreen;