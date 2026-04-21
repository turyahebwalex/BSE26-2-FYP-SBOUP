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
import { learningAPI } from '../../services/api';

const LearningScreen = ({ navigation }) => {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedPath, setExpandedPath] = useState(null);
  const [error, setError] = useState(null);
  const [generateModalVisible, setGenerateModalVisible] = useState(false);
  const [targetSkill, setTargetSkill] = useState('');
  const [generating, setGenerating] = useState(false);

  const fetchPaths = useCallback(async () => {
    try {
      setError(null);
      const { data } = await learningAPI.getMine();
      const list = data.learningPaths || data.paths || data.data || data || [];
      setPaths(Array.isArray(list) ? list : []);
    } catch (err) {
      setError('Failed to load learning paths.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPaths();
  }, [fetchPaths]);

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
      await learningAPI.generate(skill);
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

        {/* Expanded Resources */}
        {isExpanded && resources.length > 0 && (
          <View style={styles.resourcesList}>
            {resources.map((resource, index) => {
              const isCompleted = resource.isCompleted || resource.completed;
              return (
                <View key={resource._id || resource.id || index} style={styles.resourceItem}>
                  <View style={styles.resourceLeft}>
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
                      {resource.type && (
                        <Text style={styles.resourceType}>{resource.type}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.resourceActions}>
                    {resource.url && (
                      <TouchableOpacity
                        onPress={() => handleOpenLink(resource.url)}
                        style={styles.resourceLinkButton}
                      >
                        <Ionicons name="open-outline" size={16} color="#3B82F6" />
                      </TouchableOpacity>
                    )}
                    {!isCompleted && (
                      <TouchableOpacity
                        onPress={() => handleUpdateProgress(pathId, index)}
                        style={styles.completeButton}
                      >
                        <Text style={styles.completeButtonText}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {isExpanded && resources.length === 0 && (
          <View style={styles.noResources}>
            <Text style={styles.noResourcesText}>No resources available yet.</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
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
    <SafeAreaView style={styles.container}>
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
  resourcesList: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  resourceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  resourceTextSection: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: 14,
    color: '#374151',
  },
  resourceTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  resourceType: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  resourceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resourceLinkButton: {
    padding: 4,
  },
  completeButton: {
    backgroundColor: '#F97316',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  completeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
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
