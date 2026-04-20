import React, { useState, useRef, useEffect } from 'react';
import { FiMessageCircle, FiX, FiSend } from 'react-icons/fi';
import { chatbotAPI } from '../../services/api';

const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hello! I'm your SkillBridge assistant. How can I help you today?", actions: ['Find Opportunities', 'Build Profile', 'Generate CV'] },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEnd = useRef(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const { data } = await chatbotAPI.query({ query: text });
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: data.response, actions: data.suggestedActions },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: "I'm having trouble connecting. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-24 md:bottom-6 right-4 bg-primary text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:bg-primary-dark transition z-50"
        >
          <FiMessageCircle size={24} />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 md:bottom-6 right-4 w-80 sm:w-96 h-[480px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200">
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 rounded-t-2xl flex justify-between items-center">
            <span className="font-semibold">Virtual Assistant</span>
            <button onClick={() => setIsOpen(false)}><FiX size={20} /></button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  <p>{msg.text}</p>
                  {msg.actions && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.actions.map((a) => (
                        <button
                          key={a}
                          onClick={() => sendMessage(a)}
                          className="text-xs bg-white text-primary border border-primary rounded-full px-2 py-1 hover:bg-primary hover:text-white transition"
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-2 rounded-2xl rounded-bl-md text-sm text-gray-500">
                  Typing...
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
                placeholder="Ask me anything..."
                className="flex-1 input-field text-sm !py-2"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={isLoading}
                className="bg-primary text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-primary-dark transition"
              >
                <FiSend size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatbotWidget;
