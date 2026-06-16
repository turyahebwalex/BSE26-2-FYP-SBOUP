import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Image,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import socketService from '../../services/socket';
import api, { BASE_URL } from '../../services/api';

const STATIC_BASE_URL = BASE_URL.replace('/api', '');

const avatarColors = ['#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F59E0B', '#64748B'];
const getAvatarColor = (name = '') => avatarColors[(name.charCodeAt(0) || 0) % avatarColors.length];

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMins = Math.floor((now - date) / (1000 * 60));
  const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-UG', { weekday: 'short' });
  return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
};

const AvatarCircle = ({ name = '', size = 46, online = false, imageUrl, onPress }) => {
  const resolvedUrl = imageUrl
  ? imageUrl.startsWith('http') 
    ? imageUrl 
    : `${STATIC_BASE_URL}/${imageUrl.replace(/^\//, '')}`
  : null;
  
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} disabled={!resolvedUrl}>
      <View style={{ position: 'relative' }}>
        {resolvedUrl ? (
          <Image
            source={{ uri: resolvedUrl }}
            style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#fff' }}
          />
        ) : (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: getAvatarColor(name), justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: '#fff' }}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {online && (
          <View style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#fff' }} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const AppIcon = ({ app, onPress, onLongPress }) => (
  <TouchableOpacity
    style={styles.appIconWrapper}
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.7}
  >
    <View style={[styles.appIcon, { backgroundColor: app.color }]}>
      <Text style={styles.appIconText}>{app.initials}</Text>
    </View>
    <Text style={styles.appIconLabel} numberOfLines={1}>{app.name}</Text>
  </TouchableOpacity>
);

