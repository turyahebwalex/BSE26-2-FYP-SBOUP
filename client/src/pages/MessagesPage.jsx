import React, { useState, useEffect } from 'react';
import { messageAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const MessagesPage = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const { data } = await messageAPI.getInbox(); setConversations(data.conversations || []); } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const openConversation = async (otherUserId) => {
    setSelectedConv(otherUserId);
    try { const { data } = await messageAPI.getConversation(otherUserId); setMessages(data.messages || []); } catch {}
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedConv) return;
    try {
      await messageAPI.send({ receiverId: selectedConv, content: newMsg });
      setMessages((prev) => [...prev, { senderId: user._id, content: newMsg, sentAt: new Date() }]);
      setNewMsg('');
    } catch {}
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Inbox</h1>
      <div className="flex gap-4 h-[60vh]">
        {/* Conversation list */}
        <div className="w-1/3 border-r pr-4 overflow-y-auto">
          {loading ? <p className="text-gray-400 text-sm">Loading...</p> :
            conversations.length === 0 ? <p className="text-gray-400 text-sm">No messages yet</p> :
            conversations.map((c) => (
              <button key={c._id} onClick={() => openConversation(c._id)}
                className={`w-full text-left p-3 rounded-xl mb-2 transition ${selectedConv === c._id ? 'bg-primary/10' : 'hover:bg-gray-50'}`}>
                <p className="font-medium text-sm truncate">{c._id}</p>
                <p className="text-xs text-gray-500 truncate">{c.lastMessage?.content}</p>
              </button>
            ))
          }
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">Select a conversation</div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.senderId === user._id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                      m.senderId === user._id ? 'bg-primary text-white' : 'bg-gray-100'}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input-field flex-1" placeholder="Type a message..." value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()} />
                <button onClick={sendMessage} className="btn-primary !px-4">Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
export default MessagesPage;
