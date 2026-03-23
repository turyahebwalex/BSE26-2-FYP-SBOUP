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
import { notificationAPI } from '../../services/api';

const TYPE_ICONS = {
  application: 'document-text-outline',
  message: 'chatbubble-outline',
  match: 'sparkles-outline',
  opportunity: 'briefcase-outline',
  status_update: 'refresh-outline',
  interview: 'calendar-outline',
  offer: 'checkmark-circle-outline',
  system: 'information-circle-outline',
};

const NotificationsScreen = ({ navigation }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setError(null);
      const { data } = await notificationAPI.getAll();
      const list = data.notifications || data.data || data || [];
      setNotifications(Array.isArray(list) ? list : []);
    } catch (err) {
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await notificationAPI.markAsRead(notifId);
      setNotifications((prev) =>
        prev.map((n) =>
          (n._id || n.id) === notifId ? { ...n, read: true, isRead: true } : n
        )
      );
    } catch {
      // Silently fail
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, isRead: true }))
      );
      Alert.alert('Done', 'All notifications marked as read.');
    } catch {
      Alert.alert('Error', 'Failed to mark notifications as read.');
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
  };

  const renderNotification = ({ item }) => {
    const notifId = item._id || item.id;
    const isRead = item.read || item.isRead;
    const type = item.type || 'system';
    const icon = TYPE_ICONS[type] || TYPE_ICONS.system;
    const message = item.message || item.content || item.text || '';

    return (
      <TouchableOpacity
        style={[styles.notifItem, !isRead && styles.notifItemUnread]}
        onPress={() => handleMarkAsRead(notifId)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.notifIcon,
            { backgroundColor: isRead ? '#F3F4F6' : '#FFF7ED' },
          ]}
        >
          <Ionicons
            name={icon}
            size={20}
            color={isRead ? '#9CA3AF' : '#F97316'}
          />
        </View>
        <View style={styles.notifContent}>
          <Text
            style={[
              styles.notifMessage,
              !isRead && styles.notifMessageUnread,
            ]}
            numberOfLines={3}
          >
            {message}
          </Text>
          <Text style={styles.notifTime}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
        {!isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const hasUnread = notifications.some((n) => !n.read && !n.isRead);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Notifications</Text>
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
        <Text style={styles.screenTitle}>Notifications</Text>
        {hasUnread ? (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Read All</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item._id || item.id || Math.random().toString()}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptyText}>
              You are all caught up! Notifications will appear here.
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
  markAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  markAllText: {
    fontSize: 13,
    color: '#F97316',
    fontWeight: '600',
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
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  notifItemUnread: {
    backgroundColor: '#FFFBF5',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notifContent: {
    flex: 1,
  },
  notifMessage: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 19,
  },
  notifMessageUnread: {
    color: '#1F2937',
    fontWeight: '500',
  },
  notifTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F97316',
    marginLeft: 8,
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

export default NotificationsScreen;
