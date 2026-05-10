import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { opportunityAPI, matchingAPI } from '../../services/api';
import OpportunityCard from '../../components/OpportunityCard';
import ChatbotWidget from '../../components/ChatbotWidget';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'formal', label: 'Formal' },
  { key: 'contract', label: 'Contract' },
  { key: 'freelance', label: 'Freelance' },
  { key: 'apprenticeship', label: 'Apprenticeship' },
];

const DiscoverScreen = ({ navigation }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchOpportunities = useCallback(async () => {
    try {
      setError(null);
      const params = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (selectedCategory !== 'all') params.category = selectedCategory;

      // Fetch opportunities and match scores in parallel
      const [oppsRes, recsRes] = await Promise.allSettled([
        opportunityAPI.getAll(params),
        matchingAPI.getRecommendations(),
      ]);

      const list = oppsRes.status === 'fulfilled'
        ? (oppsRes.value.data.opportunities || oppsRes.value.data.data || oppsRes.value.data || [])
        : [];

      // Build a score map from recommendations: opportunityId → matchScore
      const scoreMap = {};
      if (recsRes.status === 'fulfilled') {
        const recs = recsRes.value.data.recommendations || recsRes.value.data.matches || recsRes.value.data || [];
        recs.forEach((r) => {
          const id = String(r.opportunityId || r._id || '');
          if (id) scoreMap[id] = typeof r.matchScore === 'number' ? r.matchScore : 0;
        });
      }

      // Merge scores into each opportunity
      const enriched = (Array.isArray(list) ? list : []).map((opp) => ({
        ...opp,
        matchScore: scoreMap[String(opp._id || opp.id)] ?? opp.matchScore ?? 0,
      }));

      setOpportunities(enriched);
    } catch (err) {
      setError('Failed to load opportunities. Pull to refresh.');
      setOpportunities([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOpportunities();
  };

  const handleSearch = () => {
    setLoading(true);
    fetchOpportunities();
  };

  const renderHeader = () => (
    <View>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search opportunities..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery('');
              setLoading(true);
            }}
          >
            <Ionicons name="close-circle" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CATEGORIES}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.chipContainer}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.chip,
              selectedCategory === item.key && styles.chipActive,
            ]}
            onPress={() => {
              setSelectedCategory(item.key);
              setLoading(true);
            }}
          >
            <Text
              style={[
                styles.chipText,
                selectedCategory === item.key && styles.chipTextActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Results count */}
      <Text style={styles.resultsCount}>
        {opportunities.length} {opportunities.length === 1 ? 'opportunity' : 'opportunities'} found
      </Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="briefcase-outline" size={48} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No Opportunities Found</Text>
      <Text style={styles.emptyText}>
        {searchQuery
          ? 'Try adjusting your search or filters.'
          : 'New opportunities are posted regularly. Check back soon!'}
      </Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.screenWrapper}>
        <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Discover</Text>
          </View>
          {renderHeader()}
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        </SafeAreaView>
        <ChatbotWidget />
      </View>
    );
  }

  return (
    <View style={styles.screenWrapper}>
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Discover</Text>
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
          renderItem={({ item }) => (
            <OpportunityCard
              opportunity={item}
              onPress={() =>
                navigation.navigate('OpportunityDetail', {
                  opportunityId: item._id || item.id,
                  opportunity: item,
                  matchScore: item.matchScore ?? 0,
                })
              }
            />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
          }
        />
      </SafeAreaView>

      {/* Kazi chatbot — floats over the screen */}
      <ChatbotWidget />
    </View>
  );
};

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
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
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    marginLeft: 8,
    paddingVertical: 0,
  },
  chipContainer: {
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  resultsCount: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
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

export default DiscoverScreen;
