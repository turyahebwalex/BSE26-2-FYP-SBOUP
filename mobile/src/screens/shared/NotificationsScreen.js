import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { BASE_URL } from '../../services/api';

// ─── Tab config ────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'match',    label: 'Matches' },
  { key: 'learning', label: 'Learning' },
  { key: 'connection_request', label: 'Requests' },
];

// ─── Type → icon ───────────────────────────────────────────────────────────────
const TYPE_ICONS = {
  message:            'chatbubble-outline',
  match:              'sparkles-outline',
  application_update: 'document-text-outline',
  opportunity:        'briefcase-outline',
  learning:           'school-outline',
  fraud_alert:        'warning-outline',
  system:             'information-circle-outline',
  connection_request: 'person-add-outline',
  reminder:           'alarm-outline',
  mention:            'at-outline',
  job_alert:          'megaphone-outline',
  application:        'document-text-outline',
  status_update:      'refresh-outline',
  interview:          'calendar-outline',
  offer:              'checkmark-circle-outline',
};

const TYPE_COLORS = {
  message:            '#3B82F6',
  match:              '#F97316',
  application_update: '#10B981',
  opportunity:        '#8B5CF6',
  learning:           '#F59E0B',
  fraud_alert:        '#EF4444',
  system:             '#6B7280',
  connection_request: '#10B981',
  reminder:           '#F59E0B',
  mention:            '#8B5CF6',
  job_alert:          '#F97316',
};

// ─── Action button config per notification ────────────────────────────────────
// Takes the full notification so the match-type case can branch on
// metadata.readyToApply — when the server has determined the worker now
// meets every required skill for an opportunity, the button reads
// 'Apply' and lands on the opportunity detail screen instead of the
// generic 'View'/'Discover' path.
const getActions = (notif) => {
  const type = notif?.type;
  const meta = notif?.metadata || {};
  switch (type) {
    case 'match':
      if (meta.readyToApply && meta.opportunityId) {
        return { primary: { label: 'Apply', nav: 'OpportunityDetails' } };
      }
      return { primary: { label: 'View', nav: 'Discover' } };
    case 'job_alert':
    case 'opportunity':       return { primary: { label: 'View',   nav: 'Discover' } };
    case 'application_update':
    case 'application':       return { primary: { label: 'Open',   nav: 'ApplicationDetails' } };
    case 'learning':          return { primary: { label: 'Start',  nav: 'Learning' } };
    case 'fraud_alert':       return { primary: { label: 'Report', nav: 'FraudReport' } };
    case 'connection_request':
      return {
        primary:   { label: 'Accept',  action: 'accept' },
        secondary: { label: 'Decline', action: 'decline' },
      };
    case 'message':           return { primary: { label: 'Reply',  nav: 'Chat' } };
    default:                  return null;
  }
};

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMin < 1)   return 'Just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7)  return `${diffDays}d ago`;
  return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
};

