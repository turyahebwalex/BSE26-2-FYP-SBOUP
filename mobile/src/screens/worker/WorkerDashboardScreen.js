import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { matchingAPI, applicationAPI, notificationAPI, learningAPI } from '../../services/api';
import OpportunityCard from '../../components/OpportunityCard';

const AVATAR_KEY = (userId) => `user_avatar_uri_${userId}`;

const WorkerDashboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState([]);
  const [applicationCount, setApplicationCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [fittingCategories, setFittingCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [avatarUri, setAvatarUri] = useState(null);

  // Reload avatar every time this screen comes into focus
  // so changes made on the Profile tab are reflected immediately
  useFocusEffect(
    useCallback(() => {
      const userId = user?._id || user?.id || 'guest';
      const key = AVATAR_KEY(userId);
      AsyncStorage.getItem(key).then(async (cached) => {
        if (cached) {
          setAvatarUri(cached);
        } else {
          // Not cached — fetch from DB
          try {
            const { data } = await (await import('../../services/api')).profileAPI.getMyProfile();
            const b64 = data.profile?.avatarBase64;
            if (b64) {
              const uri = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
              setAvatarUri(uri);
              await AsyncStorage.setItem(key, uri);
            }
          } catch (_) {}
        }
      });
    }, [user])
  );

  const fetchDashboardData = useCallback(async () => {
    try {
      setError(null);
      const [recsRes, appsRes, notifRes, fitRes] = await Promise.allSettled([
        matchingAPI.getRecommendations(),
        applicationAPI.getMyApplications(),
        notificationAPI.getUnreadCount(),
        learningAPI.dashboardFit(),
      ]);

      if (recsRes.status === 'fulfilled') {
        const data = recsRes.value.data;
        const all = data.recommendations || data.matches || data || [];
        // Only show opportunities with a meaningful match score (≥ 5%)
        // Scores below 5% mean zero skill relevance — not worth showing
        const matched = Array.isArray(all)
          ? all.filter((r) => {
              const score = r.matchScore ?? r.score ?? (r.opportunity || r).matchScore ?? 0;
              return score >= 5;
            })
          : [];
        setRecommendations(matched);
      }
      if (appsRes.status === 'fulfilled') {
        const data = appsRes.value.data;
        const apps = data.applications || data || [];
        setApplicationCount(Array.isArray(apps) ? apps.length : 0);
      }
      if (notifRes.status === 'fulfilled') {
        const data = notifRes.value.data;
        setUnreadCount(data.count || data.unreadCount || 0);
      }
      if (fitRes.status === 'fulfilled') {
        const data = fitRes.value.data || {};
        const cats = Array.isArray(data.fittingCategories) ? data.fittingCategories : [];
        setFittingCategories(cats);
      }
    } catch (err) {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const quickActions = [
    {
      icon: 'sparkles-outline',
      label: 'Browse\nMatches',
      color: '#F97316',
      onPress: () => navigation.navigate('Discover'),
    },
    {
      icon: 'document-text-outline',
      label: 'Generate\nCV',
      color: '#3B82F6',
      onPress: () => navigation.navigate('GenerateCV'),
    },
    {
      icon: 'school-outline',
      label: 'Learning\nPaths',
      color: '#8B5CF6',
      onPress: () => navigation.navigate('Learning'),
    },
    {
      icon: 'notifications-outline',
      label: `Alerts${unreadCount > 0 ? `\n(${unreadCount})` : ''}`,
      color: '#EF4444',
      onPress: () => navigation.navigate('ProfileTab', { screen: 'Notifications' }),
    },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
        }
      >
        {/* Welcome Header */}
        <View style={styles.welcomeSection}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>
              {user?.fullName || user?.name || 'Worker'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileAvatar}
            onPress={() => navigation.navigate('ProfileTab', { screen: 'Profile' })}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.profileAvatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.fullName || user?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Stats Summary */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('Applications')}
          >
            <Ionicons name="briefcase-outline" size={22} color="#F97316" />
            <Text style={styles.statNumber}>{applicationCount}</Text>
            <Text style={styles.statLabel}>Applications</Text>
          </TouchableOpacity>
          <View style={styles.statCard}>
            <Ionicons name="star-outline" size={22} color="#3B82F6" />
            <Text style={styles.statNumber}>
              {Array.isArray(recommendations) ? recommendations.length : 0}
            </Text>
            <Text style={styles.statLabel}>Matches</Text>
          </View>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => navigation.navigate('ProfileTab', { screen: 'Notifications' })}
          >
            <Ionicons name="notifications-outline" size={22} color="#EF4444" />
            <Text style={styles.statNumber}>{unreadCount}</Text>
            <Text style={styles.statLabel}>Unread</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={styles.actionCard}
              onPress={action.onPress}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '15' }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Close Your Skill Gaps — drives the §6.2.4 dashboard section */}
        {fittingCategories.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Close Your Skill Gaps</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Learning')}>
                <Text style={styles.seeAll}>View Paths</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.fitScrollContent}
            >
              {fittingCategories.slice(0, 6).map((cat, idx) => {
                const pct = Math.round((Number(cat.fitScore) || 0) * 100);
                const missing = Array.isArray(cat.missingSkills) ? cat.missingSkills : [];
                const top = missing[0];
                return (
                  <TouchableOpacity
                    key={cat.category || idx}
                    style={styles.fitCard}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('Learning')}
                  >
                    <View style={styles.fitCardHeader}>
                      <View style={styles.fitBadge}>
                        <Text style={styles.fitBadgeText}>{pct}%</Text>
                      </View>
                      <Text style={styles.fitCategory} numberOfLines={1}>
                        {cat.category || 'Category'}
                      </Text>
                    </View>
                    {missing.length > 0 ? (
                      <>
                        <Text style={styles.fitMissingLabel}>
                          {missing.length === 1 ? '1 gap to bridge' : `${missing.length} gaps to bridge`}
                        </Text>
                        <View style={styles.fitChipRow}>
                          {missing.slice(0, 2).map((s, i) => (
                            <View key={`${cat.category}-${i}`} style={styles.fitChip}>
                              <Text style={styles.fitChipText} numberOfLines={1}>
                                {s}
                              </Text>
                            </View>
                          ))}
                          {missing.length > 2 && (
                            <Text style={styles.fitChipMore}>+{missing.length - 2}</Text>
                          )}
                        </View>
                      </>
                    ) : (
                      <Text style={styles.fitMissingLabel}>You match this category.</Text>
                    )}
                    {!!top && (
                      <View style={styles.fitFooter}>
                        <Ionicons name="sparkles" size={11} color="#F97316" />
                        <Text style={styles.fitFooterText}>Bridge {top}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Recommended Opportunities */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recommended for You</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Discover')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {Array.isArray(recommendations) && recommendations.length > 0 ? (
          recommendations.slice(0, 5).map((item, index) => {
            const opp = item.opportunity || item;
            const oppId = opp._id || opp.id || opp.opportunityId;
            const score = item.matchScore ?? item.score ?? opp.matchScore ?? 0;
            return (
              <OpportunityCard
                key={oppId || index}
                opportunity={{ ...opp, matchScore: score }}
                onPress={() =>
                  navigation.navigate('OpportunityDetail', {
                    opportunityId: oppId,
                    opportunity: opp,
                    matchScore: score,
                  })
                }
              />
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="search-outline" size={40} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Recommendations Yet</Text>
            <Text style={styles.emptyText}>
              Complete your profile and add skills to get matched with opportunities.
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('ProfileTab', { screen: 'EditProfile' })}
            >
              <Text style={styles.emptyButtonText}>Complete Profile</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9CA3AF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 14,
    color: '#F97316',
    fontWeight: '500',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    flex: 1,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
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
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: '#F97316',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  fitScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  fitCard: {
    width: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  fitCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  fitBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9A3412',
  },
  fitCategory: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  fitMissingLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 6,
  },
  fitChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  fitChip: {
    backgroundColor: '#FEF2F2',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: 110,
  },
  fitChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B91C1C',
  },
  fitChipMore: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  fitFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  fitFooterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F97316',
  },
});

export default WorkerDashboardScreen;
