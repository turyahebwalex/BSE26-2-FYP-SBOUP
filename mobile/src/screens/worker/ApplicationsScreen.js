import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { applicationAPI } from '../../services/api';

const STATUS_CONFIG = {
  submitted: { label: 'Submitted', bg: '#F3F4F6', text: '#6B7280', icon: 'time-outline' },
  under_review: { label: 'Under Review', bg: '#DBEAFE', text: '#1D4ED8', icon: 'eye-outline' },
  interview_scheduled: { label: 'Interview', bg: '#FEF3C7', text: '#D97706', icon: 'calendar-outline' },
  rejected: { label: 'Rejected', bg: '#FEE2E2', text: '#DC2626', icon: 'close-circle-outline' },
  offer_extended: { label: 'Offer', bg: '#D1FAE5', text: '#059669', icon: 'checkmark-circle-outline' },
  withdrawn: { label: 'Withdrawn', bg: '#F3F4F6', text: '#9CA3AF', icon: 'return-down-back-outline' },
};

const ApplicationsScreen = ({ navigation }) => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchApplications = useCallback(async () => {
    try {
      setError(null);
      const { data } = await applicationAPI.getMyApplications();
      const list = data.applications || data.data || data || [];
      setApplications(Array.isArray(list) ? list : []);
    } catch (err) {
      setError('Failed to load applications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchApplications();
  };

  const renderApplication = ({ item }) => {
    const opportunity = item.opportunity || {};
    const status = item.status || 'submitted';
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.submitted;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          navigation.navigate('OpportunityDetail', {
            opportunityId: opportunity._id || opportunity.id || item.opportunityId,
            opportunity,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleSection}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {opportunity.title || 'Opportunity'}
            </Text>
            <Text style={styles.cardCompany} numberOfLines={1}>
              {opportunity.company || opportunity.employer?.fullName || 'Company'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon} size={12} color={config.text} />
            <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          {item.matchScore != null && (
            <View style={styles.metaItem}>
              <Ionicons name="sparkles-outline" size={14} color="#F97316" />
              <Text style={styles.metaText}>{Math.round(item.matchScore)}% match</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color="#9CA3AF" />
            <Text style={styles.metaText}>
              Applied{' '}
              {item.createdAt
                ? new Date(item.createdAt).toLocaleDateString('en-UG', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Recently'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>My Applications</Text>
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
        <Text style={styles.screenTitle}>My Applications</Text>
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
            <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Applications Yet</Text>
            <Text style={styles.emptyText}>
              Browse opportunities and apply to get started.
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
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardTitleSection: {
    flex: 1,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 3,
  },
  cardCompany: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#9CA3AF',
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

export default ApplicationsScreen;
