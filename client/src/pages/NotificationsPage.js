import React, { useState, useEffect } from 'react';
import { notificationAPI } from '../services/api';

const typeIcons = {
  match: '🎯', application_update: '📋', message: '💬', learning: '📚',
  fraud_alert: '⚠️', system: '🔔', connection_request: '🤝',
};

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const params = filter ? { type: filter } : {};
        const { data } = await notificationAPI.getAll(params);
        setNotifications(data.notifications || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, [filter]);

  const markRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications((prev) => prev.map((n) => n._id === id ? { ...n, isRead: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Notifications</h1>
        <button onClick={markAllRead} className="text-primary text-sm hover:underline">Mark all read</button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {['', 'match', 'application_update', 'learning', 'message'].map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`badge whitespace-nowrap ${filter === t ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {t ? t.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'All'}
          </button>
        ))}
      </div>

      {loading ? <p className="text-center text-gray-400 py-8">Loading...</p> : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <button key={n._id} onClick={() => markRead(n._id)}
              className={`card w-full text-left flex gap-3 items-start transition ${!n.isRead ? 'bg-primary/5 border-primary/20' : ''}`}>
              <span className="text-xl">{typeIcons[n.type] || '🔔'}</span>
              <div className="flex-1">
                <p className={`text-sm ${!n.isRead ? 'font-semibold' : ''}`}>{n.content}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            </button>
          ))}
          {notifications.length === 0 && <p className="text-center text-gray-400 py-8">No notifications</p>}
        </div>
      )}
    </div>
  );
};
export default NotificationsPage;
