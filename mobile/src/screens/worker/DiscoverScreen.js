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
import { opportunityAPI, matchingAPI, profileAPI } from '../../services/api';
import OpportunityCard from '../../components/OpportunityCard';
import ChatbotWidget from '../../components/ChatbotWidget';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'formal', label: 'Formal' },
  { key: 'contract', label: 'Contract' },
  { key: 'freelance', label: 'Freelance' },
  { key: 'apprenticeship', label: 'Apprenticeship' },
];

const DiscoverScreen = ({ navigation, route }) => {
  // showMatches arrives from the dashboard's Matches stat card. When set,
  // we filter the opportunity list down to the matching-engine's recom-
  // mendations so the count on the stat card equals what the worker sees.
  // category arrives from the dashboard's "Close Your Skill Gaps" rail
  // when the worker taps a category that has no remaining gaps — it
  // pre-selects the matching chip so they see roles in that category.
  const initialShowMatches = Boolean(route?.params?.showMatches);
  const initialCategory = (route?.params?.category && CATEGORIES.some((c) => c.key === route.params.category))
    ? route.params.category
    : 'all';

  const [opportunities, setOpportunities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [showMatchesOnly, setShowMatchesOnly] = useState(initialShowMatches);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [profileId, setProfileId] = useState(null);

  // Keep the filter in sync if the dashboard navigates here again with a
  // different param value — without this, React Navigation re-uses the
  // existing screen instance and the new param is ignored. Critically,
  // when a navigation doesn't carry a category param we reset to 'all'
  // so the sticky filter from a previous navigation doesn't bleed in.
  // Without this reset, tapping "View role" on an apprenticeship card
  // and then later tapping the Matches stat tile would still filter to
  // apprenticeship, which is what produced the "15 matches button only
  // shows one opportunity" symptom.
  useEffect(() => {
    setShowMatchesOnly(Boolean(route?.params?.showMatches));
    const cat = route?.params?.category;
    setSelectedCategory(
      cat && CATEGORIES.some((c) => c.key === cat) ? cat : 'all'
    );
  }, [route?.params?.showMatches, route?.params?.category]);

  // Fetch the worker's profileId once on mount
  useEffect(() => {
    profileAPI.getMyProfile()
      .then(({ data }) => setProfileId(data.profile?._id || null))
      .catch(() => setProfileId(null));
  }, []);

  const fetchOpportunities = useCallback(async () => {
    try {
      setError(null);
      const params = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (selectedCategory !== 'all') params.category = selectedCategory;

      // In matches-only mode, fetch the opportunity catalogue + the
      // worker's recommendations in parallel, then inner-join by
      // opportunityId. Recommendations already carry matchScore so we
      // skip the per-opp scoring round-trip in this path.
      if (showMatchesOnly) {
        const [oppsRes, recsRes] = await Promise.all([
          opportunityAPI.getAll(params),
          matchingAPI.getRecommendations(),
        ]);
        const oppList = oppsRes?.data?.opportunities || oppsRes?.data?.data || oppsRes?.data || [];
        const recList =
          recsRes?.data?.recommendations || recsRes?.data?.data || recsRes?.data || [];

        const scoreById = new Map();
        (Array.isArray(recList) ? recList : []).forEach((r) => {
          const id = r.opportunityId || r.opportunity?._id || r.opportunity?.id;
          const score = r.matchScore ?? r.score ?? r.opportunity?.matchScore ?? 0;
          if (id) scoreById.set(String(id), score);
        });

        // Only opportunities that the matching engine recommended with a
        // meaningful score (>= 5%) — same threshold the dashboard card
        // uses, so the count on the stat tile equals the rows shown here.
        const filtered = (Array.isArray(oppList) ? oppList : [])
          .filter((opp) => {
            const id = String(opp._id || opp.id || '');
            return scoreById.has(id) && scoreById.get(id) >= 5;
          })
          .map((opp) => ({
            ...opp,
            matchScore: scoreById.get(String(opp._id || opp.id)) ?? 0,
          }))
          .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

        setOpportunities(filtered);
        return;
      }

      const { data } = await opportunityAPI.getAll(params);
      const list = data.opportunities || data.data || data || [];
      const opps = Array.isArray(list) ? list : [];

      // Fetch match scores in parallel if we have a profileId, then sort
      // by score desc so the worker sees the best fit at the top. Without
      // this the API order (createdAt desc) wins, which leaves a low-fit
      // opportunity at the top of the 'All opportunities' list and gives
      // the impression the screen is unranked.
      if (profileId && opps.length > 0) {
        const scoreResults = await Promise.allSettled(
          opps.map((opp) =>
            matchingAPI.getMatchScore(profileId, opp._id || opp.id)
              .then((r) => ({ id: opp._id || opp.id, score: r.data?.matchScore ?? 0 }))
              .catch(() => ({ id: opp._id || opp.id, score: 0 }))
          )
        );

        const scoreMap = {};
        scoreResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            scoreMap[result.value.id] = result.value.score;
          }
        });

        const scored = opps
          .map((opp) => ({
            ...opp,
            matchScore: scoreMap[opp._id || opp.id] ?? 0,
          }))
          .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        setOpportunities(scored);
      } else {
        setOpportunities(opps);
      }
    } catch (err) {
      setError('Failed to load opportunities. Pull to refresh.');
      setOpportunities([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, selectedCategory, profileId, showMatchesOnly]);

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

      {/* Bidirectional toggle: lets the worker flip between 'all
          published opportunities' and 'only the matching-engine
          recommendations'. Both modes order by matchScore desc so the
          ranking stays consistent however the worker arrived here. */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={() => {
            if (showMatchesOnly) return;
            setShowMatchesOnly(true);
            setLoading(true);
          }}
          style={[styles.togglePill, showMatchesOnly && styles.togglePillActive]}
        >
          <Ionicons
            name="star"
            size={13}
            color={showMatchesOnly ? '#FFFFFF' : '#1D4ED8'}
          />
          <Text
            style={[
              styles.togglePillText,
              showMatchesOnly && styles.togglePillTextActive,
            ]}
          >
            Matches only
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (!showMatchesOnly) return;
            setShowMatchesOnly(false);
            setLoading(true);
          }}
          style={[styles.togglePill, !showMatchesOnly && styles.togglePillActive]}
        >
          <Ionicons
            name="grid-outline"
            size={13}
            color={!showMatchesOnly ? '#FFFFFF' : '#1D4ED8'}
          />
          <Text
            style={[
              styles.togglePillText,
              !showMatchesOnly && styles.togglePillTextActive,
            ]}
          >
            All opportunities
          </Text>
        </TouchableOpacity>
      </View>

      {/* Results count */}
      <Text style={styles.resultsCount}>
        {opportunities.length} {opportunities.length === 1 ? 'opportunity' : 'opportunities'} found
      </Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="briefcase-outline" size={48} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>
        {showMatchesOnly ? 'No matches yet' : 'No Opportunities Found'}
      </Text>
      <Text style={styles.emptyText}>
        {showMatchesOnly
          ? 'The matching engine has not surfaced any roles above the 5% threshold yet. Add more skills or experience to your profile to widen the pool.'
          : searchQuery
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
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  togglePillActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  togglePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  togglePillTextActive: {
    color: '#FFFFFF',
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
