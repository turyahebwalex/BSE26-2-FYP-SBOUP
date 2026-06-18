import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native'; // ← new import
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import socketService from '../../services/socket';
import api, { messageAPI, BASE_URL } from '../../services/api';
import ReportBottomSheet from '../../components/ReportBottomSheet';

const STATIC_BASE_URL = BASE_URL.replace('/api', '');

const AVATARS = {
  woman:   require('../../assets/avatars/woman.png'),
  man:     require('../../assets/avatars/man.png'),
  default: require('../../assets/avatars/default.png'),
};

const normalizeMessage = (msg) => ({
  ...msg,
  senderId:   msg.senderId?._id   || msg.senderId,
  receiverId: msg.receiverId?._id || msg.receiverId,
  avatar:     msg.senderId?.avatar || msg.senderId?.profilePicture || msg.avatar || msg.profilePicture,
  senderName: msg.senderId?.fullName || msg.senderName || msg.sender?.fullName,
});

const resolveUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (!STATIC_BASE_URL) return null;
  const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
  return `${STATIC_BASE_URL}/${cleanUrl}`;
};

const ChatScreen = ({ route, navigation }) => {
  const { userId, userName, userAvatar } = route.params || {};

  const [currentUserId,      setCurrentUserId]      = useState(null);
  const [currentUserAvatar,  setCurrentUserAvatar]  = useState(null);
  const [messages,           setMessages]           = useState([]);
  const [messageText,        setMessageText]        = useState('');
  const [loading,            setLoading]            = useState(true);
  const [refreshing,         setRefreshing]         = useState(false); // ← new state
  const [sending,            setSending]            = useState(false);
  const [error,              setError]              = useState(null);
  const [showAttachments,    setShowAttachments]    = useState(false);
  const [uploading,          setUploading]          = useState(false);
  const [isTyping,           setIsTyping]           = useState(false);
  const [userTyping,         setUserTyping]         = useState(false);
  const [isOnline,           setIsOnline]           = useState(false);
  const [page,               setPage]               = useState(1);
  const [hasMore,            setHasMore]            = useState(true);
  const [loadingMore,        setLoadingMore]        = useState(false);
  const [downloadingId,      setDownloadingId]      = useState(null);
  const [otherUserAvatar,    setOtherUserAvatar]    = useState(userAvatar);

  const [previewImage, setPreviewImage] = useState(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const flatListRef       = useRef(null);
  const typingTimeoutRef  = useRef(null);

  // ─── Report helpers ──────────────────────────────────────────────────────────
  const openReportUser = () => {
    setShowContextMenu(false);
    setReportTarget({
      targetId:    userId,
      targetType:  'user',
      targetLabel: userName ? `"${userName}"` : 'this user',
    });
  };

  const openReportMessage = (msg) => {
    setReportTarget({
      targetId:    msg._id,
      targetType:  'message',
      targetLabel: 'this message',
    });
  };

  const closeReport = () => setReportTarget(null);

  // ─── Profile image viewer ─────────────────────────────────────────────────────
  const viewProfileImage = () => {
    const avatarUrl = resolveUrl(otherUserAvatar);
    if (avatarUrl) setPreviewImage(avatarUrl);
  };

  const viewCurrentUserImage = () => {
    const avatarUrl = resolveUrl(currentUserAvatar);
    if (avatarUrl) setPreviewImage(avatarUrl);
  };

  // ─── Avatar helpers ───────────────────────────────────────────────────────────
  const getLocalAvatar = (name) => {
    if (!name) return AVATARS.default;
    const n = name.toLowerCase();
    if (['sarah', 'emma', 'grace', 'anita', 'fatuma', 'amara'].some((x) => n.includes(x))) return AVATARS.woman;
    if (['michael', 'james', 'samuel', 'david', 'moses', 'brian'].some((x) => n.includes(x))) return AVATARS.man;
    return AVATARS.default;
  };

  const getOtherAvatarSource = () => {
    if (otherUserAvatar) return { uri: resolveUrl(otherUserAvatar) };
    if (userAvatar)      return { uri: resolveUrl(userAvatar) };
    return getLocalAvatar(userName);
  };

  const getCurrentAvatarSource = () => {
    if (currentUserAvatar) return { uri: resolveUrl(currentUserAvatar) };
    return AVATARS.default;
  };

  // ─── Fetch current user ───────────────────────────────────────────────────────
  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me');
      if (data?.user) {
        setCurrentUserId(data.user._id);
        setCurrentUserAvatar(data.user.avatar || data.user.profilePicture || null);
      }
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  }, []);

  // ─── Mark as read ─────────────────────────────────────────────────────────────
  const markMessagesAsRead = useCallback(async (messageIds) => {
    if (!messageIds?.length) return;
    try {
      await api.post('/messages/mark-read', { messageIds });
      socketService.emit('message_read', { messageIds, senderId: userId });
      setMessages((prev) =>
        prev.map((msg) =>
          messageIds.includes(msg._id) ? { ...msg, readStatus: true, status: 'read' } : msg
        )
      );
    } catch {
      // Silently fail - non-critical
    }
  }, [userId]);

  // ─── Fetch messages ───────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (pageNum = 1, append = false) => {
    try {
      setError(null);
      const response = await messageAPI.getConversation(userId, { params: { page: pageNum, limit: 30 } });
      const data = response.data;

      let newMessages = (data.messages || [])
        .map(normalizeMessage)
        .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));

      if (!append && newMessages.length > 0) {
        const firstOtherMessage = newMessages.find((m) => m.senderId !== currentUserId);
        if (firstOtherMessage?.avatar) setOtherUserAvatar(firstOtherMessage.avatar);
      }

      setHasMore(data.pagination?.hasMore || false);

      if (append) {
        setMessages((prev) => [...newMessages, ...prev]);
      } else {
        setMessages(newMessages);
        if (!currentUserId && newMessages.length > 0) {
          const first = newMessages[0];
          setCurrentUserId(first.senderId === userId ? first.receiverId : first.senderId);
        }
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      }

      const unread = newMessages.filter((msg) => msg.receiverId === currentUserId && !msg.readStatus);
      if (unread.length > 0) markMessagesAsRead(unread.map((m) => m._id));
    } catch (err) {
      if (err.response?.status === 401) navigation.replace('Login');
      else setError('Failed to load messages. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [userId, currentUserId, navigation, markMessagesAsRead]);

  // ─── Pull-to-refresh handler ──────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMessages(1, false);
  }, [fetchMessages]);

  // ─── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async (content, type = 'text', attachment = null) => {
    if ((!content.trim() && !attachment) || sending) return;
    setSending(true);

    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      _id: tempId, content,
      senderId: currentUserId, receiverId: userId,
      sentAt: new Date().toISOString(), status: 'sending',
      attachments: attachment
        ? [{ fileName: attachment.name, fileUrl: attachment.uri, fileType: type }]
        : [],
    };

    setMessages((prev) => [...prev, optimistic]);
    setMessageText('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const formData = new FormData();
      formData.append('receiverId', userId);
      formData.append('content', content);

      if (attachment) {
        const uri = Platform.OS === 'ios' ? attachment.uri.replace('file://', '') : attachment.uri;
        const mimeType = attachment.mimeType || (type === 'image' ? 'image/jpeg' : 'application/octet-stream');
        formData.append('attachments', { uri, type: mimeType, name: attachment.name });
      }

      const response = await api.post('/messages', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: [(data) => data],
      });

      const realMessage = normalizeMessage(response.data.message);
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === tempId
            ? { ...realMessage, status: isOnline ? 'delivered' : 'sent' }
            : msg
        )
      );
      const socket = socketService.getSocket();
      if (socket?.connected) socket.emit('send_message', response.data.message);
    } catch (err) {
      setMessages((prev) =>
        prev.map((msg) => msg._id === tempId ? { ...msg, status: 'failed' } : msg)
      );
      Alert.alert('Error', err.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // ─── Download helpers ─────────────────────────────────────────────────────────

  const getAuthHeader = () =>
    api.defaults.headers.common?.['Authorization'] ||
    api.defaults.headers?.['Authorization'] ||
    '';

  const downloadFile = async (fileUrl, fileName, messageId) => {
    try {
      setDownloadingId(messageId);

      const safeFileName = fileName || `file_${Date.now()}`;
      const localUri = FileSystem.cacheDirectory + safeFileName;

      const result = await FileSystem.downloadAsync(fileUrl, localUri, {
        headers: { Authorization: getAuthHeader() },
      });

      if (result.status !== 200) {
        throw new Error(`Server returned status ${result.status}`);
      }

      const sharingAvailable = await Sharing.isAvailableAsync();

      if (sharingAvailable) {
        await Sharing.shareAsync(result.uri, {
          dialogTitle: `Save ${safeFileName}`,
          UTI: 'public.data',
          mimeType: 'application/octet-stream',
        });
      } else {
        const canOpen = await Linking.canOpenURL(fileUrl);
        if (canOpen) await Linking.openURL(fileUrl);
        else Alert.alert('Error', 'Cannot open this file on your device.');
      }
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert(
        'Download Failed',
        err.message?.includes('status')
          ? 'Server rejected the request. Please try again.'
          : 'Could not download the file. Check your connection and try again.'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownload = async (attachment, messageId) => {
    const fileUrl = resolveUrl(attachment.fileUrl);

    if (!fileUrl) {
      Alert.alert('Error', 'File URL is not available.');
      return;
    }

    if (attachment.fileType === 'image') {
      Alert.alert('Image', 'What would you like to do?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open in browser',
          onPress: () =>
            Linking.openURL(fileUrl).catch(() =>
              Alert.alert('Error', 'Could not open image.')
            ),
        },
        {
          text: 'Download',
          onPress: () =>
            downloadFile(
              fileUrl,
              attachment.fileName || `image_${Date.now()}.jpg`,
              messageId
            ),
        },
      ]);
      return;
    }

    downloadFile(fileUrl, attachment.fileName || `file_${Date.now()}`, messageId);
  };

  // ─── Input / typing ───────────────────────────────────────────────────────────
  const handleSend = () => {
    if (messageText.trim()) sendMessage(messageText.trim());
  };

  const handleTyping = (text) => {
    setMessageText(text);
    if (!isTyping && text.trim()) {
      setIsTyping(true);
      socketService.sendTyping(userId, true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        socketService.sendTyping(userId, false);
      }
    }, 1000);
  };

  const loadMoreMessages = () => {
    if (!loadingMore && hasMore && !loading) {
      setLoadingMore(true);
      const next = page + 1;
      setPage(next);
      fetchMessages(next, true);
    }
  };

  // ─── File pickers ─────────────────────────────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Grant access to your photos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setShowAttachments(false);
      setUploading(true);
      await sendMessage('Sent an image', 'image', {
        uri:      result.assets[0].uri,
        type:     'image',
        name:     `image_${Date.now()}.jpg`,
        mimeType: result.assets[0].mimeType || 'image/jpeg',
      });
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ],
      copyToCacheDirectory: true,
    });
    const asset = result.assets?.[0] || (result.type === 'success' ? result : null);
    if (!result.canceled && asset) {
      setShowAttachments(false);
      setUploading(true);
      await sendMessage(`Sent a file: ${asset.name}`, 'document', {
        uri:      asset.uri,
        type:     'document',
        name:     asset.name,
        mimeType: asset.mimeType,
        size:     asset.size,
      });
      setUploading(false);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Grant camera access');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled) {
      setShowAttachments(false);
      setUploading(true);
      await sendMessage('Sent a photo', 'image', {
        uri:      result.assets[0].uri,
        type:     'image',
        name:     `photo_${Date.now()}.jpg`,
        mimeType: result.assets[0].mimeType || 'image/jpeg',
      });
      setUploading(false);
    }
  };

  // ─── Formatters ───────────────────────────────────────────────────────────────
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date     = new Date(timestamp);
    const now      = new Date();
    const diffMins  = Math.floor((now - date) / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays  = Math.floor(diffHours / 24);
    if (diffMins < 1)   return 'Just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
  };

  // ─── Status icon ──────────────────────────────────────────────────────────────
  const MessageStatusIcon = ({ status }) => {
    if (!status || status === 'sending')
      return <Ionicons name="time-outline"    size={13} color="rgba(255,255,255,0.6)"  style={styles.statusIcon} />;
    if (status === 'failed')
      return <Ionicons name="alert-circle"    size={13} color="#FCA5A5"                style={styles.statusIcon} />;
    if (status === 'sent')
      return <Ionicons name="checkmark"       size={13} color="rgba(255,255,255,0.7)"  style={styles.statusIcon} />;
    if (status === 'delivered')
      return <Ionicons name="checkmark-done"  size={13} color="rgba(255,255,255,0.7)"  style={styles.statusIcon} />;
    if (status === 'read')
      return <Ionicons name="checkmark-done"  size={13} color="#93C5FD"                style={styles.statusIcon} />;
    return null;
  };

  // ─── Render attachment ────────────────────────────────────────────────────────
  const renderAttachment = (attachments, messageId, isSent) => {
    if (!attachments?.length) return null;
    const att          = attachments[0];
    const isDownloading = downloadingId === messageId;

    if (att.fileType === 'image') {
      const imageUrl = resolveUrl(att.fileUrl);
      return (
        <TouchableOpacity
          onPress={() => imageUrl && setPreviewImage(imageUrl)}
          activeOpacity={0.85}
          style={styles.attachmentPreview}
        >
          <Image source={{ uri: imageUrl }} style={styles.attachmentImage} resizeMode="cover" />
          <View style={styles.imageDownloadOverlay}>
            <Ionicons name="expand-outline" size={18} color="#fff" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={() => handleDownload(att, messageId)}
        activeOpacity={0.8}
        style={[styles.attachmentDocument, isSent ? styles.attachDocSent : styles.attachDocReceived]}
        disabled={isDownloading}
      >
        <View style={[styles.fileIconWrap, isSent ? styles.fileIconSent : styles.fileIconReceived]}>
          {isDownloading
            ? <ActivityIndicator size="small" color={isSent ? '#fdba74' : '#6B7280'} />
            : <Ionicons name="document-text" size={26} color={isSent ? '#fdba74' : '#6B7280'} />
          }
        </View>
        <View style={styles.fileInfo}>
          <Text
            style={[styles.attachmentName, isSent ? styles.nameOnSent : styles.nameOnReceived]}
            numberOfLines={1}
          >
            {att.fileName || 'File'}
          </Text>
          <Text style={[styles.fileAction, isSent ? styles.actionOnSent : styles.actionOnReceived]}>
            {isDownloading ? 'Downloading…' : 'Tap to download'}
          </Text>
        </View>
        {!isDownloading && (
          <Ionicons
            name="arrow-down-circle-outline"
            size={22}
            color={isSent ? 'rgba(255,255,255,0.7)' : '#9CA3AF'}
          />
        )}
      </TouchableOpacity>
    );
  };

  // ─── Render message bubble ────────────────────────────────────────────────────
  const renderMessage = ({ item, index }) => {
    const isSent = item.senderId === currentUserId;
    const nextMsg = messages[index + 1];
    const isLastInGroup = !nextMsg || nextMsg.senderId !== item.senderId;
    const isDeleted = item.moderationStatus === 'blocked';

    const getSenderAvatar = () => {
      if (isSent) {
        return currentUserAvatar ? { uri: resolveUrl(currentUserAvatar) } : AVATARS.default;
      }
      if (item.avatar)     return { uri: resolveUrl(item.avatar) };
      if (otherUserAvatar) return { uri: resolveUrl(otherUserAvatar) };
      return getLocalAvatar(item.senderName || userName);
    };

    const avatarSource = getSenderAvatar();

    // --- Render deleted message placeholder ---
    if (isDeleted) {
      return (
        <View style={[styles.msgRow, isSent ? styles.msgRowSent : styles.msgRowReceived]}>
          {!isSent && (
            <View style={styles.avatarSlot}>
              {isLastInGroup ? (
                <Image source={avatarSource} style={[styles.msgAvatar, { opacity: 0.4 }]} />
              ) : (
                <View style={styles.avatarGap} />
              )}
            </View>
          )}
          <View style={[styles.bubble, styles.deletedBubble]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="trash-outline" size={14} color="#6B7280" />
              <Text style={styles.deletedText}>This message has been deleted by admin.</Text>
            </View>
            <Text style={[styles.msgTime, styles.receivedTime]}>
              {formatTime(item.sentAt)}
            </Text>
          </View>
          {isSent && (
            <View style={styles.avatarSlot}>
              {isLastInGroup ? (
                <Image source={avatarSource} style={[styles.msgAvatar, { opacity: 0.4 }]} />
              ) : (
                <View style={styles.avatarGap} />
              )}
            </View>
          )}
        </View>
      );
    }

    // --- Normal rendering ---
    const canReport = !isSent && item._id && !item._id.startsWith('temp_');

    return (
      <View style={[styles.msgRow, isSent ? styles.msgRowSent : styles.msgRowReceived]}>
        {!isSent && (
          <View style={styles.avatarSlot}>
            {isLastInGroup ? (
              <TouchableOpacity onPress={viewProfileImage} activeOpacity={0.8}>
                <Image source={avatarSource} style={styles.msgAvatar} />
              </TouchableOpacity>
            ) : (
              <View style={styles.avatarGap} />
            )}
          </View>
        )}

        <TouchableWithoutFeedback
          onLongPress={() => canReport && openReportMessage(item)}
          delayLongPress={450}
        >
          <View style={[
            styles.bubble,
            isSent ? styles.sentBubble : styles.receivedBubble,
            item.status === 'sending' && styles.pendingBubble,
          ]}>
            {renderAttachment(item.attachments, item._id, isSent)}
            {!!item.content && (
              <Text style={[styles.msgText, isSent ? styles.sentText : styles.receivedText]}>
                {item.content}
              </Text>
            )}
            <View style={styles.msgFooter}>
              <Text style={[styles.msgTime, isSent ? styles.sentTime : styles.receivedTime]}>
                {formatTime(item.sentAt)}
              </Text>
              {isSent && <MessageStatusIcon status={item.status} />}
            </View>
            {canReport && isLastInGroup && (
              <Text style={styles.longPressHint}>Hold to report</Text>
            )}
          </View>
        </TouchableWithoutFeedback>

        {isSent && (
          <View style={styles.avatarSlot}>
            {isLastInGroup ? (
              <TouchableOpacity onPress={viewCurrentUserImage} activeOpacity={0.8}>
                <Image source={avatarSource} style={styles.msgAvatar} />
              </TouchableOpacity>
            ) : (
              <View style={styles.avatarGap} />
            )}
          </View>
        )}
      </View>
    );
  };

  // ─── Image Preview Modal ──────────────────────────────────────────────────────
  const ImagePreviewModal = () => (
    <Modal
      visible={!!previewImage}
      transparent
      animationType="fade"
      onRequestClose={() => setPreviewImage(null)}
    >
      <TouchableOpacity
        style={styles.imagePreviewOverlay}
        activeOpacity={1}
        onPress={() => setPreviewImage(null)}
      >
        <View style={styles.imagePreviewContainer}>
          <Image
            source={{ uri: previewImage }}
            style={styles.imagePreviewFull}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.imagePreviewDownloadBtn}
            onPress={() => {
              if (previewImage) {
                const fileName = previewImage.split('/').pop() || `image_${Date.now()}.jpg`;
                downloadFile(previewImage, fileName, 'preview');
              }
            }}
          >
            <Ionicons name="arrow-down-circle-outline" size={28} color="#fff" />
            <Text style={styles.imagePreviewDownloadText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.imagePreviewClose}
            onPress={() => setPreviewImage(null)}
          >
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // ─── Socket setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const initSocket = async () => {
      await socketService.connect();

      socketService.on('new_message', (data) => {
        const raw = data.message;
        if (!raw) return;
        const senderId   = raw.senderId?._id   || raw.senderId;
        const receiverId = raw.receiverId?._id || raw.receiverId;
        if (senderId === userId || receiverId === userId) {
          const normalised = normalizeMessage(raw);
          if (normalised.senderId === userId && normalised.avatar) {
            setOtherUserAvatar(normalised.avatar);
          }
          setMessages((prev) =>
            prev.find((m) => m._id === normalised._id) ? prev : [...prev, normalised]
          );
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          if (normalised.receiverId === currentUserId && !normalised.readStatus) {
            markMessagesAsRead([normalised._id]);
          }
        }
      });

      socketService.on('user_status_changed', (data) => {
        if (data.userId === userId) {
          setIsOnline(data.isOnline);
          if (data.isOnline) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.senderId === currentUserId && msg.status === 'sent'
                  ? { ...msg, status: 'delivered' }
                  : msg
              )
            );
          }
        }
      });

      socketService.on('typing_status',       (data) => { if (data.userId === userId) setUserTyping(data.isTyping); });
      socketService.on('message_delivered',    (data) => { setMessages((prev) => prev.map((msg) => data.messageIds?.includes(msg._id) ? { ...msg, status: 'delivered' } : msg)); });
      socketService.on('message_read_receipt', (data) => { setMessages((prev) => prev.map((msg) => data.messageIds?.includes(msg._id) ? { ...msg, readStatus: true, status: 'read' } : msg)); });

      try {
        const { data } = await api.get(`/users/status/${userId}`);
        setIsOnline(data.isOnline);
      } catch {}
    };

    initSocket();
    return () => {
      socketService.off('new_message');
      socketService.off('typing_status');
      socketService.off('message_read_receipt');
      socketService.off('message_delivered');
      socketService.off('user_status_changed');
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [userId, currentUserId, markMessagesAsRead]);

  useEffect(() => { fetchCurrentUser(); },          [fetchCurrentUser]);
  useEffect(() => { fetchMessages(1, false); },     [fetchMessages]);

  // ─── NEW: Refresh on focus ──────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (!loading) {
        fetchMessages(1, false);
      }
    }, [fetchMessages, loading])
  );

  // ─── Attachment modal ─────────────────────────────────────────────────────────
  const AttachmentModal = () => (
    <Modal
      visible={showAttachments}
      transparent
      animationType="slide"
      onRequestClose={() => setShowAttachments(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowAttachments(false)}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Attach File</Text>
            <TouchableOpacity onPress={() => setShowAttachments(false)}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>
          <View style={styles.attachmentOptions}>
            {[
              { label: 'Camera',   icon: 'camera',        color: '#3B82F6', bg: '#EFF6FF', fn: takePhoto    },
              { label: 'Gallery',  icon: 'images',        color: '#F97316', bg: '#FFF7ED', fn: pickImage    },
              { label: 'Document', icon: 'document-text', color: '#10B981', bg: '#F0FDF4', fn: pickDocument },
            ].map(({ label, icon, color, bg, fn }) => (
              <TouchableOpacity key={label} style={styles.attachOption} onPress={fn}>
                <View style={[styles.attachIcon, { backgroundColor: bg }]}>
                  <Ionicons name={icon} size={28} color={color} />
                </View>
                <Text style={styles.attachOptionText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // ─── Context menu ─────────────────────────────────────────────────────────────
  const ContextMenu = () => (
    <Modal
      visible={showContextMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowContextMenu(false)}
    >
      <TouchableOpacity
        style={styles.contextOverlay}
        activeOpacity={1}
        onPress={() => setShowContextMenu(false)}
      >
        <View style={styles.contextMenu}>
          <TouchableOpacity style={styles.contextMenuItem} onPress={openReportUser}>
            <Ionicons name="flag-outline" size={18} color="#EF4444" />
            <Text style={styles.contextMenuText}>Report {userName || 'User'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // ─── Header avatar ────────────────────────────────────────────────────────────
  const HeaderAvatar = () => (
    <TouchableOpacity onPress={viewProfileImage} activeOpacity={0.8}>
      <View style={styles.headerAvatarWrap}>
        <Image source={getOtherAvatarSource()} style={styles.headerAvatarImage} />
        {isOnline && <View style={styles.onlineDot} />}
      </View>
    </TouchableOpacity>
  );

  // ─── Loading state ────────────────────────────────────────────────────────────
  if (loading && messages.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <HeaderAvatar />
            <Text style={styles.headerName}>{userName || 'User'}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#1F2937" />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <HeaderAvatar />
            <View>
              <Text style={styles.headerName} numberOfLines={1}>{userName || 'User'}</Text>
              <Text style={styles.headerStatus}>
                {userTyping ? 'Typing...' : isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setShowContextMenu(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical" size={22} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => fetchMessages(1, false)}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item._id?.toString() || Math.random().toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onScroll={({ nativeEvent }) => {
              if (nativeEvent.contentOffset.y < 50) loadMoreMessages();
            }}
            scrollEventThrottle={200}
            refreshing={refreshing}           // ← new prop
            onRefresh={handleRefresh}         // ← new prop
            ListHeaderComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#F97316" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>Send a message to start the conversation!</Text>
              </View>
            }
          />

          {uploading && (
            <View style={styles.uploadingBar}>
              <ActivityIndicator size="small" color="#F97316" />
              <Text style={styles.uploadingText}>Uploading file…</Text>
            </View>
          )}

          <View style={styles.inputBar}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={() => setShowAttachments(true)}
              disabled={sending}
            >
              <Ionicons name="attach" size={24} color="#F97316" />
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="#9CA3AF"
              value={messageText}
              onChangeText={handleTyping}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!messageText.trim() || sending) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!messageText.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={20} color={messageText.trim() ? '#fff' : '#D1D5DB'} />
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        <AttachmentModal />
        <ContextMenu />
        <ImagePreviewModal />
      </SafeAreaView>

      <ReportBottomSheet
        visible={!!reportTarget}
        onClose={closeReport}
        targetId={reportTarget?.targetId}
        targetType={reportTarget?.targetType}
        targetLabel={reportTarget?.targetLabel}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F0F2F5' },
  center:             { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 8 },
  backButton:         { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerInfo:         { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerAvatarWrap:   { width: 38, height: 38, position: 'relative' },
  headerAvatarImage:  { width: 38, height: 38, borderRadius: 19 },
  onlineDot:          { position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#fff' },
  headerName:         { fontSize: 15, fontWeight: '600', color: '#1F2937', maxWidth: 180 },
  headerStatus:       { fontSize: 11, color: '#6B7280', marginTop: 1 },
  menuButton:         { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

  imagePreviewOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  imagePreviewContainer:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePreviewFull:          { width: '100%', height: '80%' },
  imagePreviewClose:         { position: 'absolute', top: 50, right: 20 },
  imagePreviewDownloadBtn:   { position: 'absolute', bottom: 40, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  imagePreviewDownloadText:  { color: '#fff', fontSize: 15, fontWeight: '500' },

  contextOverlay:     { flex: 1, backgroundColor: 'transparent' },
  contextMenu:        { position: 'absolute', top: 56, right: 12, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 4, minWidth: 180, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
  contextMenuItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  contextMenuText:    { fontSize: 14, color: '#EF4444', fontWeight: '500' },

  errorBanner:        { backgroundColor: '#FEF2F2', paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText:          { fontSize: 12, color: '#EF4444', flex: 1 },
  retryText:          { fontSize: 12, color: '#F97316', fontWeight: '600' },

  messageList:        { paddingHorizontal: 8, paddingVertical: 12 },
  msgRow:             { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3, paddingHorizontal: 2 },
  msgRowSent:         { justifyContent: 'flex-end' },
  msgRowReceived:     { justifyContent: 'flex-start' },
  avatarSlot:         { width: 36, alignItems: 'center', justifyContent: 'flex-end' },
  msgAvatar:          { width: 30, height: 30, borderRadius: 15 },
  avatarGap:          { width: 30, height: 30 },
  bubble:             { maxWidth: '72%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 2 },
  sentBubble:         { backgroundColor: '#F97316', borderBottomRightRadius: 4 },
  receivedBubble:     { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  pendingBubble:      { opacity: 0.65 },
  msgText:            { fontSize: 15, lineHeight: 21 },
  sentText:           { color: '#FFFFFF' },
  receivedText:       { color: '#1F2937' },
  msgFooter:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 3 },
  msgTime:            { fontSize: 10 },
  sentTime:           { color: 'rgba(255,255,255,0.65)' },
  receivedTime:       { color: '#9CA3AF' },
  statusIcon:         { marginLeft: 1 },
  longPressHint:      { fontSize: 9, color: '#9CA3AF', marginTop: 3, textAlign: 'right' },

  attachmentPreview:      { marginBottom: 6, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  attachmentImage:        { width: 200, height: 148, borderRadius: 12 },
  imageDownloadOverlay:   { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, padding: 5 },
  attachmentDocument:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, marginBottom: 6, gap: 10 },
  attachDocSent:          { backgroundColor: 'rgba(0,0,0,0.15)' },
  attachDocReceived:      { backgroundColor: '#F3F4F6' },
  fileIconWrap:           { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  fileIconSent:           { backgroundColor: 'rgba(255,255,255,0.18)' },
  fileIconReceived:       { backgroundColor: '#E5E7EB' },
  fileInfo:               { flex: 1 },
  attachmentName:         { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  nameOnSent:             { color: '#FFFFFF' },
  nameOnReceived:         { color: '#1F2937' },
  fileAction:             { fontSize: 11 },
  actionOnSent:           { color: 'rgba(255,255,255,0.65)' },
  actionOnReceived:       { color: '#9CA3AF' },

  emptyContainer:     { alignItems: 'center', paddingVertical: 60 },
  emptyTitle:         { fontSize: 16, fontWeight: '500', color: '#6B7280', marginTop: 12, marginBottom: 6 },
  emptyText:          { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 6 },
  attachButton:       { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  textInput:          { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 22, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 15, color: '#1F2937', maxHeight: 100 },
  sendButton:         { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F97316', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#F3F4F6' },
  uploadingBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, backgroundColor: '#FEF3C7', gap: 8 },
  uploadingText:      { fontSize: 12, color: '#D97706', fontWeight: '500' },

  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent:       { backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  modalHandle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 },
  modalHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle:         { fontSize: 17, fontWeight: '600', color: '#1F2937' },
  attachmentOptions:  { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 4 },
  attachOption:       { alignItems: 'center', gap: 8 },
  attachIcon:         { width: 62, height: 62, borderRadius: 31, justifyContent: 'center', alignItems: 'center' },
  attachOptionText:   { fontSize: 12, color: '#4B5563', fontWeight: '500' },

  // ─── NEW styles for deleted messages ─────────────────────────────────────────
  deletedBubble: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  deletedText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
});

export default ChatScreen;