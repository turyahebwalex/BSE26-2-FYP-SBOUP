import React, { useState, useEffect, useMemo } from 'react';
import { notificationAPI } from '../services/api';
import {
  FiStar,
  FiFileText,
  FiMessageSquare,
  FiBook,
  FiAlertTriangle,
  FiBell,
  FiUserPlus,
  FiShield,
} from 'react-icons/fi';

const typeIcons = {
  match: <FiStar size={20} className="text-yellow-500" />,
  application_update: <FiFileText size={20} className="text-blue-500" />,
  message: <FiMessageSquare size={20} className="text-indigo-500" />,
  learning: <FiBook size={20} className="text-green-500" />,
  fraud_alert: <FiAlertTriangle size={20} className="text-red-500" />,
  system: <FiBell size={20} className="text-gray-500" />,
  connection_request: <FiUserPlus size={20} className="text-purple-500" />,
  account_status: <FiShield size={20} className="text-red-500" />, // new
};

// All available tabs – matches the backend types we care about
const FILTER_TABS = [
  { key: '', label: 'All' },
  { key: 'match', label: 'Match' },
  { key: 'application_update', label: 'Application Update' },
  { key: 'learning', label: 'Learning' },
  { key: 'message', label: 'Message' },
  { key: 'account_status', label: 'Account Status' },
];

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data } = await notificationAPI.getAll();
        setNotifications(data.notifications || []);
      } catch (error) {
        console.error('Failed to load notifications', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredNotifications = useMemo(() => {
    if (!filter) return notifications;
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  const markRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
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
        <button onClick={markAllRead} className="text-primary text-sm hover:underline">
          Mark all read
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`badge whitespace-nowrap ${
              filter === tab.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">Loading...</p>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map((n) => (
            <button
              key={n._id}
              onClick={() => markRead(n._id)}
              className={`card w-full text-left flex gap-3 items-start transition ${
                !n.isRead ? 'bg-primary/5 border-primary/20' : ''
              }`}
            >
              <span className="text-xl flex-shrink-0 w-8 h-8 flex items-center justify-center">
                {typeIcons[n.type] || <FiBell size={20} className="text-gray-400" />}
              </span>
              <div className="flex-1">
                <p className={`text-sm ${!n.isRead ? 'font-semibold' : ''}`}>{n.content}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            </button>
          ))}
          {filteredNotifications.length === 0 && (
            <p className="text-center text-gray-400 py-8">No notifications</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;