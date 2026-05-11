import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Get API URL from environment variables
const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || 'http://10.10.162.91:5000/api';

const FILTERS = ['All', 'Messages', 'Applications', 'Learning', 'System'];

// Icon configuration for different notification types
const getIconConfig = (type) => {
  const configs = {
    message:     { icon: 'chatbubble-outline',  bg: '#EFF6FF', color: '#3B82F6' },
    match:       { icon: 'bar-chart-outline',   bg: '#FFF7ED', color: '#F97316' },
    application_update: { icon: 'document-text-outline', bg: '#EFF6FF', color: '#3B82F6' },
    learning:    { icon: 'school-outline',      bg: '#FFFBEB', color: '#F59E0B' },
    fraud_alert: { icon: 'warning-outline',     bg: '#FEF2F2', color: '#EF4444' },
    system:      { icon: 'settings-outline',    bg: '#F3F4F6', color: '#6B7280' },
    connection_request: { icon: 'person-add-outline', bg: '#ECFDF5', color: '#10B981' },
    opportunity: { icon: 'briefcase-outline',   bg: '#EFF6FF', color: '#3B82F6' },
    reminder:    { icon: 'alarm-outline',       bg: '#FFFBEB', color: '#F59E0B' },
  };
  return configs[type] || configs.system;
};

// Helper to format time
const formatTimeAgo = (dateString) => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMinutes = Math.floor((now - date) / (1000 * 60));
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
  if (diffMinutes < 43200) return `${Math.floor(diffMinutes / 1440)}d ago`;
  return date.toLocaleDateString();
};

