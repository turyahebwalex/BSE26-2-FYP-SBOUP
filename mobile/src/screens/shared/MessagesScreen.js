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
import { messageAPI } from '../../services/api';

const MessagesScreen = ({ navigation }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchInbox = useCallback(async () => {
    try {
      setError(null);
      const { data } = await messageAPI.getInbox();
      const list = data.conversations || data.messages || data.data || data || [];
      setConversations(Array.isArray(list) ? list : []);
    } catch (err) {
      setError('Failed to load messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchInbox();
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-UG', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-UG', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-UG', {
      month: 'short',
      day: 'numeric',
    });
  };

  const renderConversation = ({ item }) => {
    const otherUser = item.otherUser || item.user || item.participant || {};
    const userName = otherUser.fullName || otherUser.name || otherUser.email || 'User';
    const userId = otherUser._id || otherUser.id || item.userId;
    const lastMessage = item.lastMessage || item.message || '';
    const timestamp = item.updatedAt || item.lastMessageAt || item.createdAt;
    const unread = item.unread || item.unreadCount || 0;

    return (
      <TouchableOpacity
        style={[styles.convItem, unread > 0 && styles.convItemUnread]}
        onPress={() =>
          navigation.navigate('Chat', {
            userId,
            userName,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.convAvatar}>
          <Text style={styles.convAvatarText}>
            {userName.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.convContent}>
          <View style={styles.convHeader}>
            <Text
              style={[styles.convName, unread > 0 && styles.convNameUnread]}
              numberOfLines={1}
            >
              {userName}
            </Text>
            <Text style={styles.convTime}>{formatTime(timestamp)}</Text>
          </View>
          <View style={styles.convMessageRow}>
            <Text
              style={[
                styles.convMessage,
                unread > 0 && styles.convMessageUnread,
              ]}
              numberOfLines={1}
            >
              {typeof lastMessage === 'string'
                ? lastMessage
                : lastMessage.content || lastMessage.text || ''}
            </Text>
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Messages</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Messages</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={conversations}
        keyExtractor={(item) =>
          item._id || item.id || item.conversationId || Math.random().toString()
        }
        renderItem={renderConversation}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Messages</Text>
            <Text style={styles.emptyText}>
              Start a conversation by connecting with employers or workers.
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
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
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
  convItem: {
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
  convItemUnread: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  convAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  convAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  convContent: {
    flex: 1,
  },
  convHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  convName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
    flex: 1,
    marginRight: 8,
  },
  convNameUnread: {
    fontWeight: '700',
  },
  convTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  convMessageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convMessage: {
    fontSize: 13,
    color: '#9CA3AF',
    flex: 1,
    marginRight: 8,
  },
  convMessageUnread: {
    color: '#374151',
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: '#F97316',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
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

export default MessagesScreen;
