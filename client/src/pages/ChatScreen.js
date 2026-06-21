import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { messageAPI, profileAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';
import { FiArrowLeft, FiTrash2 } from 'react-icons/fi';
import ReportBottomSheet from './ReportBottomSheet';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Avatar ──────────────────────────────────────────────────────────────────

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

// ─── AttachmentPreview ──────────────────────────────────────────────────────

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

// ─── Main ChatScreen ──────────────────────────────────────────────────────

const ChatScreen = ({
  userId: propUserId,
  userName: propUserName,
  userAvatar: propUserAvatar,
}) => {
  const { userId: paramUserId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Use prop if provided, otherwise fallback to URL param
  const userId = propUserId || paramUserId;

  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachPreviews, setAttachPreviews] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reportTarget, setReportTarget] = useState(null);

  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const baseUrl = getStaticBaseUrl();

  // ─── Validate userId ────────────────────────────────────────────────────
  if (!userId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-500 text-sm">No user specified</p>
      </div>
    );
  }

  // ─── Fetch or use user info ────────────────────────────────────────────
  useEffect(() => {
    // If we already have user info from props, use it immediately
    if (propUserName && userId) {
      setOtherUser({
        _id: userId,
        fullName: propUserName,
        avatar: propUserAvatar || null,
      });
      setLoading(false);
      return;
    }

    // Otherwise fetch from API (standalone mode)
    const fetchUser = async () => {
      try {
        const { data } = await profileAPI.getProfile(userId);
        setOtherUser(data.user);
      } catch (err) {
        console.error('Failed to load user:', err);
        // If standalone and user not found, go back to inbox
        if (!propUserId) {
          navigate('/messages');
        } else {
          // In modal, just show error state
          setOtherUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [userId, propUserName, propUserAvatar, propUserId, navigate]);

  // ─── Socket.IO ──────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || !userId) return;

    socketRef.current = io(baseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {});
    socketRef.current.on('new_message', ({ message }) => {
      if (getSenderId(message.senderId) === userId || getSenderId(message.receiverId) === userId) {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
      }
    });

    socketRef.current.on('user_status_changed', ({ userId: uid, isOnline: online }) => {
      if (uid === userId) setIsOnline(online);
    });

    socketRef.current.on('typing_status', (data) => {
      if (data.userId === userId) setUserTyping(data.isTyping);
    });

    socketRef.current.on('message_read_receipt', ({ messageIds }) => {
      setMessages(prev => prev.map(m =>
        messageIds.includes(m._id) ? { ...m, readStatus: true, status: 'read' } : m
      ));
    });

    return () => socketRef.current?.disconnect();
  }, [userId]);

  // ─── Load messages ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const loadMessages = async () => {
      try {
        const { data } = await messageAPI.getConversation(userId);
        setMessages(data.messages || []);
        // Mark unread as read
        const unread = (data.messages || []).filter(m =>
          getSenderId(m.receiverId) === user._id?.toString() && !m.readStatus
        );
        if (unread.length > 0) {
          const ids = unread.map(m => m._id);
          await messageAPI.markAsRead(ids);
          socketRef.current?.emit('message_read', { messageIds: ids, senderId: userId });
        }
        scrollToBottom();
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoading(false);
      }
    };
    loadMessages();
  }, [userId, user._id]);

  // ─── Scroll helper ──────────────────────────────────────────────────────
  const scrollToBottom = () =>
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  // ─── File handling ──────────────────────────────────────────────────────
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

  // ─── Send message ──────────────────────────────────────────────────────
  const sendMessage = async () => {
    if ((!newMsg.trim() && attachments.length === 0) || !userId || sending) return;

    setSending(true);
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      _id: tempId,
      content: newMsg,
      senderId: user._id,
      receiverId: userId,
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
      formData.append('receiverId', userId);
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

  // ─── Typing ─────────────────────────────────────────────────────────────
  const handleTyping = (e) => {
    setNewMsg(e.target.value);
    if (!isTypingRef.current && e.target.value.trim()) {
      isTypingRef.current = true;
      socketRef.current?.emit('typing', { receiverId: userId, isTyping: true });
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socketRef.current?.emit('typing', { receiverId: userId, isTyping: false });
      }
    }, 1000);
  };

  // ─── Mark messages as read when they come in ──────────────────────────
  useEffect(() => {
    if (!messages.length || !userId) return;
    const unread = messages.filter(m =>
      getSenderId(m.receiverId) === user._id?.toString() && !m.readStatus && m._id !== 'sending'
    );
    if (!unread.length) return;
    const ids = unread.map(m => m._id);
    messageAPI.markAsRead(ids).catch(() => {});
    setMessages(prev => prev.map(m =>
      ids.includes(m._id) ? { ...m, readStatus: true, status: 'read' } : m
    ));
    socketRef.current?.emit('message_read', { messageIds: ids, senderId: userId });
  }, [messages, userId, user._id]);

  // ─── Report handler ────────────────────────────────────────────────────
  const handleReportMessage = (msg) => {
    setReportTarget({
      targetId: msg._id,
      targetType: 'message',
      targetLabel: `"${msg.content?.substring(0, 30)}${msg.content?.length > 30 ? '...' : ''}"`,
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (!otherUser) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-4">
        <p className="text-gray-500 text-sm">User not found</p>
      </div>
    );
  }

  const isStandalone = !propUserId;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Chat Header – only shown in standalone mode */}
      {isStandalone && (
        <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 shadow-sm">
          <Link
            to="/messages"
            className="flex items-center gap-1 text-gray-500 hover:text-orange-500 transition"
          >
            <FiArrowLeft size={20} />
            <span className="text-sm font-medium">Back</span>
          </Link>
          <Avatar user={otherUser} size={44} showDot isOnline={isOnline} />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-800 truncate leading-tight">
              {otherUser.fullName || otherUser.name || 'User'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {userTyping ? <span className="text-orange-500 font-medium">Typing...</span>
                : isOnline ? <span className="text-green-600">Online</span> : 'Offline'}
            </p>
          </div>
          <button
            onClick={() => navigate(`/profile/${userId}`)}
            className="text-xs text-orange-500 hover:text-orange-700 font-medium border border-orange-200 rounded-full px-3 py-1 transition hover:bg-orange-50"
          >
            View Profile
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
        {messages.map((msg, idx) => {
          const isSent = getSenderId(msg.senderId) === user._id?.toString();

          if (msg.moderationStatus === 'blocked') {
            return (
              <div key={msg._id || idx} className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
                {!isSent && (
                  <button onClick={() => navigate(`/profile/${userId}`)} className="focus:outline-none flex-shrink-0 mb-1">
                    <Avatar user={otherUser} size={36} />
                  </button>
                )}
                <div className="max-w-[65%] px-4 py-2 rounded-2xl bg-gray-100 text-gray-500 border border-gray-200 border-dashed">
                  <div className="flex items-center gap-2 text-sm">
                    <FiTrash2 className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span className="italic">This message has been deleted by admin.</span>
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

          return (
            <div key={msg._id || idx} className={`flex items-end gap-2 ${isSent ? 'justify-end' : 'justify-start'}`}>
              {!isSent && (
                <button onClick={() => navigate(`/profile/${userId}`)} className="focus:outline-none flex-shrink-0 mb-1">
                  <Avatar user={otherUser} size={36} />
                </button>
              )}
              <div className={`relative group max-w-[65%] px-4 py-2 rounded-2xl shadow-sm ${isSent
                ? 'bg-orange-500 text-white rounded-br-sm'
                : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'}`}>
                {msg.attachments?.map((att, ai) => (
                  <AttachmentPreview key={ai} attachment={att} baseUrl={baseUrl} />
                ))}
                {msg.content && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                )}
                <div className={`flex items-center justify-end mt-1 gap-1 ${isSent ? 'text-orange-100' : 'text-gray-400'}`}>
                  <span className="text-[10px]">{formatTime(msg.sentAt)}</span>
                  {isSent && (
                    <span className="text-orange-200 text-xs ml-1">
                      {msg.status === 'sending' ? '○' : msg.status === 'sent' ? '✓' : msg.status === 'delivered' ? '✓✓' : msg.status === 'read' ? '✓✓' : ''}
                    </span>
                  )}
                </div>
                {!isSent && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => handleReportMessage(msg)}
                      className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-red-500"
                      title="Report this message"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                )}
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

      {/* Attachment preview strip */}
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

      {/* Input bar */}
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

export default ChatScreen;