const NotificationIcon = ({ type, metadata }) => {
  const cfg = getIconConfig(type);
  
  // Special handling for connection requests with avatar
  if (type === 'connection_request' && metadata?.senderAvatar) {
    return (
      <View style={[styles.iconCircle, { backgroundColor: '#10B981' }]}>
        <Text style={styles.avatarText}>
          {metadata.senderName?.charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
    );
  }
  
  return (
    <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={22} color={cfg.color} />
    </View>
  );
};

const NotificationCard = ({ item, onPress, onAccept, onDecline }) => {
  const isUnread = !item.isRead;
  const isConnectionRequest = item.type === 'connection_request';
  
  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.cardUnread]}
      onPress={() => onPress && onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        <NotificationIcon type={item.type} metadata={item.metadata} />
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, isUnread && styles.cardTitleBold]}>
            {item.title || item.content}
          </Text>
          <Text style={styles.cardTime}>
            {formatTimeAgo(item.createdAt)}
          </Text>
          
          {isConnectionRequest && (
            <View style={styles.connectActions}>
              <TouchableOpacity
                style={styles.btnAccept}
                onPress={() => onAccept && onAccept(item)}
              >
                <Text style={styles.btnAcceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnDecline}
                onPress={() => onDecline && onDecline(item)}
              >
                <Text style={styles.btnDeclineText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const Notifications = ({ navigation }) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadBreakdown, setUnreadBreakdown] = useState({});
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Get auth token
  const getToken = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return token;
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  };

  // Fetch notifications from API
  const fetchNotifications = async (pageNum = 1, refresh = false) => {
    try {
      const token = await getToken();
      if (!token) {
        navigation.replace('Login');
        return;
      }

      const typeParam = activeFilter !== 'All' ? activeFilter.toLowerCase() : '';
      const url = `${API_URL}/notifications?page=${pageNum}&limit=20${typeParam ? `&type=${typeParam}` : ''}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        if (refresh) {
          setNotifications(data.notifications || []);
        } else {
          setNotifications(prev => [...prev, ...(data.notifications || [])]);
        }
        setHasMore(data.pagination?.hasMore || false);
        setUnreadCount(data.unreadCount || 0);
        setUnreadBreakdown(data.unreadBreakdown || {});
      } else {
        console.error('Fetch error:', data.error);
        if (data.error === 'Unauthorized') {
          navigation.replace('Login');
        }
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      Alert.alert('Error', 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load initial data
  useEffect(() => {
    setPage(1);
    setNotifications([]);
    fetchNotifications(1, true);
  }, [activeFilter]);

  // Pull to refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchNotifications(1, true);
  }, [activeFilter]);

  // Load more (pagination)
  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchNotifications(nextPage, false);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Update local state
        setNotifications(prev =>
          prev.map(n =>
            n._id === notificationId ? { ...n, isRead: true, readAt: new Date() } : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        
        // Update breakdown
        const notification = notifications.find(n => n._id === notificationId);
        if (notification && unreadBreakdown[notification.type]) {
          const newBreakdown = { ...unreadBreakdown };
          newBreakdown[notification.type] = Math.max(0, newBreakdown[notification.type] - 1);
          if (newBreakdown[notification.type] === 0) delete newBreakdown[notification.type];
          setUnreadBreakdown(newBreakdown);
        }
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      const token = await getToken();
      const typeParam = activeFilter !== 'All' ? `?type=${activeFilter.toLowerCase()}` : '';
      
      const response = await fetch(`${API_URL}/notifications/read-all${typeParam}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update local state
        setNotifications(prev =>
          prev.map(n => ({ ...n, isRead: true, readAt: new Date() }))
        );
        setUnreadCount(data.unreadCount || 0);
        setUnreadBreakdown(data.unreadBreakdown || {});
        
        Alert.alert('Success', 'All notifications marked as read');
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      Alert.alert('Error', 'Failed to mark notifications as read');
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await getToken();
              const response = await fetch(`${API_URL}/notifications/${notificationId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });

              if (response.ok) {
                setNotifications(prev => prev.filter(n => n._id !== notificationId));
                Alert.alert('Success', 'Notification deleted');
              }
            } catch (error) {
              console.error('Failed to delete:', error);
              Alert.alert('Error', 'Failed to delete notification');
            }
          },
        },
      ]
    );
  };

  // Handle notification press
  const handlePress = (notification) => {
    // Mark as read
    if (!notification.isRead) {
      markAsRead(notification._id);
    }
    
    // Navigate based on notification type
    switch (notification.type) {
      case 'message':
        navigation.navigate('Messages', {
          userId: notification.metadata?.senderId,
          userName: notification.metadata?.senderName,
        });
        break;
      case 'application_update':
        navigation.navigate('ApplicationDetails', {
          applicationId: notification.metadata?.applicationId,
        });
        break;
      case 'opportunity':
        navigation.navigate('OpportunityDetails', {
          opportunityId: notification.metadata?.opportunityId,
        });
        break;
      case 'connection_request':
        // Handle connection request
        break;
      default:
        // Just mark as read
        break;
    }
  };

  // Handle accept connection
  const handleAccept = async (notification) => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/connections/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: notification.metadata?.requestId,
        }),
      });

      if (response.ok) {
        Alert.alert('Success', 'Connection request accepted');
        deleteNotification(notification._id);
      }
    } catch (error) {
      console.error('Failed to accept:', error);
      Alert.alert('Error', 'Failed to accept connection request');
    }
  };

  // Handle decline connection
  const handleDecline = async (notification) => {
    Alert.alert(
      'Decline Request',
      'Are you sure you want to decline this connection request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => deleteNotification(notification._id),
        },
      ]
    );
  };

  // Render footer (loading indicator)
  const renderFooter = () => {
    if (!loading || notifications.length === 0) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#F97316" />
      </View>
    );
  };

  // Render empty state
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>All caught up!</Text>
      <Text style={styles.emptyText}>
        No {activeFilter !== 'All' ? activeFilter.toLowerCase() : ''} notifications
      </Text>
    </View>
  );

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.screenTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        
        {notifications.length > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((filter) => {
          const filterKey = filter.toLowerCase();
          const count = filter === 'All' 
            ? unreadCount 
            : (unreadBreakdown[filterKey] || 0);
          
          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                activeFilter === filter && styles.filterChipActive,
              ]}
              onPress={() => {
                setActiveFilter(filter);
                setPage(1);
                setNotifications([]);
                setLoading(true);
              }}
            >
              <Text style={[
                styles.filterText,
                activeFilter === filter && styles.filterTextActive,
              ]}>
                {filter}
                {count > 0 && ` (${count})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Notification List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <NotificationCard
            item={item}
            onPress={handlePress}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={!loading && renderEmpty}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { 
    padding: 4,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  unreadBadge: {
    position: 'absolute',
    top: -8,
    right: -20,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  markAllText: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#F97316' 
  },

  /* Filter chips */
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: { backgroundColor: '#F97316' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterTextActive: { color: '#fff' },

  /* List */
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },

  /* Cards */
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
    backgroundColor: '#FFFBEB',
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, color: '#1F2937', lineHeight: 20, marginBottom: 4 },
  cardTitleBold: { fontWeight: '600' },
  cardTime: { fontSize: 12, color: '#9CA3AF', marginBottom: 10 },

  /* Icon circle */
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },

  /* Connect buttons */
  connectActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btnAccept: {
    flex: 1,
    backgroundColor: '#F97316',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnAcceptText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnDecline: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  btnDeclineText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },

  /* Empty */
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginTop: 12, marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  /* Footer */
  footerLoader: { paddingVertical: 20 },
});

export default Notifications;