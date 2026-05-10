import React, { useState, useRef, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { chatbotAPI } from '../services/api';

const INITIAL_MESSAGE = {
  id: '0',
  role: 'bot',
  text: "Hi! I'm Kazi, your SBOUP assistant. I can help you find opportunities, improve your profile, generate CVs, and more. What would you like to know?",
  actions: ['Find Opportunities', 'Build Profile', 'Generate CV'],
};

const ChatbotWidget = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen]     = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput]       = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, isOpen]);

  const sendMessage = async (text) => {
    const query = (text || input).trim();
    if (!query) return;

    // Add user message immediately
    const userMsg = { id: Date.now().toString(), role: 'user', text: query };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const { data } = await chatbotAPI.query({
        query,
        userId:   user?._id || user?.id || '',
        userRole: user?.role || 'skilled_worker',
      });

      const botMsg = {
        id:      (Date.now() + 1).toString(),
        role:    'bot',
        text:    data.response || "I'm having trouble right now. Please try again.",
        actions: data.suggestedActions || [],
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id:      (Date.now() + 1).toString(),
          role:    'bot',
          text:    "I'm having trouble connecting. Please try again.",
          actions: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowBot]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
            {item.text}
          </Text>

          {/* Suggested action chips */}
          {!isUser && item.actions && item.actions.length > 0 && (
            <View style={styles.actionsRow}>
              {item.actions.map((action) => (
                <TouchableOpacity
                  key={action}
                  style={styles.actionChip}
                  onPress={() => sendMessage(action)}
                >
                  <Text style={styles.actionChipText}>{action}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      {/* Floating button — always visible when chat is closed */}
      {!isOpen && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setIsOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-ellipses" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Chat modal */}
      <Modal
        visible={isOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.chatPanel}>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.avatarDot} />
                <View>
                  <Text style={styles.headerTitle}>Kazi</Text>
                  <Text style={styles.headerSubtitle}>SBOUP Assistant</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() =>
                listRef.current?.scrollToEnd({ animated: true })
              }
              ListFooterComponent={
                isLoading ? (
                  <View style={styles.typingRow}>
                    <View style={styles.typingBubble}>
                      <ActivityIndicator size="small" color="#F97316" />
                      <Text style={styles.typingText}>Kazi is typing...</Text>
                    </View>
                  </View>
                ) : null
              }
            />

            {/* Input bar */}
            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                placeholder="Ask me anything..."
                placeholderTextColor="#9CA3AF"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => sendMessage()}
                returnKeyType="send"
                editable={!isLoading}
                multiline={false}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
                onPress={() => sendMessage()}
                disabled={!input.trim() || isLoading}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // ── Floating action button ──
  fab: {
    position:        'absolute',
    bottom:          90,       // above the bottom nav bar
    right:           20,
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: '#F97316',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#F97316',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    8,
    elevation:       8,
    zIndex:          999,
  },

  // ── Modal overlay ──
  modalOverlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },

  // ── Chat panel ──
  chatPanel: {
    height:                '75%',
    backgroundColor:       '#FFFFFF',
    borderTopLeftRadius:   24,
    borderTopRightRadius:  24,
    overflow:              'hidden',
  },

  // ── Header ──
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    backgroundColor: '#F97316',
    paddingHorizontal: 20,
    paddingVertical:   14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  avatarDot: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  headerTitle: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color:    'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  closeButton: {
    padding: 4,
  },

  // ── Messages ──
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical:   12,
    gap:               8,
  },
  messageRow: {
    marginBottom: 6,
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  messageRowBot: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth:     '82%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical:   10,
  },
  bubbleUser: {
    backgroundColor:    '#F97316',
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor:   '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize:   14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextBot: {
    color: '#1F2937',
  },

  // ── Suggested actions ──
  actionsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
    marginTop:     8,
  },
  actionChip: {
    backgroundColor: '#FFFFFF',
    borderRadius:    14,
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderWidth:    1,
    borderColor:    '#F97316',
  },
  actionChipText: {
    fontSize:   12,
    color:      '#F97316',
    fontWeight: '500',
  },

  // ── Typing indicator ──
  typingRow: {
    alignItems:  'flex-start',
    marginTop:   4,
    marginBottom: 8,
  },
  typingBubble: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    backgroundColor: '#F3F4F6',
    borderRadius:   18,
    paddingHorizontal: 14,
    paddingVertical:   10,
  },
  typingText: {
    fontSize: 13,
    color:    '#9CA3AF',
  },

  // ── Input bar ──
  inputBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderTopWidth:  1,
    borderTopColor:  '#F3F4F6',
    gap:             10,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex:            1,
    backgroundColor: '#F9FAFB',
    borderRadius:    22,
    paddingHorizontal: 16,
    paddingVertical:   10,
    fontSize:        14,
    color:           '#1F2937',
    borderWidth:     1,
    borderColor:     '#E5E7EB',
  },
  sendButton: {
    width:           42,
    height:          42,
    borderRadius:    21,
    backgroundColor: '#F97316',
    justifyContent:  'center',
    alignItems:      'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#FED7AA',
  },
});

export default ChatbotWidget;
