import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { messageAPI, profileAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import api from '../services/api';
import ReportBottomSheet from '../pages/ReportBottomSheet';
import { FiTrash2, FiMoreVertical } from 'react-icons/fi'; 

// ─── Helper Functions ────────────────────────────────────────────────────────

const getStaticBaseUrl = () => {
  const base = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  return base.replace('/api', '');
};

const getAvatarUrl = (avatar) => {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${getStaticBaseUrl()}${avatar.startsWith('/') ? avatar : `/${avatar}`}`;
};

const getSenderId = (id) => (id?._id ?? id)?.toString() ?? '';

const formatTime = (ts) => {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const minutes = Math.floor((now - date) / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString();
};

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];
const MAX_FILE_MB = 10;

// ─── UI Components ───────────────────────────────────────────────────────────

const Avatar = ({ user, size = 48, showDot = false, isOnline = false }) => {
  const url = getAvatarUrl(user?.avatar || user?.profilePicture);
  const name = user?.fullName || user?.name || 'U';
  const px = typeof size === 'number' ? size : 48;
  const fontSize = Math.round(px * 0.4);

  const sharedStyle = {
    width: px,
    height: px,
    minWidth: px,
    minHeight: px,
    borderRadius: '50%',
    flexShrink: 0,
  };

  return (
    <div className="relative flex-shrink-0" style={{ width: px, height: px }}>
      {url ? (
        <img
          src={url}
          alt={name}
          style={{ ...sharedStyle, objectFit: 'cover', border: '2px solid white' }}
          className="shadow-sm"
        />
      ) : (
        <div
          style={{
            ...sharedStyle,
            background: 'linear-gradient(135deg, #fb923c, #ea580c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 700,
            fontSize,
          }}
          className="shadow-sm"
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      {showDot && (
        <span
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: px >= 48 ? 14 : (px >= 40 ? 12 : 10),
            height: px >= 48 ? 14 : (px >= 40 ? 12 : 10),
            borderRadius: '50%',
            border: '2px solid white',
            background: isOnline ? '#22c55e' : '#d1d5db',
          }}
        />
      )}
    </div>
  );
};

const StatusIcon = ({ status }) => {
  const getIcon = () => {
    switch (status) {
      case 'sending':
        return <span className="text-orange-200 text-xs ml-1">○</span>;
      case 'sent':
        return <span className="text-orange-200 text-xs ml-1">✓</span>;
      case 'delivered':
        return <span className="text-orange-200 text-xs ml-1">✓✓</span>;
      case 'read':
        return <span className="text-blue-300 text-xs ml-1">✓✓</span>;
      case 'failed':
        return <span className="text-red-400 text-xs ml-1">!</span>;
      default:
        return null;
    }
  };
  return getIcon();
};

const AttachmentPreview = ({ attachment, baseUrl }) => {
  if (!attachment) return null;
  
  const [imgError, setImgError] = useState(false);
  const { fileType, fileUrl, fileName, fileSize } = attachment;
  
  let fullUrl = fileUrl;
  if (fullUrl && !fullUrl.startsWith('http')) {
    fullUrl = `${baseUrl}${fullUrl}`;
  }
  
  const tryUrl = (url) => {
    if (!url) return null;
    if (url.includes('/uploads/messages/')) {
      return url.replace('/uploads/messages/', '/uploads/temp/');
    }
    if (url.includes('/uploads/temp/')) {
      return url.replace('/uploads/temp/', '/uploads/messages/');
    }
    return null;
  };
  
  const altUrl = tryUrl(fullUrl);
  const [currentUrl, setCurrentUrl] = useState(fullUrl);
  
  const handleError = () => {
    if (altUrl && currentUrl !== altUrl) {
      setCurrentUrl(altUrl);
    }
  };
  
  const type = fileType || attachment.type;
  const isImage = type?.startsWith('image/');
  
  if (isImage) {
    return (
      <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img
          src={currentUrl}
          alt={fileName}
          className="max-w-xs max-h-48 rounded-lg object-cover border border-white/20"
          onError={handleError}
        />
      </a>
    );
  }
  
  const getDocIcon = () => {
    if (type === 'application/pdf') return '📄';
    if (type?.includes('word')) return '📝';
    if (type?.includes('excel') || type?.includes('spreadsheet')) return '📊';
    return '📎';
  };
  
  const icon = getDocIcon();
  const kb = fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : '';

  return (
    <a
      href={currentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 bg-white/20 rounded-lg px-3 py-2 hover:bg-white/30 transition"
    >
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate max-w-[180px]">{fileName}</p>
        {kb && <p className="text-xs opacity-70">{kb}</p>}
      </div>
      <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  );
};

const ProfileModal = ({ user, onClose }) => {
  if (!user) return null;
  const url = getAvatarUrl(user?.avatar || user?.profilePicture);
  const name = user?.fullName || user?.name || 'User';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none"
        >
          ×
        </button>
        <div className="flex justify-center mb-4">
          {url ? (
            <img
              src={url}
              alt={name}
              className="w-36 h-36 rounded-full object-cover border-4 border-orange-100 shadow-lg"
            />
          ) : (
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-6xl font-bold shadow">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <h3 className="text-xl font-bold text-gray-800">{name}</h3>
        {user.email && <p className="text-sm text-gray-500 mt-1">{user.email}</p>}
        {user.role && (
          <span className="mt-3 inline-block bg-orange-100 text-orange-700 text-xs font-semibold px-3 py-1 rounded-full capitalize">
            {user.role === 'skilled_worker' ? 'Worker' : user.role}
          </span>
        )}
        {user.bio && <p className="mt-3 text-sm text-gray-600">{user.bio}</p>}
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const MessagesPage = () => {
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [unreadCount, setUnreadCount] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineStatuses, setOnlineStatuses] = useState({});
  const [profileModal, setProfileModal] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachPreviews, setAttachPreviews] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [reportTarget, setReportTarget] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const fileInputRef = useRef(null);

  const baseUrl = getStaticBaseUrl();

  // ─── Report handler ─────────────────────────────────────────────────────────
  const handleReportMessage = (msg) => {
    setReportTarget({
      targetId: msg._id,
      targetType: 'message',
      targetLabel: `"${msg.content?.substring(0, 30)}${msg.content?.length > 30 ? '...' : ''}"`,
    });
    setOpenMenuId(null);
  };

  // ─── Delete message handler ───────────────────────────────────────────────
  const handleDeleteMessage = async (msg) => {
    setOpenMenuId(null);
    try {
      await messageAPI.deleteMessage(msg._id);
      setMessages((prev) => prev.filter((m) => m._id !== msg._id));
    } catch {
      alert('Failed to delete message');
    }
  };

  // Close message menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = (e) => {
      if (!e.target.closest('.msg-menu-container') && !e.target.closest('.msg-menu-portal')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openMenuId]);

  // ─── Socket.IO ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    socketRef.current = io(baseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {});
    socketRef.current.on('new_message', ({ message }) => {
      if (selectedConv && (getSenderId(message.senderId) === selectedConv ||
         getSenderId(message.receiverId) === selectedConv)) {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
      }
      fetchConversations();
    });

    socketRef.current.on('user_status_changed', ({ userId, isOnline: online }) => {
      setOnlineStatuses(prev => ({ ...prev, [userId]: online }));
      if (selectedConv && userId === selectedConv) setIsOnline(online);
    });

    socketRef.current.on('typing_status', (data) => {
      if (selectedConv && data.userId === selectedConv) setUserTyping(data.isTyping);
    });

    socketRef.current.on('message_read_receipt', ({ messageIds }) => {
      setMessages(prev => prev.map(m =>
        messageIds.includes(m._id) ? { ...m, readStatus: true, status: 'read' } : m
      ));
    });

    return () => socketRef.current?.disconnect();
  }, []);

  // ─── Conversations ─────────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await messageAPI.getInbox();
      const list = data.conversations || [];
      setConversations(list);
      const unreads = {};
      list.forEach(c => {
        if (c.unreadCount > 0) unreads[c.otherUser?._id] = c.unreadCount;
      });
      setUnreadCount(unreads);
      return list;
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      return [];
    }
  }, []);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return conversations;

    return conversations.filter((conv) => {
      const other = conv.otherUser || {};
      return [other.fullName, other.name, other.email].some((value) =>
        value?.toLowerCase().includes(query)
      );
    });
  }, [conversations, searchQuery]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchConversations();
      setLoading(false);
    })();
  }, [fetchConversations]);

  useEffect(() => {
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const openConversation = async (conversation) => {
    const other = conversation.otherUser;
    const otherId = other._id;
    setSelectedConv(otherId);
    setSelectedUser(other);

    try {
      const { data } = await messageAPI.getConversation(otherId);
      setMessages(data.messages || []);

      const unread = (data.messages || []).filter(m =>
        getSenderId(m.receiverId) === user._id?.toString() && !m.readStatus
      );
      if (unread.length > 0) {
        const ids = unread.map(m => m._id);
        await messageAPI.markAsRead(ids);
        setUnreadCount(prev => ({ ...prev, [otherId]: 0 }));
        socketRef.current?.emit('message_read', { messageIds: ids, senderId: otherId });
      }

      setIsOnline(onlineStatuses[otherId] ?? false);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  // ─── Attachments ────────────────────────────────────────────────────────────
  const handleFileSelect = (e) => {
    setUploadError('');
    const files = Array.from(e.target.files || []);
    const valid = [];
    const previews = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError(`"${file.name}" is not an allowed file type.`);
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setUploadError(`"${file.name}" exceeds ${MAX_FILE_MB} MB limit.`);
        continue;
      }
      valid.push(file);
      previews.push({
        name: file.name,
        type: file.type,
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      });
    }

    setAttachments(prev => [...prev, ...valid]);
    setAttachPreviews(prev => [...prev, ...previews]);
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setAttachPreviews(prev => {
      if (prev[index]?.url) URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ─── Sending ────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if ((!newMsg.trim() && attachments.length === 0) || !selectedConv || sending) return;

    setSending(true);
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      _id: tempId,
      content: newMsg,
      senderId: user._id,
      receiverId: selectedConv,
      sentAt: new Date().toISOString(),
      status: 'sending',
      readStatus: false,
      attachments: attachPreviews.map(p => ({
        fileName: p.name,
        fileType: p.type,
        fileUrl: p.url || ''
      })),
    };

    setMessages(prev => [...prev, optimistic]);
    const msgText = newMsg;
    const msgFiles = [...attachments];
    setNewMsg('');
    setAttachments([]);
    setAttachPreviews([]);
    scrollToBottom();

    try {
      const token = localStorage.getItem('accessToken');
      const url = `${baseUrl}/api/messages`;
      const formData = new FormData();
      formData.append('receiverId', selectedConv);
      if (msgText && msgText.trim()) {
        formData.append('content', msgText.trim());
      }
      msgFiles.forEach((file) => {
        formData.append('attachments', file);
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }
      const result = await response.json();
      const realMessage = result.message;
      setMessages(prev => prev.map(msg =>
        msg._id === tempId ? { ...realMessage, status: 'sent' } : msg
      ));
      socketRef.current?.emit('send_message', realMessage);
      fetchConversations();
    } catch (error) {
      console.error('Send message error:', error);
      setMessages(prev => prev.map(msg =>
        msg._id === tempId ? { ...msg, status: 'failed' } : msg
      ));
      setUploadError(error.message || 'Failed to send message');
      setTimeout(() => setUploadError(''), 3000);
    } finally {
      setSending(false);
    }
  };

  // ─── Typing ─────────────────────────────────────────────────────────────────
  const handleTyping = (e) => {
    setNewMsg(e.target.value);
    if (!isTypingRef.current && e.target.value.trim()) {
      isTypingRef.current = true;
      socketRef.current?.emit('typing', { receiverId: selectedConv, isTyping: true });
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socketRef.current?.emit('typing', { receiverId: selectedConv, isTyping: false });
      }
    }, 1000);
  };

  useEffect(() => {
    if (!messages.length || !selectedConv) return;
    const unread = messages.filter(m =>
      getSenderId(m.receiverId) === user._id?.toString() && !m.readStatus && m._id !== 'sending'
    );
    if (!unread.length) return;
    const ids = unread.map(m => m._id);
    messageAPI.markAsRead(ids).catch(() => {});
    setMessages(prev => prev.map(m =>
      ids.includes(m._id) ? { ...m, readStatus: true, status: 'read' } : m
    ));
    socketRef.current?.emit('message_read', { messageIds: ids, senderId: selectedConv });
  }, [messages, selectedConv, user._id]);

  const scrollToBottom = () =>
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-80 lg:w-96 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Messages</h1>
          <div className="mt-3 relative">
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl
                         focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none
                         transition bg-gray-50"
            />
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-16 px-6">
              <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">No conversations</p>
              <p className="text-xs text-gray-400 mt-1">Connect with workers to start chatting</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const other = conv.otherUser || {};
              const name = other.fullName || other.name || 'User';
              const lastMsg = conv.lastMessage?.content || '';
              const ts = conv.updatedAt || conv.lastMessage?.sentAt;
              const unread = unreadCount[other._id] || 0;
              const online = onlineStatuses[other._id] || false;
              const isActive = selectedConv === other._id;

              return (
                <button
                  key={conv._id}
                  onClick={() => openConversation(conv)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition
                              border-b border-gray-50 hover:bg-orange-50/60
                              ${isActive ? 'bg-orange-50 border-l-4 border-l-orange-500' : ''}`}
                >
                  <Avatar user={other} size={48} showDot isOnline={online} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className={`text-sm truncate ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {name}
                      </p>
                      <span className="text-[11px] text-gray-400 ml-1 flex-shrink-0">{formatTime(ts)}</span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${unread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      {lastMsg || 'No messages yet'}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-600">Select a conversation</h2>
              <p className="text-sm text-gray-400 mt-1">Choose from the list to start messaging</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 shadow-sm">
              <button onClick={() => setProfileModal(selectedUser)} className="focus:outline-none hover:opacity-80 transition">
                <Avatar user={selectedUser} size={44} showDot isOnline={isOnline} />
              </button>
              <div className="flex-1 min-w-0">
                <button onClick={() => setProfileModal(selectedUser)} className="text-left hover:underline focus:outline-none">
                  <h2 className="font-semibold text-gray-800 truncate leading-tight">
                    {selectedUser?.fullName || 'User'}
                  </h2>
                </button>
                <p className="text-xs text-gray-500 mt-0.5">
                  {userTyping ? <span className="text-orange-500 font-medium">Typing...</span>
                    : isOnline ? <span className="text-green-600">Online</span> : 'Offline'}
                </p>
              </div>
              <button onClick={() => setProfileModal(selectedUser)}
                className="text-xs text-orange-500 hover:text-orange-700 font-medium border border-orange-200 rounded-full px-3 py-1 transition hover:bg-orange-50">
                View Profile
              </button>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
              {messages.map((msg, idx) => {
                const isSent = getSenderId(msg.senderId) === user._id?.toString();

                // ─── Check if message was deleted by admin ───
                if (msg.moderationStatus === 'blocked') {
                  return (
                    <div key={msg._id || idx} className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
                      {!isSent && (
                        <button onClick={() => setProfileModal(selectedUser)} className="focus:outline-none flex-shrink-0 mb-1">
                          <Avatar user={selectedUser} size={36} />
                        </button>
                      )}
                      <div className="max-w-[65%] px-4 py-2 rounded-2xl bg-gray-100 text-gray-500 border border-gray-200 border-dashed">
                        <div className="flex items-center gap-2 text-sm">
                          <FiTrash2 className="w-4 h-4 text-gray-500 flex-shrink-0" /> {/* ✅ replaced emoji */}
                          <span className="italic">This message has been deleted by admin.</span>
                        </div>
                        <div className={`flex items-center justify-end mt-1 gap-1 text-gray-400`}>
                          <span className="text-[10px]">{formatTime(msg.sentAt)}</span>
                        </div>
                      </div>
                      {isSent && (
                        <div className="flex-shrink-0 mb-1">
                          <Avatar user={user} size={36} />
                        </div>
                      )}
                    </div>
                  );
                }

                // ─── Normal message rendering ───
                return (
                  <div key={msg._id || idx} className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
                    {!isSent && (
                      <button onClick={() => setProfileModal(selectedUser)} className="focus:outline-none flex-shrink-0 mb-1">
                        <Avatar user={selectedUser} size={36} />
                      </button>
                    )}
                    <div className={`relative group max-w-[65%] px-4 py-2 rounded-2xl shadow-sm ${isSent
                      ? 'bg-orange-500 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'}`}>
                      {/* Message content */}
                      {msg.attachments?.map((att, ai) => (
                        <AttachmentPreview key={ai} attachment={att} baseUrl={baseUrl} />
                      ))}
                      {msg.content && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                      )}
                      <div className={`flex items-center justify-end mt-1 gap-1 ${isSent ? 'text-orange-100' : 'text-gray-400'}`}>
                        <span className="text-[10px]">{formatTime(msg.sentAt)}</span>
                        {isSent && <StatusIcon status={msg.status} />}
                      </div>

                      {/* ─── Message Options Menu ─── */}
                      <div className="absolute top-1 right-1 msg-menu-container">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + 4, left: rect.right - 140 });
                            setOpenMenuId(openMenuId === msg._id ? null : msg._id);
                          }}
                          className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition"
                          title="Message options"
                        >
                          <FiMoreVertical size={14} />
                        </button>
                      </div>
                    </div>
                    {isSent && (
                      <div className="flex-shrink-0 mb-1">
                        <Avatar user={user} size={36} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachment Preview Strip */}
            {attachPreviews.length > 0 && (
              <div className="bg-white border-t border-gray-100 px-4 py-2 flex flex-wrap gap-2">
                {attachPreviews.map((p, i) => (
                  <div key={i} className="relative group">
                    {p.type.startsWith('image/') ? (
                      <img src={p.url} alt={p.name} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                    ) : (
                      <div className="w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 flex flex-col items-center justify-center text-center px-1">
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-[9px] text-gray-500 truncate w-full text-center">{p.name}</span>
                      </div>
                    )}
                    <button onClick={() => removeAttachment(i)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] font-bold leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploadError && (
              <div className="bg-red-50 border-t border-red-200 px-4 py-2 text-xs text-red-600 flex justify-between">
                {uploadError}
                <button onClick={() => setUploadError('')} className="font-bold ml-2">×</button>
              </div>
            )}

            {/* Message Input Bar */}
            <div className="bg-white border-t border-gray-200 px-4 py-3">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach file or image"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 hover:bg-orange-100 text-gray-500 hover:text-orange-600 flex items-center justify-center transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_TYPES.join(',')}
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'image/*';
                      fileInputRef.current.click();
                      setTimeout(() => {
                        if (fileInputRef.current) fileInputRef.current.accept = ALLOWED_TYPES.join(',');
                      }, 1000);
                    }
                  }}
                  title="Attach image"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 hover:bg-orange-100 text-gray-500 hover:text-orange-600 flex items-center justify-center transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>

                <textarea
                  rows={1}
                  placeholder="Type a message..."
                  value={newMsg}
                  onChange={handleTyping}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !sending) { e.preventDefault(); sendMessage(); } }}
                  disabled={sending}
                  className="flex-1 resize-none px-4 py-2 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none text-sm bg-gray-50 transition max-h-32 overflow-y-auto"
                  style={{ lineHeight: '1.5' }}
                />

                <button
                  onClick={sendMessage}
                  disabled={(!newMsg.trim() && attachments.length === 0) || sending}
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition font-medium
                    ${(!newMsg.trim() && attachments.length === 0) || sending
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-orange-500 hover:bg-orange-600 text-white shadow-md hover:shadow-orange-200'}`}
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 ml-1">
                Enter to send · Shift+Enter for new line · Max {MAX_FILE_MB} MB per file
              </p>
            </div>
          </>
        )}
      </div>


            {/* Message Options Dropdown (portal) */}
            {openMenuId && createPortal(
              <div
                className="msg-menu-portal fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-[9999] min-w-[140px]"
                style={{ top: menuPos.top, left: menuPos.left }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    const msg = messages.find(m => m._id === openMenuId);
                    if (msg) handleReportMessage(msg);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                  Report Message
                </button>
                <button
                  onClick={() => {
                    const msg = messages.find(m => m._id === openMenuId);
                    if (msg) handleDeleteMessage(msg);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <FiTrash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>,
              document.body
            )}
      {/* Profile Modal */}
      {profileModal && <ProfileModal user={profileModal} onClose={() => setProfileModal(null)} />}

      {/* Report Modal */}
      <ReportBottomSheet
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetId={reportTarget?.targetId}
        targetType={reportTarget?.targetType}
        targetLabel={reportTarget?.targetLabel}
      />
    </div>
  );
};

export default MessagesPage;