const MessageRow = ({ item, onPress, isOnline, onAvatarPress }) => {
  const otherUser = item.otherUser || {};
  const userName = otherUser.fullName || otherUser.name || 'User';
  const userAvatar = otherUser.avatar;
  const lastMessage = item.lastMessage || {};
  const messageText = lastMessage.content || lastMessage.text || '';
  const timestamp = item.updatedAt || lastMessage.sentAt;
  const unreadCount = item.unreadCount || 0;
  const hasAttachments = lastMessage.attachments && lastMessage.attachments.length > 0;
  const displayText = messageText || (hasAttachments ? '📎 Attachment' : 'No message');

  return (
    <TouchableOpacity style={styles.msgRow} onPress={onPress} activeOpacity={0.75}>
      <AvatarCircle 
        name={userName} 
        size={46} 
        online={isOnline} 
        imageUrl={userAvatar}
        onPress={() => onAvatarPress(userAvatar, userName)}
      />
      <View style={styles.msgBody}>
        <View style={styles.msgTopRow}>
          <Text style={[styles.msgName, unreadCount > 0 && styles.msgNameUnread]} numberOfLines={1}>{userName}</Text>
          <Text style={styles.msgTime}>{formatTime(timestamp)}</Text>
        </View>
        <Text style={[styles.msgPreview, unreadCount > 0 && styles.msgPreviewUnread]} numberOfLines={1}>{displayText}</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#D1D5DB" style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
};

const resetToLogin = (navigation) => {
  const parent = navigation.getParent();
  if (parent) parent.reset({ index: 0, routes: [{ name: 'Login' }] });
  else navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
};

const MessagesInbox = ({ navigation }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [currentUserId, setCurrentUserId] = useState(null);
  const [pinnedApplications, setPinnedApplications] = useState([]);
  const [loadingPinned, setLoadingPinned] = useState(true);
  
  // Image preview modal state
  const [previewImage, setPreviewImage] = useState(null);
  const [previewUserName, setPreviewUserName] = useState('');

  const getAuthData = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        setCurrentUserId(user._id);
      }
      return token;
    } catch (error) {
      console.error('[getAuthData] error:', error);
      return null;
    }
  };

  const fetchPinnedApplications = useCallback(async () => {
    try {
      const token = await getAuthData();
      if (!token) return;
      const response = await api.get('/applications/mine');
      const apps = response.data?.applications || [];
      const pinned = apps.filter(app => app.isPinned === true);
      setPinnedApplications(pinned);
    } catch (error) {
      console.error('Fetch pinned apps error:', error);
    } finally {
      setLoadingPinned(false);
    }
  }, []);

  const togglePinApplication = useCallback(async (applicationId) => {
    try {
      const token = await getAuthData();
      if (!token) { Alert.alert('Error', 'Not authenticated'); return; }
      const response = await api.put(`/applications/${applicationId}/pin`);
      if (response.data?.success) fetchPinnedApplications();
      else Alert.alert('Error', 'Could not change pin status.');
    } catch (error) {
      console.error('Toggle pin error:', error);
      Alert.alert('Error', 'Failed to update pin status.');
    }
  }, [fetchPinnedApplications]);

  const handleAppPress = (application) => {
    const opportunity = application.opportunityId || {};
    const opportunityId = opportunity._id || opportunity.id || application.opportunityId;
    navigation.navigate('OpportunityDetail', { opportunityId, opportunity });
  };

  const getAppIconData = (app) => {
    const opportunity = app.opportunityId || {};
    const company = opportunity.companyId || {};
    const companyName = company.name || opportunity.location || 'Company';
    const initials = companyName.charAt(0).toUpperCase();
    const color = getAvatarColor(companyName);
    return { id: app._id, name: companyName, initials, color, fullApplication: app };
  };

  const fetchConversations = useCallback(async () => {
    try {
      setError(null);
      const token = await getAuthData();
      if (!token) { resetToLogin(navigation); return; }
      const response = await api.get('/messages/inbox');
      const conversationsList = response.data?.conversations || [];
      setConversations(conversationsList);
      const totalUnread = conversationsList.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      setUnreadTotal(totalUnread);
    } catch (err) {
      console.error('Fetch conversations error:', err);
      if (err.response?.status === 401) resetToLogin(navigation);
      else setError('Failed to load messages. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = await getAuthData();
      if (!token) return;
      const response = await api.get('/messages/unread-count');
      setUnreadTotal(response.data?.unreadCount || 0);
    } catch (error) {
      console.error('Unread count error:', error);
    }
  }, []);

  const handleNewMessage = useCallback((data) => {
    const { message } = data;
    setConversations(prev => {
      const existingIndex = prev.findIndex(conv => conv.otherUser?._id === message.senderId || conv.otherUser?._id === message.receiverId);
      const otherUser = message.senderId === currentUserId ? message.receiver : message.sender;
      const newConv = { otherUser, lastMessage: message, unreadCount: message.receiverId === currentUserId ? 1 : 0, updatedAt: message.sentAt };
      let updated;
      if (existingIndex === -1) updated = [newConv, ...prev];
      else {
        updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], lastMessage: message, unreadCount: updated[existingIndex].unreadCount + (message.receiverId === currentUserId ? 1 : 0), updatedAt: message.sentAt };
        const [moved] = updated.splice(existingIndex, 1);
        updated = [moved, ...updated];
      }
      return updated;
    });
    if (message.receiverId === currentUserId) setUnreadTotal(prev => prev + 1);
  }, [currentUserId]);

  const handleUserStatusChange = useCallback((data) => {
    const { userId, isOnline, lastSeenAt } = data;
    setOnlineStatuses(prev => ({ ...prev, [userId]: { isOnline, lastSeenAt } }));
  }, []);

  const handleMessagesRead = useCallback((data) => {
    const { messageIds, readerId } = data;
    if (readerId !== currentUserId) {
      setConversations(prev => prev.map(conv => {
        if (conv.lastMessage && messageIds.includes(conv.lastMessage._id)) {
          return { ...conv, lastMessage: { ...conv.lastMessage, readStatus: true, status: 'read' } };
        }
        return conv;
      }));
    }
  }, [currentUserId]);

  // Handle avatar press to preview image
  const handleAvatarPress = (avatarUrl, userName) => {
    if (!avatarUrl) return;
    const resolvedUrl = avatarUrl.startsWith('http') 
      ? avatarUrl 
      : `${STATIC_BASE_URL}/${avatarUrl.replace(/^\//, '')}`;
    setPreviewImage(resolvedUrl);
    setPreviewUserName(userName);
  };

  useEffect(() => {
    const initSocket = async () => {
      await socketService.connect();
      socketService.on('new_message', handleNewMessage);
      socketService.on('user_status_changed', handleUserStatusChange);
      socketService.on('messages_read', handleMessagesRead);
    };
    initSocket();
    return () => {
      socketService.off('new_message');
      socketService.off('user_status_changed');
      socketService.off('messages_read');
    };
  }, [handleNewMessage, handleUserStatusChange, handleMessagesRead]);

  useEffect(() => {
    fetchConversations();
    fetchUnreadCount();
    fetchPinnedApplications();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchUnreadCount, fetchPinnedApplications]);

  useEffect(() => {
    const parent = navigation.getParent();
    if (parent) {
      const unsubscribe = parent.addListener('focus', () => { fetchPinnedApplications(); });
      return unsubscribe;
    }
  }, [navigation, fetchPinnedApplications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations();
    fetchUnreadCount();
    fetchPinnedApplications();
  };

  const handleNewMessagePress = () => navigation.navigate('MessagesMain');
  
  const handleChatPress = (conversation) => {
    const otherUser = conversation.otherUser || {};
    navigation.navigate('Chat', { 
      userId: otherUser._id, 
      userName: otherUser.fullName, 
      userAvatar: otherUser.avatar, 
      userRole: otherUser.role 
    });
  };

  // Image Preview Modal
  const ImagePreviewModal = () => (
    <Modal visible={!!previewImage} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
      <TouchableOpacity style={styles.imagePreviewOverlay} activeOpacity={1} onPress={() => setPreviewImage(null)}>
        <View style={styles.imagePreviewContainer}>
          <View style={styles.imagePreviewHeader}>
            <Text style={styles.imagePreviewName}>{previewUserName}</Text>
            <TouchableOpacity onPress={() => setPreviewImage(null)}>
              <Ionicons name="close-circle" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
          <Image 
            source={{ uri: previewImage }} 
            style={styles.imagePreviewFull} 
            resizeMode="contain"
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderPinnedApps = () => {
    if (loadingPinned) return (
      <View style={[styles.pinnedRow, { justifyContent: 'center' }]}>
        <ActivityIndicator size="small" color="#F97316" />
      </View>
    );
    if (pinnedApplications.length === 0) return (
      <View style={[styles.pinnedRow, { justifyContent: 'center' }]}>
        <Text style={{ fontSize: 12, color: '#9CA3AF' }}>No pinned applications</Text>
      </View>
    );
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pinnedRow}>
        {pinnedApplications.map(app => {
          const { id, name, initials, color, fullApplication } = getAppIconData(app);
          return (
            <AppIcon
              key={id}
              app={{ id, name, initials, color }}
              onPress={() => handleAppPress(fullApplication)}
              onLongPress={() => togglePinApplication(id)}
            />
          );
        })}
      </ScrollView>
    );
  };

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={15} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={onRefresh}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
          </View>
        )}

        <FlatList
          data={conversations}
          keyExtractor={(item) => item._id || item.otherUser?._id || Math.random().toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F97316']} tintColor="#F97316" />}
          ListHeaderComponent={
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>PINNED APPLICATIONS</Text>
                <Text style={styles.activeCount}>{pinnedApplications.length} Pinned</Text>
              </View>
              {renderPinnedApps()}
              <View style={[styles.sectionHeader, { marginTop: 24, marginBottom: 0 }]}>
                <Text style={styles.sectionTitle}>RECENT MESSAGES</Text>
                <Text style={styles.messageCount}>{conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}</Text>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <MessageRow
              item={item}
              isOnline={onlineStatuses[item.otherUser?._id]?.isOnline || false}
              onPress={() => handleChatPress(item)}
              onAvatarPress={handleAvatarPress}
            />
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={!loading && (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Messages</Text>
              <Text style={styles.emptyText}>Start a conversation by connecting with employers or workers.</Text>
              <TouchableOpacity style={styles.startBtn} onPress={handleNewMessagePress}>
                <Text style={styles.startBtnText}>Start a Conversation</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
      
      <ImagePreviewModal />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingBottom: 32, paddingTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8, textTransform: 'uppercase' },
  activeCount: { fontSize: 13, fontWeight: '700', color: '#F97316' },
  messageCount: { fontSize: 12, color: '#9CA3AF' },
  pinnedRow: { paddingHorizontal: 16, gap: 16, flexDirection: 'row', marginBottom: 8 },
  appIconWrapper: { alignItems: 'center', width: 64 },
  appIcon: { width: 56, height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  appIconText: { fontSize: 20, fontWeight: '700', color: '#fff' },
  appIconLabel: { fontSize: 11, color: '#4B5563', marginTop: 6, textAlign: 'center' },
  msgRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff' },
  msgBody: { flex: 1, marginLeft: 12, position: 'relative' },
  msgTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  msgName: { fontSize: 15, fontWeight: '500', color: '#1F2937', flex: 1, marginRight: 8 },
  msgNameUnread: { fontWeight: '700', color: '#1F2937' },
  msgTime: { fontSize: 12, color: '#9CA3AF' },
  msgPreview: { fontSize: 13, color: '#6B7280' },
  msgPreviewUnread: { color: '#1F2937', fontWeight: '500' },
  unreadBadge: { position: 'absolute', top: 20, right: 0, backgroundColor: '#F97316', borderRadius: 10, minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  separator: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 74 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', marginHorizontal: 16, borderRadius: 8, padding: 10, gap: 6, marginBottom: 8, marginTop: 8 },
  errorText: { fontSize: 13, color: '#EF4444', flex: 1 },
  retryText: { fontSize: 13, color: '#F97316', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginTop: 12, marginBottom: 6 },
  emptyText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 20 },
  startBtn: { backgroundColor: '#F97316', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25 },
  startBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  
  // Image Preview Modal Styles
  imagePreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  imagePreviewContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePreviewHeader: { 
    position: 'absolute', 
    top: 50, 
    left: 0, 
    right: 0, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  imagePreviewName: { fontSize: 18, fontWeight: '600', color: '#fff' },
  imagePreviewFull: { width: '100%', height: '80%' },
});

export default MessagesInbox;