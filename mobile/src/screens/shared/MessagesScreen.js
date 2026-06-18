import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { BASE_URL } from '../../services/api';
import NotificationsScreen from './NotificationsScreen';
import MessagesInbox from './MessagesInbox';
import { useAuth } from '../../context/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────
const FILTER_CHIPS = ['Workers', 'Employers', 'Companies'];

// ─── Helper: Build image URL ──────────────────────────────────────────────────
const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;

  const staticBaseUrl = BASE_URL.replace('/api', '');
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${staticBaseUrl}${cleanPath}`;
};

// ─── People Card ──────────────────────────────────────────────────────────────
const PeopleCard = ({ item, onMessage, navigation }) => {
  const [avatarError, setAvatarError] = useState(false);
  const avatarValue =
    item.avatar || item.profileImage || item.image || item.userAvatar || item.profile?.avatar;
  const imageUrl = getImageUrl(avatarValue);

  return (
    <View style={styles.personCard}>
      {/* Match badge */}
      {item.match != null && (
        <View style={styles.matchBadge}>
          <Ionicons name="sparkles" size={11} color="#059669" />
          <Text style={styles.matchText}>{item.match}% Match</Text>
        </View>
      )}

      {/* Avatar */}
      <View style={{ width: 64, alignItems: 'center' }}>
        {item.avatar && imageUrl && !avatarError ? (
          <Image
            source={{ uri: imageUrl }}
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              borderWidth: 2,
              borderColor: '#fff',
            }}
            onError={() => setAvatarError(true)}
          />
        ) : (
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: '#F97316',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 2,
              borderColor: '#fff',
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff' }}>
              {item.name ? item.name.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
        )}
      </View>

      {/* Details */}
      <View style={styles.personDetails}>
        <View style={styles.nameRow}>
          <Text style={styles.personName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>

        <Text style={styles.personRole} numberOfLines={1}>
          {item.title ||
            item.headline ||
            (item.role === 'employer' ? 'Employer' : 'Skilled Worker')}
        </Text>

        {item.companyName && (
          <View style={styles.metaRow}>
            <Ionicons name="business-outline" size={13} color="#6B7280" />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.companyName}
            </Text>
          </View>
        )}

        {item.location && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color="#9CA3AF" />
            <Text style={styles.locationText} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        )}

        <View style={styles.cardActions}>
          {item.role === 'employer' && item.companyId ? (
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('CompanyProfile', { companyId: item.companyId })}
              activeOpacity={0.8}
            >
              <Ionicons name="eye-outline" size={15} color="#F97316" />
              <Text style={styles.profileBtnText}>View Jobs</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() =>
                navigation.navigate('UserProfile', {
                  userId: item.id || item._id,
                  userName: item.name,
                  userAvatar: item.avatar,
                  userRole: item.role,
                })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="eye-outline" size={15} color="#F97316" />
              <Text style={styles.profileBtnText}>View Profile</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[
              styles.messageBtn,
              item.companyId && styles.messageBtnSecondary,
            ]}
            onPress={() => onMessage(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={15} color="#fff" />
            <Text style={styles.messageBtnText}>Message</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ─── Search Tab ───────────────────────────────────────────────────────────────
const SearchTab = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [activeChip, setActiveChip] = useState('Workers');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setResults([]);
    setError(null);
  }, [activeChip]);

  const fetchData = useCallback(
    async (searchQuery = query, chip = activeChip) => {
      try {
        setError(null);
        setLoading(true);

        switch (chip) {
          case 'Workers': {
            const endpoint = searchQuery.trim()
              ? `/users/search?query=${encodeURIComponent(searchQuery)}&role=skilled_worker`
              : '/users/suggested?role=skilled_worker';
            const response = await api.get(endpoint);
            setResults(response.data?.users || []);
            break;
          }

          case 'Employers': {
            const endpoint = searchQuery.trim()
              ? `/users/search?query=${encodeURIComponent(searchQuery)}&role=employer`
              : '/users/suggested?role=employer';
            const response = await api.get(endpoint);
            setResults(response.data?.users || []);
            break;
          }

          case 'Companies': {
            const endpoint = `/users/companies/search?query=${encodeURIComponent(searchQuery)}`;
            const response = await api.get(endpoint);
            setResults(response.data?.companies || []);
            break;
          }

          default:
            setResults([]);
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load results.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, activeChip]
  );

  useEffect(() => {
    const timer = setTimeout(() => fetchData(query, activeChip), 400);
    return () => clearTimeout(timer);
  }, [query, activeChip, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(query, activeChip);
  };

  const handleMessage = (item) => {
    navigation.navigate('Chat', {
      userId: item.id || item._id,
      userName: item.name,
      userAvatar: item.avatar,
      userRole: item.role,
    });
  };

  const renderCompanyCard = (item) => (
    <View key={item.id} style={styles.personCard}>
      <View style={[styles.avatarIcon, { backgroundColor: '#3B82F6' }]}>
        <Ionicons name="business-outline" size={32} color="#fff" />
      </View>
      <View style={styles.personDetails}>
        <Text style={styles.personName}>{item.name}</Text>
        <Text style={styles.personRole}>{item.industry || 'Company'}</Text>
        <Text style={styles.locationText}>{item.location}</Text>
        <TouchableOpacity
          style={[styles.messageBtn, { backgroundColor: '#3B82F6', marginTop: 10 }]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('CompanyProfile', { companyId: item.id })}
        >
          <Text style={styles.messageBtnText}>View Company Jobs</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const SectionHeader = () => {
    if (activeChip === 'Workers')
      return (
        <View style={styles.sectionInfo}>
          <Ionicons name="people-outline" size={15} color="#6B7280" />
          <Text style={styles.sectionInfoText}>
            {query.trim()
              ? 'Workers matching your search'
              : 'Suggested skilled workers near you'}
          </Text>
        </View>
      );
    if (activeChip === 'Employers')
      return (
        <View style={styles.sectionInfo}>
          <Ionicons name="briefcase-outline" size={15} color="#3B82F6" />
          <Text style={[styles.sectionInfoText, { color: '#3B82F6' }]}>
            {query.trim() ? 'Employers matching your search' : 'Suggested employers'}
          </Text>
        </View>
      );
    return null;
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#F97316']}
          tintColor="#F97316"
        />
      }
    >
      <View style={styles.searchBar}>
        <Ionicons
          name="search-outline"
          size={16}
          color="#9CA3AF"
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={
            activeChip === 'Employers'
              ? 'Search employers or companies…'
              : activeChip === 'Workers'
              ? 'Search skills, roles, or names…'
              : 'Search companies…'
          }
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
        />
        {query !== '' && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chipsRow}>
        {FILTER_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip}
            style={[styles.chip, activeChip === chip && styles.chipActive]}
            onPress={() => {
              setActiveChip(chip);
              setError(null);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                activeChip === chip && styles.chipTextActive,
              ]}
            >
              {chip}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={15} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : results.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name={
              activeChip === 'Employers'
                ? 'briefcase-outline'
                : activeChip === 'Companies'
                ? 'business-outline'
                : 'people-outline'
            }
            size={40}
            color="#D1D5DB"
          />
          <Text style={styles.emptyTitle}>
            {activeChip === 'Employers'
              ? 'No employers found'
              : activeChip === 'Companies'
              ? 'No companies found'
              : 'No workers found'}
          </Text>
          <Text style={styles.emptyText}>
            {activeChip === 'Employers' && !query.trim()
              ? 'Try searching for an employer or company name'
              : `No ${activeChip.toLowerCase()} match your search`}
          </Text>
        </View>
      ) : (
        <>
          <SectionHeader />
          {results.map((item) =>
            activeChip === 'Companies' ? (
              renderCompanyCard(item)
            ) : (
              <PeopleCard
                key={item.id || item._id}
                item={item}
                onMessage={handleMessage}
                navigation={navigation}
              />
            )
          )}
        </>
      )}
    </ScrollView>
  );
};

// ─── Notifications Tab ────────────────────────────────────────────────────────
const NotificationsTab = ({ navigation, notificationsRef }) => (
  <NotificationsScreen
    ref={notificationsRef}
    navigation={navigation}
    hideHeader={true}
  />
);

// ─── Main MessagesScreen ──────────────────────────────────────────────────────
const MessagesScreen = ({ navigation, route }) => {
  const [activeTab, setActiveTab] = useState('search');
  const { unreadMessageCount, unreadNotificationCount, setUnreadNotificationCount } =
    useAuth();
  const notificationsRef = useRef(null);

  useEffect(() => {
    if (route?.params?.focusTab === 'search') {
      setActiveTab('search');
    }
  }, [route?.params?.focusTab]);

  const markAllNotificationsRead = async () => {
    if (!unreadNotificationCount || unreadNotificationCount === 0) return;
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) return;
      const res = await fetch(`${BASE_URL}/notifications/read-all`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        notificationsRef.current?.refresh?.();
        if (setUnreadNotificationCount) setUnreadNotificationCount(0);
        Alert.alert('Success', 'All notifications marked as read');
      } else {
        Alert.alert('Error', 'Failed to mark notifications as read');
      }
    } catch {
      Alert.alert('Error', 'Could not connect to server');
    }
  };

  const headerConfig = {
    search: { title: 'Messaging Hub', rightAction: null },
    inbox: { title: 'Inbox', rightAction: null },
    notifications: {
      title: 'Notifications',
      rightAction: (
        <TouchableOpacity
          onPress={markAllNotificationsRead}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={unreadNotificationCount > 0 ? 'checkbox-outline' : 'checkbox'}
            size={24}
            color="#F97316"
          />
        </TouchableOpacity>
      ),
    },
  };

  const { title, rightAction } = headerConfig[activeTab];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'search':
        return <SearchTab navigation={navigation} />;
      case 'inbox':
        return <MessagesInbox navigation={navigation} />;
      case 'notifications':
        return (
          <NotificationsTab
            navigation={navigation}
            notificationsRef={notificationsRef}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerRight}>{rightAction}</View>
        </View>

        <View style={styles.tabBar}>
          {[
            { key: 'search', label: 'Search' },
            { key: 'inbox', label: 'Messages', count: unreadMessageCount },
            { key: 'notifications', label: 'Notifications', count: unreadNotificationCount },
          ].map(({ key, label, count }) => (
            <TouchableOpacity
              key={key}
              style={styles.tabItem}
              onPress={() => setActiveTab(key)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === key && styles.tabLabelActive,
                  ]}
                >
                  {label}
                </Text>
                {count > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>
                      {count > 99 ? '99+' : count}
                    </Text>
                  </View>
                )}
              </View>
              {activeTab === key && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>

        {renderTabContent()}
      </SafeAreaView>

    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backBtn: { width: 40, padding: 2 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  headerRight: { width: 40, alignItems: 'flex-end' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  tabLabel: { fontSize: 14, fontWeight: '500', color: '#9CA3AF' },
  tabLabelActive: { color: '#F97316', fontWeight: '700' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 2,
    backgroundColor: '#F97316',
  },
  tabBadge: {
    marginLeft: 6,
    backgroundColor: '#F97316',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1F2937' },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  chipActive: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  chipTextActive: { color: '#F97316' },

  sectionInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionInfoText: { fontSize: 12, color: '#6B7280', flex: 1, lineHeight: 17 },

  personCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  avatarIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  personDetails: { flex: 1, marginLeft: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  personName: { fontSize: 15, fontWeight: '700', color: '#1F2937', flex: 1 },

  matchBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 1,
  },
  matchText: { fontSize: 11, fontWeight: '700', color: '#059669' },

  personRole: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  metaText: { fontSize: 12, color: '#6B7280', flex: 1 },
  locationText: { fontSize: 12, color: '#9CA3AF', flex: 1 },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  reportBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  profileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: '#F97316',
    borderRadius: 10,
    paddingVertical: 9,
  },
  profileBtnText: { fontSize: 13, fontWeight: '600', color: '#F97316' },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F97316',
    borderRadius: 10,
    paddingVertical: 10,
  },
  messageBtnSecondary: { flex: 1 },
  messageBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    marginTop: 10,
  },
  errorText: { fontSize: 13, color: '#EF4444', flex: 1 },
  retryText: { fontSize: 13, color: '#F97316', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151' },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 20 },
});

export default MessagesScreen;