// ─── Main component (forwardRef) ───────────────────────────────────────────────
const NotificationsScreen = forwardRef(({ navigation, hideHeader = false }, ref) => {
  const { logout, setUnreadNotificationCount } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [activeTab, setActiveTab]   = useState('all');

  const getToken = async () => {
    try { return await AsyncStorage.getItem('accessToken'); }
    catch { return null; }
  };

  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    try {
      setError(null);
      const token = await getToken();
      if (!token) { logout(); return; }

      const response = await fetch(
        `${BASE_URL}/notifications?page=${pageNum}&limit=20`,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      const data = await response.json();

      if (response.ok) {
        const newNotifs = data.notifications || [];
        setUnreadCount(data.unreadCount || 0);
        if (setUnreadNotificationCount) setUnreadNotificationCount(data.unreadCount || 0);
        setNotifications(prev => append ? [...prev, ...newNotifs] : newNotifs);
        setHasMore(data.pagination?.hasMore || false);
      } else if (response.status === 401) {
        logout();
      } else {
        setError(data.error || 'Failed to load notifications');
      }
    } catch {
      setError('Failed to load notifications. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, setUnreadNotificationCount]);

  useEffect(() => { fetchNotifications(1, false); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchNotifications(1, false);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      const next = page + 1;
      setPage(next);
      fetchNotifications(next, true);
    }
  };

  // Expose refresh method to parent
  useImperativeHandle(ref, () => ({
    refresh: onRefresh,
  }));

  // ── CRUD helpers ──────────────────────────────────────────────────────────────
  const markAsRead = async (notifId) => {
    try {
      const token = await getToken();
      const res = await fetch(`${BASE_URL}/notifications/${notifId}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => (n._id || n.id) === notifId ? { ...n, isRead: true } : n)
        );
        const newUnreadCount = Math.max(0, unreadCount - 1);
        setUnreadCount(newUnreadCount);
        if (setUnreadNotificationCount) setUnreadNotificationCount(newUnreadCount);
      }
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BASE_URL}/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        if (setUnreadNotificationCount) setUnreadNotificationCount(0);
        Alert.alert('Success', 'All notifications marked as read');
      }
    } catch {
      Alert.alert('Error', 'Failed to mark notifications as read');
    }
  };

  const deleteNotif = (notifId) => {
    Alert.alert('Delete Notification', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken();
            const res = await fetch(`${BASE_URL}/notifications/${notifId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setNotifications(prev => prev.filter(n => (n._id || n.id) !== notifId));
          } catch { Alert.alert('Error', 'Failed to delete notification'); }
        },
      },
    ]);
  };

  // ── Connection request actions ────────────────────────────────────────────────
  const handleConnectionAction = async (notifId, action) => {
    try {
      const token = await getToken();
      const notif = notifications.find(n => (n._id || n.id) === notifId);
      const senderId = notif?.metadata?.senderId;
      if (!senderId) return;

      await fetch(`${BASE_URL}/connections/${senderId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      setNotifications(prev =>
        prev.map(n =>
          (n._id || n.id) === notifId
            ? { ...n, isRead: true, connectionActioned: action }
            : n
        )
      );
      const newUnreadCount = Math.max(0, unreadCount - 1);
      setUnreadCount(newUnreadCount);
      if (setUnreadNotificationCount) setUnreadNotificationCount(newUnreadCount);
    } catch { Alert.alert('Error', `Failed to ${action} request`); }
  };

  // ── Navigation helper ─────────────────────────────────────────────────────────
  const navigateToRootTab = (screenName, params = {}) => {
    navigation.getParent()?.navigate(screenName, params);
  };

  // Learning lives inside HomeTab's stack, not at the bottom-tab level,
  // so we have to navigate into HomeTab and then to the Learning screen.
  // The pathway-completion notification persists learningPathId in its
  // metadata; forwarding it as focusPathId makes LearningScreen
  // auto-expand the card the worker just finished.
  const navigateToLearning = (meta = {}) => {
    navigation.getParent()?.navigate('HomeTab', {
      screen: 'Learning',
      params: meta.learningPathId
        ? { focusPathId: String(meta.learningPathId) }
        : undefined,
    });
  };

  // OpportunityDetail is also nested inside HomeTab. Same pattern.
  const navigateToOpportunityDetail = (opportunityId) => {
    navigation.getParent()?.navigate('HomeTab', {
      screen: 'OpportunityDetail',
      params: { opportunityId: String(opportunityId) },
    });
  };

  const navigateForNotif = (item, navKey) => {
    const meta = item.metadata || {};
    switch (navKey) {
      case 'Chat':
        navigation.navigate('Chat', { userId: meta.senderId, userName: meta.senderName });
        break;
      case 'ApplicationDetails':
        navigateToRootTab('ApplicationDetails', { applicationId: meta.applicationId });
        break;
      case 'OpportunityDetails':
        if (meta.opportunityId) navigateToOpportunityDetail(meta.opportunityId);
        break;
      case 'Discover':
        navigateToRootTab('Discover');
        break;
      case 'Learning':
        navigateToLearning(meta);
        break;
      case 'FraudReport':
        navigateToRootTab('FraudReport', { notificationId: item._id || item.id });
        break;
      default:
        break;
    }
  };

  const handlePress = (item) => {
    const notifId = item._id || item.id;
    if (!item.isRead && !item.read) markAsRead(notifId);

    const meta = item.metadata || {};
    switch (item.type) {
      case 'message':
        if (meta.senderId)
          navigation.navigate('Chat', { userId: meta.senderId, userName: meta.senderName });
        break;
      case 'application_update':
      case 'application':
        if (meta.applicationId)
          navigateToRootTab('ApplicationDetails', { applicationId: meta.applicationId });
        break;
      case 'opportunity':
        if (meta.opportunityId) navigateToOpportunityDetail(meta.opportunityId);
        break;
      case 'match':
        // Ready-to-apply matches (server flags readyToApply + opportunityId)
        // jump straight to the opportunity detail screen where the Apply
        // button lives. Generic match notifications fall through to
        // Discover so the worker can still browse.
        if (meta.readyToApply && meta.opportunityId) {
          navigateToOpportunityDetail(meta.opportunityId);
        } else {
          navigateToRootTab('Discover');
        }
        break;
      case 'job_alert':
        navigateToRootTab('Discover');
        break;
      case 'connection_request':
        navigateToRootTab('Network');
        break;
      case 'learning':
        navigateToLearning(meta);
        break;
      default:
        break;
    }
  };

  // ── Filter by tab ─────────────────────────────────────────────────────────────
  const filtered = activeTab === 'all'
    ? notifications
    : notifications.filter(n => n.type === activeTab);

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderIcon = (item) => {
    const type    = item.type || 'system';
    const isRead  = item.isRead || item.read;
    const color   = isRead ? '#9CA3AF' : (TYPE_COLORS[type] || '#F97316');
    const bgColor = type === 'fraud_alert' ? '#FEF2F2' : isRead ? '#F3F4F6' : `${color}18`;

    if (type === 'connection_request' && item.metadata?.senderPhoto) {
      return (
        <Image
          source={{ uri: item.metadata.senderPhoto }}
          style={styles.avatarImg}
        />
      );
    }

    return (
      <View style={[styles.iconWrap, { backgroundColor: bgColor }]}>
        <Ionicons
          name={TYPE_ICONS[type] || TYPE_ICONS.system}
          size={20}
          color={type === 'fraud_alert' ? '#EF4444' : color}
        />
      </View>
    );
  };

  const renderActionButtons = (item) => {
    const notifId = item._id || item.id;
    const actions = getActions(item);
    if (!actions) return null;

    if (item.type === 'connection_request') {
      if (item.connectionActioned) {
        return (
          <View style={styles.actionRow}>
            <View style={[styles.outcomePill, item.connectionActioned === 'accept' ? styles.pillGreen : styles.pillGray]}>
              <Text style={[styles.outcomePillText, item.connectionActioned === 'accept' ? styles.pillGreenText : styles.pillGrayText]}>
                {item.connectionActioned === 'accept' ? 'Connected' : 'Declined'}
              </Text>
            </View>
          </View>
        );
      }
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => handleConnectionAction(notifId, 'accept')}
          >
            <Text style={styles.btnPrimaryText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={() => handleConnectionAction(notifId, 'decline')}
          >
            <Text style={styles.btnSecondaryText}>Decline</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.type === 'fraud_alert') {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.btnDanger}
            onPress={() => navigateForNotif(item, actions.primary.nav)}
          >
            <Text style={styles.btnPrimaryText}>{actions.primary.label}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigateForNotif(item, actions.primary.nav)}
        >
          <Text style={styles.btnPrimaryText}>{actions.primary.label}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNotification = ({ item }) => {
    const notifId = item._id || item.id;
    const isRead  = item.isRead || item.read;
    const type    = item.type || 'system';
    const title   = item.title || '';
    const message = item.content || item.message || item.text || '';
    const isFraud = type === 'fraud_alert';

    return (
      <TouchableOpacity
        style={[
          styles.card,
          !isRead && styles.cardUnread,
          isFraud && styles.cardFraud,
        ]}
        onPress={() => handlePress(item)}
        onLongPress={() => deleteNotif(notifId)}
        activeOpacity={0.75}
        delayLongPress={500}
      >
        <View style={styles.cardRow}>
          {renderIcon(item)}
          <View style={styles.cardBody}>
            {title ? (
              <Text style={[styles.cardTitle, !isRead && styles.cardTitleUnread]} numberOfLines={2}>
                {title}
              </Text>
            ) : null}
            {message ? (
              <Text style={[styles.cardMessage, title && styles.cardMessageSmall]} numberOfLines={title ? 2 : 3}>
                {message}
              </Text>
            ) : null}
            <Text style={styles.cardTime}>{formatTimeAgo(item.createdAt)}</Text>
          </View>
          <View style={styles.cardRight}>
            {!isRead && <View style={styles.unreadDot} />}
            <TouchableOpacity onPress={() => deleteNotif(notifId)} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-outline" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
        {renderActionButtons(item)}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!hasMore) return null;
    if (loading && notifications.length > 0)
      return <View style={styles.footerLoader}><ActivityIndicator size="small" color="#F97316" /></View>;
    return null;
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading && notifications.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {!hideHeader && renderHeader()}
        <View style={styles.center}><ActivityIndicator size="large" color="#F97316" /></View>
      </SafeAreaView>
    );
  }

  function renderHeader() {
    return (
      <View style={styles.header}>
        {!hideHeader && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color="#1F2937" />
          </TouchableOpacity>
        )}
        {hideHeader && <View style={styles.headerBtn} />}

        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 && !hideHeader ? (
          <TouchableOpacity onPress={markAllRead} style={styles.headerBtn}>
            <Ionicons name="checkbox-outline" size={24} color="#F97316" />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {!hideHeader && renderHeader()}

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tab, isActive && styles.tabActive]}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => item._id || item.id || Math.random().toString()}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#F97316']}
            tintColor="#F97316"
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'all'
                  ? "You're all caught up! Notifications will appear here."
                  : `No ${TABS.find(t => t.key === activeTab)?.label || ''} notifications yet.`}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F9FAFB' },
  center:      { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn:      { width: 60, alignItems: 'center', justifyContent: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle:    { fontSize: 18, fontWeight: '600', color: '#1F2937' },
  badge: {
    marginLeft: 6,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText:   { fontSize: 10, fontWeight: '700', color: '#FFF' },
  readAllText: { fontSize: 13, color: '#F97316', fontWeight: '600' }, // kept for compatibility

  // Tab bar
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingVertical: 10,
  },
  tabScroll: { paddingHorizontal: 16, gap: 8 },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabActive:     { backgroundColor: '#F97316' },
  tabText:       { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  tabTextActive: { color: '#FFFFFF' },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    marginTop: 12,
    marginHorizontal: 20,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  errorText: { flex: 1, fontSize: 13, color: '#EF4444' },
  retryText: { fontSize: 13, color: '#F97316', fontWeight: '600' },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12 },

  // Notification card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardUnread: {
    backgroundColor: '#FFFBF5',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  cardFraud: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardBody: { flex: 1, marginRight: 8 },
  cardRight: { alignItems: 'flex-end', gap: 4 },

  // Icon / avatar
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 12,
    backgroundColor: '#E5E7EB',
  },

  // Card text
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 20,
    marginBottom: 2,
  },
  cardTitleUnread: { color: '#111827' },
  cardMessage: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    lineHeight: 20,
  },
  cardMessageSmall: { fontSize: 13, color: '#6B7280', fontWeight: '400' },
  cardTime: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F97316' },
  closeBtn:  { padding: 2 },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginLeft: 54,
  },
  btnPrimary: {
    backgroundColor: '#F97316',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  btnPrimaryText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  btnSecondary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  btnSecondaryText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  btnDanger: {
    backgroundColor: '#EF4444',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },

  // Outcome pills
  outcomePill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  pillGreen:     { backgroundColor: '#D1FAE5' },
  pillGreenText: { fontSize: 12, fontWeight: '600', color: '#065F46' },
  pillGray:      { backgroundColor: '#F3F4F6' },
  pillGrayText:  { fontSize: 12, fontWeight: '600', color: '#6B7280' },

  // Footer & empty
  footerLoader:     { paddingVertical: 20, alignItems: 'center' },
  emptyContainer:   { alignItems: 'center', paddingVertical: 56 },
  emptyTitle:       { fontSize: 16, fontWeight: '600', color: '#1F2937', marginTop: 12, marginBottom: 6 },
  emptyText:        { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24 },
});

export default NotificationsScreen;