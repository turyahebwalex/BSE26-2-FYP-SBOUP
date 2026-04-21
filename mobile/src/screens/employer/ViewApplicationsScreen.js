import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { applicationAPI } from '../../services/api';

const STATUS_ACTIONS = [
  { key: 'under_review', label: 'Review', icon: 'eye-outline', color: '#3B82F6' },
  { key: 'shortlisted', label: 'Shortlist', icon: 'star-outline', color: '#8B5CF6' },
  { key: 'interview_scheduled', label: 'Interview', icon: 'calendar-outline', color: '#D97706' },
  { key: 'offer_extended', label: 'Offer', icon: 'checkmark-circle-outline', color: '#059669' },
  { key: 'rejected', label: 'Reject', icon: 'close-circle-outline', color: '#EF4444' },
];

const ViewApplicationsScreen = ({ route, navigation }) => {
  const { opportunityId, opportunityTitle } = route.params || {};
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchApplications = useCallback(async () => {
    try {
      setError(null);
      const { data } = await applicationAPI.getForOpportunity(opportunityId);
      const list = data.applications || data.data || data || [];
      setApplications(Array.isArray(list) ? list : []);
    } catch (err) {
      setError('Failed to load applications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchApplications();
  };

  const handleStatusUpdate = async (applicationId, newStatus, applicantName) => {
    Alert.alert(
      'Update Status',
      `Set ${applicantName}'s application to "${newStatus.replace('_', ' ')}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await applicationAPI.updateStatus(applicationId, newStatus);
              Alert.alert('Success', 'Application status updated.');
              fetchApplications();
            } catch (err) {
              Alert.alert('Error', 'Failed to update status.');
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    const colors = {
      submitted: '#6B7280',
      under_review: '#3B82F6',
      shortlisted: '#8B5CF6',
      interview_scheduled: '#D97706',
      rejected: '#EF4444',
      offer_extended: '#059669',
      withdrawn: '#9CA3AF',
    };
    return colors[status] || '#6B7280';
  };

  const renderApplication = ({ item }) => {
    const appId = item._id || item.id;
    const profile = item.profileId || {};
    const applicant = profile.userId || {};
    const applicantName = applicant.fullName || applicant.email || 'Applicant';
    const applicantEmail = applicant.email || '';
    const profileTitle = profile.title || '';
    const status = item.status || 'submitted';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.applicantInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {applicantName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.applicantText}>
              <Text style={styles.applicantName}>{applicantName}</Text>
              {profileTitle ? (
                <Text style={styles.applicantTitle}>{profileTitle}</Text>
              ) : null}
              {applicantEmail ? (
                <Text style={styles.applicantEmail}>{applicantEmail}</Text>
              ) : null}
            </View>
          </View>
          {item.matchScore != null && (
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>{Math.round(item.matchScore)}%</Text>
            </View>
          )}
        </View>

        {/* Current Status */}
        <View style={styles.currentStatusRow}>
          <Text style={styles.statusLabel}>Status: </Text>
          <Text style={[styles.statusValue, { color: getStatusColor(status) }]}>
            {status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
          </Text>
        </View>

        {/* Cover Letter */}
        {item.coverLetter && (
          <View style={styles.coverLetterSection}>
            <Text style={styles.coverLetterLabel}>Cover Letter</Text>
            <Text style={styles.coverLetterText} numberOfLines={3}>
              {item.coverLetter}
            </Text>
          </View>
        )}

        {/* Applied Date */}
        {item.submittedAt && (
          <Text style={styles.dateText}>
            Applied{' '}
            {new Date(item.submittedAt).toLocaleDateString('en-UG', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          {STATUS_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.actionButton,
                status === action.key && styles.actionButtonActive,
              ]}
              onPress={() => handleStatusUpdate(appId, action.key, applicantName)}
              disabled={status === action.key}
            >
              <Ionicons
                name={action.icon}
                size={14}
                color={status === action.key ? '#9CA3AF' : action.color}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: status === action.key ? '#9CA3AF' : action.color },
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.screenTitle} numberOfLines={1}>
            Applications
          </Text>
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerTitleSection}>
          <Text style={styles.screenTitle} numberOfLines={1}>
            Applications
          </Text>
          {opportunityTitle && (
            <Text style={styles.screenSubtitle} numberOfLines={1}>
              {opportunityTitle}
            </Text>
          )}
        </View>
        <View style={styles.backButton} />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={applications}
        keyExtractor={(item) => item._id || item.id || Math.random().toString()}
        renderItem={renderApplication}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Applications</Text>
            <Text style={styles.emptyText}>
              No one has applied to this opportunity yet.
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
  header: {
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
  headerTitleSection: {
    flex: 1,
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
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
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  applicantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  applicantText: {
    flex: 1,
  },
  applicantName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  applicantTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  applicantEmail: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 1,
  },
  matchBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#F97316',
  },
  matchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F97316',
  },
  currentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  coverLetterSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  coverLetterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  coverLetterText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionButtonActive: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
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
  },
});

export default ViewApplicationsScreen;
