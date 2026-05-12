import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { learningAPI } from '../../services/api';

const LearningScreen = ({ navigation, route }) => {
  // route.params.focusPathId — auto-expand this path id when the screen
  // mounts. Set by OpportunityDetail's Bridge-a-skill-gap CTA so the
  // worker sees the just-created pathway, not the generic list.
  // route.params.prefillSkill — pre-fill the generate modal with this
  // skill name. Set by WorkerDashboard's Close-Your-Skill-Gaps card.
  const focusPathId = route?.params?.focusPathId || null;
  const prefillSkill = route?.params?.prefillSkill || null;

  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPath, setExpandedPath] = useState(focusPathId);
  const [error, setError] = useState(null);
  const [generateModalVisible, setGenerateModalVisible] = useState(Boolean(prefillSkill));
  const [targetSkill, setTargetSkill] = useState(prefillSkill || '');
  const [generating, setGenerating] = useState(false);
  // autoSuggesting is shown as a small inline banner while the server is
  // composing paths from the worker's matching-engine recommendations.
  // The banner stays out of the empty-state CTA so the user can still
  // generate manually if they prefer.
  const [autoSuggesting, setAutoSuggesting] = useState(false);
  const [autoSuggestTried, setAutoSuggestTried] = useState(false);

  const fetchPaths = useCallback(async () => {
    try {
      setError(null);
      const { data } = await learningAPI.getMine();
      const list = data.learningPaths || data.paths || data.data || data || [];
      setPaths(Array.isArray(list) ? list : []);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      setError('Failed to load learning paths.');
      return [];
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-suggest is best-effort: it generates paths from the worker's top
  // missing skills (matching-engine recommendations → dashboard-fit). We
  // only trigger it once per mount when the worker has fewer than 3 paths,
  // so revisiting a populated list doesn't keep churning the AI service.
  const runAutoSuggest = useCallback(async () => {
    if (autoSuggestTried) return;
    setAutoSuggestTried(true);
    setAutoSuggesting(true);
    try {
      const { data } = await learningAPI.autoSuggest({ max: 3 });
      if (data?.generated > 0) {
        await fetchPaths();
      }
    } catch (err) {
      // Silent: the manual generate flow still works, and the empty state
      // CTA tells the worker what to do next.
    } finally {
      setAutoSuggesting(false);
    }
  }, [autoSuggestTried, fetchPaths]);

  useEffect(() => {
    (async () => {
      const list = await fetchPaths();
      if (list.length < 3) {
        runAutoSuggest();
      }
    })();
    // Intentionally run only on mount. fetchPaths/runAutoSuggest identities
    // change with state but we don't want to re-trigger auto-suggest each
    // time — useFocusEffect below handles refetch on screen focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to navigation params changing between visits — e.g. worker
  // bridges path A, navigates back, bridges path B; React Navigation
  // re-uses the LearningScreen instance, so we sync state explicitly.
  useEffect(() => {
    if (focusPathId) setExpandedPath(focusPathId);
  }, [focusPathId]);

  useEffect(() => {
    if (prefillSkill) {
      setTargetSkill(prefillSkill);
      setGenerateModalVisible(true);
    }
  }, [prefillSkill]);

  // Refetch when the screen comes back into focus — covers the
  // OpportunityDetail 'Bridge a skill gap' flow, which generates a
  // new LearningPath in another screen and navigates here.
  useFocusEffect(
    useCallback(() => {
      fetchPaths();
    }, [fetchPaths])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPaths();
  };

  const handleGenerate = async () => {
    const skill = targetSkill.trim();
    if (skill.length < 2) {
      Alert.alert('Invalid', 'Please enter a skill name (min 2 characters).');
      return;
    }
    setGenerating(true);
    try {
      await learningAPI.generate({ targetSkill: skill });
      setTargetSkill('');
      setGenerateModalVisible(false);
      Alert.alert('Success', 'Learning path generated.');
      fetchPaths();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        'Failed to generate learning path. The service may be unavailable.';
      Alert.alert('Error', msg);
    } finally {
      setGenerating(false);
    }
  };

  const toggleExpand = (pathId) => {
    setExpandedPath((prev) => (prev === pathId ? null : pathId));
  };

  const handleUpdateProgress = async (pathId, resourceIndex) => {
    try {
      await learningAPI.updateProgress(pathId, resourceIndex, true);
      Alert.alert('Progress Updated', 'Resource marked as completed!');
      fetchPaths();
    } catch (err) {
      Alert.alert('Error', 'Failed to update progress.');
    }
  };

  const handleOpenLink = async (url) => {
    if (url) {
      try {
        await Linking.openURL(url);
      } catch {
        Alert.alert('Error', 'Could not open the link.');
      }
    }
  };

  const getProgressPercentage = (path) => {
    const resources = path.resources || [];
    if (resources.length === 0) return 0;
    const completed = resources.filter(
      (r) => r.completed || r.progress === 100
    ).length;
    return Math.round((completed / resources.length) * 100);
  };

  const renderPath = ({ item }) => {
    const pathId = item._id || item.id;
    const isExpanded = expandedPath === pathId;
    const progress = getProgressPercentage(item);
    const resources = item.resources || [];
    const targetSkill = item.targetSkill || item.skill || {};
    const skillName = typeof targetSkill === 'string' ? targetSkill : targetSkill.name || 'Skill';
    const criticalGapCount = Number(item.criticalGapCount || 0);
    const missingSkills = Array.isArray(item.missingSkills) ? item.missingSkills : [];
    const aliasHints = Array.isArray(item.aliasHints) ? item.aliasHints : [];
    const consistencyMode = item.consistencyMode || 'standalone';

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => toggleExpand(pathId)}
          activeOpacity={0.7}
        >
          <View style={styles.cardInfo}>
            <View style={styles.skillBadge}>
              <Ionicons name="school-outline" size={16} color="#F97316" />
            </View>
            <View style={styles.cardTextSection}>
              <Text style={styles.cardTitle}>{skillName}</Text>
              <Text style={styles.cardSubtitle}>
                {resources.length} {resources.length === 1 ? 'resource' : 'resources'}
                {criticalGapCount > 0 && ` • ${criticalGapCount} critical ${criticalGapCount === 1 ? 'gap' : 'gaps'}`}
              </Text>
            </View>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.progressLabel}>{progress}%</Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#9CA3AF"
            />
          </View>
        </TouchableOpacity>

        {/* Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${progress}%` },
                progress === 100 && styles.progressBarComplete,
              ]}
            />
          </View>
        </View>

        {/* Expanded — rich rationale + per-resource panels */}
        {isExpanded && (
          <View style={styles.expandedSection}>
            {/* Pathway rationale (Flan-T5 header) */}
            {!!item.pathwayRationale && (
              <View style={styles.rationaleBlock}>
                <View style={styles.rationaleHeader}>
                  <Ionicons name="sparkles" size={14} color="#F97316" />
                  <Text style={styles.rationaleLabel}>Why this pathway</Text>
                </View>
                <Text style={styles.rationaleText}>{item.pathwayRationale}</Text>
              </View>
            )}

            {/* Analysis summary banner */}
            {!!item.analysisSummary && (
              <View style={styles.analysisBanner}>
                <Ionicons name="information-circle-outline" size={16} color="#0369A1" />
                <Text style={styles.analysisText}>{item.analysisSummary}</Text>
              </View>
            )}

            {/* Missing skill chips */}
            {missingSkills.length > 0 && (
              <View style={styles.chipRow}>
                {missingSkills.slice(0, 5).map((s, i) => (
                  <View key={`miss-${i}`} style={styles.missingChip}>
                    <Text style={styles.missingChipText}>{s}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Alias hints — "you may already have it as…" */}
            {aliasHints.length > 0 && (
              <View style={styles.hintsBlock}>
                <Text style={styles.hintsHeader}>Did you mean…?</Text>
                {aliasHints.slice(0, 3).map((h, i) => (
                  <Text key={`hint-${i}`} style={styles.hintItem}>
                    • You may already have <Text style={styles.hintStrong}>{h.missingSkill}</Text> as{' '}
                    <Text style={styles.hintStrong}>{h.youMayAlreadyHave}</Text>. {h.suggestion || ''}
                  </Text>
                ))}
              </View>
            )}

            {/* Fallback marker — be honest when the matching-engine was down */}
            {consistencyMode === 'fallback' && (
              <Text style={styles.fallbackNote}>
                Generated in fallback mode — the match-breakdown card may differ slightly.
              </Text>
            )}

            {/* Resources */}
            {resources.length > 0 ? (
              <View style={styles.resourcesList}>
                {resources.map((resource, index) => {
                  const isCompleted = resource.isCompleted || resource.completed;
                  const isFree = Number(resource.cost || 0) === 0;
                  const priceLabel = resource.priceLabel || (isFree ? 'Free' : null);
                  return (
                    <View key={resource._id || resource.id || resource.url || index} style={styles.resourceItem}>
                      <View style={styles.resourceTopRow}>
                        <Ionicons
                          name={isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
                          size={20}
                          color={isCompleted ? '#10B981' : '#D1D5DB'}
                        />
                        <View style={styles.resourceTextSection}>
                          <Text
                            style={[
                              styles.resourceTitle,
                              isCompleted && styles.resourceTitleCompleted,
                            ]}
                            numberOfLines={2}
                          >
                            {resource.title || resource.name || `Resource ${index + 1}`}
                          </Text>
                          <View style={styles.metaRow}>
                            {!!resource.provider && (
                              <Text style={styles.metaText}>{resource.provider}</Text>
                            )}
                            {!!resource.type && (
                              <Text style={styles.metaDot}>·</Text>
                            )}
                            {!!resource.type && (
                              <Text style={styles.metaText}>{resource.type}</Text>
                            )}
                            {!!resource.estimatedDuration && (
                              <>
                                <Text style={styles.metaDot}>·</Text>
                                <Text style={styles.metaText}>{resource.estimatedDuration}</Text>
                              </>
                            )}
                            {typeof resource.rating === 'number' && resource.rating > 0 && (
                              <>
                                <Text style={styles.metaDot}>·</Text>
                                <Ionicons name="star" size={11} color="#F59E0B" />
                                <Text style={styles.metaText}>{resource.rating.toFixed(1)}</Text>
                              </>
                            )}
                          </View>
                          <View style={styles.pillRow}>
                            {priceLabel && (
                              <View style={[styles.pill, isFree ? styles.pillFree : styles.pillPaid]}>
                                <Text style={[styles.pillText, isFree ? styles.pillFreeText : styles.pillPaidText]}>
                                  {priceLabel}
                                </Text>
                              </View>
                            )}
                            {!!resource.difficultyLevel && (
                              <View style={styles.pill}>
                                <Text style={styles.pillText}>{resource.difficultyLevel}</Text>
                              </View>
                            )}
                            {!!resource.bridgesSkill && (
                              <View style={[styles.pill, styles.pillBridge]}>
                                <Ionicons name="git-merge-outline" size={10} color="#7C3AED" />
                                <Text style={[styles.pillText, styles.pillBridgeText]}>
                                  bridges {resource.bridgesSkill}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* WHY THIS COURSE? panel — §6.2.4 panel D */}
                      {!!resource.whyThisCourse && (
                        <View style={styles.whyBlock}>
                          <Text style={styles.whyLabel}>WHY THIS COURSE?</Text>
                          <Text style={styles.whyText}>{resource.whyThisCourse}</Text>
                        </View>
                      )}

                      <View style={styles.resourceActions}>
                        {resource.url && (
                          <TouchableOpacity
                            onPress={() => handleOpenLink(resource.url)}
                            style={styles.openButton}
                          >
                            <Ionicons name="open-outline" size={14} color="#3B82F6" />
                            <Text style={styles.openButtonText}>Open</Text>
                          </TouchableOpacity>
                        )}
                        {!isCompleted && (
                          <TouchableOpacity
                            onPress={() => handleUpdateProgress(pathId, index)}
                            style={styles.completeButton}
                          >
                            <Text style={styles.completeButtonText}>Mark done</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noResources}>
                <Text style={styles.noResourcesText}>No resources available yet.</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Learning Paths</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Learning Paths</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setGenerateModalVisible(true)}
        >
          <Ionicons name="add-circle-outline" size={24} color="#F97316" />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {autoSuggesting && (
        <View style={styles.autoBanner}>
          <ActivityIndicator size="small" color="#F97316" />
          <Text style={styles.autoBannerText}>
            Personalising paths from your top skill gaps…
          </Text>
        </View>
      )}

      <FlatList
        data={paths}
        keyExtractor={(item) => item._id || item.id || Math.random().toString()}
        renderItem={renderPath}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="school-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Learning Paths</Text>
            <Text style={styles.emptyText}>
              Tap the + icon above to generate a personalised learning path for any skill.
            </Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              onPress={() => setGenerateModalVisible(true)}
            >
              <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
              <Text style={styles.emptyCTAText}>Generate My First Path</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal
        transparent
        visible={generateModalVisible}
        animationType="fade"
        onRequestClose={() => !generating && setGenerateModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Generate Learning Path</Text>
              <TouchableOpacity
                onPress={() => !generating && setGenerateModalVisible(false)}
                disabled={generating}
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Enter a skill you want to learn. We will recommend resources tailored to you.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. React Native, Carpentry, Digital Marketing"
              placeholderTextColor="#9CA3AF"
              value={targetSkill}
              onChangeText={setTargetSkill}
              editable={!generating}
              autoFocus
              maxLength={60}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setGenerateModalVisible(false)}
                disabled={generating}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalGenerateBtn,
                  (generating || targetSkill.trim().length < 2) &&
                    styles.modalGenerateBtnDisabled,
                ]}
                onPress={handleGenerate}
                disabled={generating || targetSkill.trim().length < 2}
              >
                {generating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.modalGenerateText}>Generate</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    marginHorizontal: 20,
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
  },
  autoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  autoBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#9A3412',
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 8,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  skillBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextSection: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F97316',
  },
  progressBarContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F97316',
    borderRadius: 3,
  },
  progressBarComplete: {
    backgroundColor: '#10B981',
  },
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  rationaleBlock: {
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  rationaleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  rationaleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9A3412',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rationaleText: {
    fontSize: 13,
    color: '#7C2D12',
    lineHeight: 18,
  },
  analysisBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  analysisText: {
    flex: 1,
    fontSize: 12,
    color: '#0C4A6E',
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  missingChip: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  missingChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B91C1C',
  },
  hintsBlock: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
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
  fallbackNote: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#92400E',
    marginBottom: 8,
  },
  resourcesList: {
    marginTop: 4,
  },
  resourceItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  resourceTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  resourceTextSection: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  resourceTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
    color: '#6B7280',
  },
  metaDot: {
    fontSize: 11,
    color: '#9CA3AF',
    marginHorizontal: 2,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
  },
  pillFree: {
    backgroundColor: '#DCFCE7',
  },
  pillFreeText: {
    color: '#166534',
  },
  pillPaid: {
    backgroundColor: '#FEF3C7',
  },
  pillPaidText: {
    color: '#92400E',
  },
  pillBridge: {
    backgroundColor: '#EDE9FE',
  },
  pillBridgeText: {
    color: '#5B21B6',
    textTransform: 'none',
  },
  whyBlock: {
    marginTop: 8,
    marginLeft: 30,
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 2,
    borderLeftColor: '#F97316',
    paddingLeft: 10,
    paddingVertical: 6,
    paddingRight: 8,
    borderRadius: 4,
  },
  whyLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9A3412',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  whyText: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 16,
  },
  resourceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginLeft: 30,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 6,
  },
  openButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
  },
  completeButton: {
    backgroundColor: '#F97316',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  noResources: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    padding: 16,
  },
  noResourcesText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  emptyCTA: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F97316',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyCTAText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '500',
  },
  modalGenerateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F97316',
  },
  modalGenerateBtnDisabled: {
    backgroundColor: '#FDBA74',
  },
  modalGenerateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LearningScreen;
