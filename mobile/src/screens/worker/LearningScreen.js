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

  const toggleExpand = (pathId) => {
    setExpandedPath((prev) => (prev === pathId ? null : pathId));
  };

  const handleUpdateProgress = async (pathId, resourceId) => {
    try {
      await learningAPI.updateProgress(pathId, resourceId, 100);
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
              const isCompleted = resource.completed || resource.progress === 100;
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
                        onPress={() =>
                          handleUpdateProgress(pathId, resource._id || resource.id)
                        }
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
        <View style={styles.backButton} />
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
              Learning paths will appear here when you start developing new skills.
            </Text>
          </View>
        }
      />
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
});

export default LearningScreen;
