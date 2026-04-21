import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { messageAPI } from '../../services/api';

const ChatScreen = ({ route, navigation }) => {
  const { userId, userName } = route.params || {};
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const flatListRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    try {
      setError(null);
      const { data } = await messageAPI.getConversation(userId);
      const list = data.messages || data.data || data || [];
      setMessages(Array.isArray(list) ? list.reverse() : []);
    } catch (err) {
      setError('Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSend = async () => {
    if (!messageText.trim()) return;

    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    // Optimistic add
    const tempMsg = {
      _id: `temp_${Date.now()}`,
      content: text,
      text: text,
      sender: user?._id || user?.id,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [tempMsg, ...prev]);

    try {
      await messageAPI.send({
        receiverId: userId,
        content: text,
      });
      fetchMessages();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== tempMsg._id));
      setError('Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const isSentByMe = (msg) => {
    const senderId = msg.sender?._id || msg.sender?.id || msg.sender || msg.senderId;
    const myId = user?._id || user?.id;
    return senderId === myId;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('en-UG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMessage = ({ item }) => {
    const sent = isSentByMe(item);
    const content = item.content || item.text || item.message || '';

    return (
      <View
        style={[
          styles.messageBubbleContainer,
          sent ? styles.sentContainer : styles.receivedContainer,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            sent ? styles.sentBubble : styles.receivedBubble,
            item.pending && styles.pendingBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              sent ? styles.sentText : styles.receivedText,
            ]}
          >
            {content}
          </Text>
          <Text
            style={[
              styles.messageTime,
              sent ? styles.sentTime : styles.receivedTime,
            ]}
          >
            {item.pending ? 'Sending...' : formatTime(item.sentAt || item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {(userName || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.headerName} numberOfLines={1}>
            {userName || 'User'}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : (
          <>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item._id || item.id || Math.random().toString()}
              renderItem={renderMessage}
              inverted
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No messages yet. Start the conversation!
                  </Text>
                </View>
              }
            />

            {/* Input Bar */}
            <View style={styles.inputBar}>
              <TextInput
                style={styles.textInput}
                placeholder="Type a message..."
                placeholderTextColor="#9CA3AF"
                value={messageText}
                onChangeText={setMessageText}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!messageText.trim() || sending) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={!messageText.trim() || sending}
              >
                <Ionicons
                  name="send"
                  size={18}
                  color={messageText.trim() && !sending ? '#FFFFFF' : '#D1D5DB'}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  flex: {
    flex: 1,
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    maxWidth: 200,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 8,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageBubbleContainer: {
    marginBottom: 8,
  },
  sentContainer: {
    alignItems: 'flex-end',
  },
  receivedContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sentBubble: {
    backgroundColor: '#F97316',
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  pendingBubble: {
    opacity: 0.7,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  sentText: {
    color: '#FFFFFF',
  },
  receivedText: {
    color: '#1F2937',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  sentTime: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  receivedTime: {
    color: '#9CA3AF',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    // Inverted FlatList renders from bottom; we flip vertical padding
    transform: [{ scaleY: -1 }],
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1F2937',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F97316',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
});

export default ChatScreen;
