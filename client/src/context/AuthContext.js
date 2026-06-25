import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { connectSocket, disconnectSocket, on, off } from '../services/socket';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const navigate = useNavigate();

  const fetchUnreadCounts = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const msgRes = await api.get('/messages/unread-count');
      setUnreadMessageCount(msgRes.data?.unreadCount || 0);

      const notifRes = await api.get('/notifications?limit=1');
      setUnreadNotificationCount(notifRes.data?.unreadCount || 0);
    } catch (error) {
      console.error('Failed to fetch unread counts:', error);
    }
  }, []);

  // ─── Socket listeners ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('accessToken');
    connectSocket(token);

    const handleNewNotification = () => {
      setUnreadNotificationCount((prev) => prev + 1);
    };

    const handleNewMessage = (data) => {
      if (data.message?.receiverId === user._id) {
        setUnreadMessageCount((prev) => prev + 1);
      }
    };

    on('notification:new', handleNewNotification);
    on('new_message', handleNewMessage);

    return () => {
      off('notification:new', handleNewNotification);
      off('new_message', handleNewMessage);
      disconnectSocket();
    };
  }, [user]);

  // ─── Load user ──────────────────────────────────────────────────
  const loadUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) { setIsLoading(false); return; }

      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      await fetchUnreadCounts();
    } catch (error) {
      // If the server returns 403 (banned/suspended), the interceptor will catch it
      // and redirect to login, but we also need to clean up here.
      const status = error.response?.status;
      if (status === 403) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
        setUnreadMessageCount(0);
        setUnreadNotificationCount(0);
        // Interceptor already redirects, but we can also do it here as fallback
        navigate('/login');
      } else {
        // Other errors – just clear and redirect
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
        setUnreadMessageCount(0);
        setUnreadNotificationCount(0);
        navigate('/login');
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchUnreadCounts, navigate]);

  useEffect(() => { loadUser(); }, [loadUser]);

  // ─── Login ──────────────────────────────────────────────────────
  const login = async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
      setUser(data.user);
      await fetchUnreadCounts();
      return data.user;
    } catch (error) {
      // Propagate error to the login page
      throw error;
    }
  };

  const loginWithTokens = async (accessToken, refreshToken, user) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    setUser(user);
    await fetchUnreadCounts();
  };

  const register = async (userData) => {
    const { data } = await api.post('/auth/register', userData);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setUnreadMessageCount(0);
    setUnreadNotificationCount(0);
    navigate('/login');
  };

  const value = {
    user,
    setUser,
    isLoading,
    login,
    loginWithTokens,
    register,
    logout,
    loadUser,
    unreadMessageCount,
    setUnreadMessageCount,
    unreadNotificationCount,
    setUnreadNotificationCount,
    fetchUnreadCounts,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};