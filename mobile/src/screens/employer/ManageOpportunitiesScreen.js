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
import { opportunityAPI } from '../../services/api';

const ManageOpportunitiesScreen = ({ navigation }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchOpportunities = useCallback(async () => {
    try {
      setError(null);
      const { data } = await opportunityAPI.getMyOpportunities();
      const list = data.opportunities || data.data || data || [];
      setOpportunities(Array.isArray(list) ? list : []);
    } catch (err) {
      setError('Failed to load opportunities.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOpportunities();
  };

  const handleArchive = (oppId, oppTitle) => {
    Alert.alert(
      'Archive Opportunity',
      `Are you sure you want to archive "${oppTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await opportunityAPI.update(oppId, { status: 'archived' });
              fetchOpportunities();
            } catch {
              Alert.alert('Error', 'Failed to archive opportunity.');
            }
          },
        },
      ]
    );
  };

  const renderOpportunity = ({ item }) => {
    const oppId = item._id || item.id;
    const isActive = item.status === 'active' || item.status === 'open' || !item.status;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleSection}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardType}>
              {(item.type || 'formal').charAt(0).toUpperCase() +
                (item.type || 'formal').slice(1)}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isActive ? '#D1FAE5' : '#F3F4F6',
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: isActive ? '#059669' : '#9CA3AF' },
              ]}
            >
              {isActive ? 'Active' : item.status || 'Inactive'}
            </Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={14} color="#6B7280" />
            <Text style={styles.metaText}>
              {item.applicationCount || item.applicants || 0} applicants
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            <Text style={styles.metaText}>{item.location || 'Uganda'}</Text>
          </View>
          {item.deadline && (
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color="#6B7280" />
              <Text style={styles.metaText}>
                {new Date(item.deadline).toLocaleDateString('en-UG', {
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              navigation.navigate('ViewApplications', {
                opportunityId: oppId,
                opportunityTitle: item.title,
              })
            }
          >
            <Ionicons name="people-outline" size={16} color="#3B82F6" />
            <Text style={[styles.actionText, { color: '#3B82F6' }]}>
              View Applicants
            </Text>
          </TouchableOpacity>

          {isActive && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleArchive(oppId, item.title)}
            >
              <Ionicons name="archive-outline" size={16} color="#EF4444" />
              <Text style={[styles.actionText, { color: '#EF4444' }]}>Archive</Text>
            </TouchableOpacity>
          )}
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
          <Text style={styles.screenTitle}>Manage Opportunities</Text>
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
        <Text style={styles.screenTitle}>Manage Opportunities</Text>
        <View style={styles.backButton} />
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={opportunities}
        keyExtractor={(item) => item._id || item.id || Math.random().toString()}
        renderItem={renderOpportunity}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="briefcase-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Opportunities</Text>
            <Text style={styles.emptyText}>
              You have not posted any opportunities yet.
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
  cardType: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
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

export default ManageOpportunitiesScreen;
