import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { authAPI } from '../services/api';
import socketService from '../services/socket';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const fetchUnreadMessageCount = async () => {
    try {
      const { data } = await api.get('/messages/unread-count');
      setUnreadMessageCount(data.unreadCount || 0);
    } catch (error) {
      console.error('Failed to fetch unread message count', error);
    }
  };

  const fetchUnreadNotificationCount = async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadNotificationCount(data.unreadCount || 0);
    } catch (error) {
      console.error('Failed to fetch unread notification count', error);
    }
  };

  const refreshUnreadCounts = () => {
    if (user) {
      fetchUnreadMessageCount();
      fetchUnreadNotificationCount();
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchUnreadMessageCount();
      fetchUnreadNotificationCount();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNewMessage = () => fetchUnreadMessageCount();
    const handleNewNotification = () => fetchUnreadNotificationCount();

    socket.on('new_message', handleNewMessage);
    socket.on('new_notification', handleNewNotification);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('new_notification', handleNewNotification);
    };
  }, [user]);

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (token) {
        const { data } = await authAPI.getMe();
        const userData = data.user || data;
        if (userData?.role === 'admin') {
          await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
          setUser(null);
        } else {
          setUser(userData);
        }
      }
    } catch (error) {
      console.log('Failed to load user:', error?.message);
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const { data } = await authAPI.login({ email, password });
      const token = data.accessToken || data.token;
      const refresh = data.refreshToken;
      const userData = data.user || data;

      if (userData?.role === 'admin') {
        return {
          success: false,
          adminBlocked: true,
          error:
            'System administrators must sign in from the web portal. Please open SkillBridge on your browser to continue.',
        };
      }

      await AsyncStorage.setItem('accessToken', token);
      if (refresh) {
        await AsyncStorage.setItem('refreshToken', refresh);
      }

      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      let message;
      if (error.response) {
        const status = error.response.status;
        if (status === 401) {
          message = 'Invalid email or password. Please try again.';
        } else {
          message =
            error.response.data?.message ||
            error.response.data?.error ||
            `Login failed (HTTP ${status}).`;
        }
      } else if (error.request) {
        message =
          "Couldn't reach the server. Check that your phone and laptop are " +
          'on the same Wi-Fi, or use your phone to hotspot the laptop.';
      } else {
        message = error.message || 'Login failed.';
      }
      return { success: false, error: message };
    }
  };

  // ── Google Sign-In ─────────────────────────────────────────
  const googleLogin = async (idToken) => {
    try {
      const response = await api.post('/auth/google', { idToken });
      const { accessToken, refreshToken, user: userData } = response.data;

      if (userData?.role === 'admin') {
        return {
          success: false,
          adminBlocked: true,
          error:
            'System administrators must sign in from the web portal.',
        };
      }

      await AsyncStorage.setItem('accessToken', accessToken);
      if (refreshToken) {
        await AsyncStorage.setItem('refreshToken', refreshToken);
      }

      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      console.error('Google login error:', error);
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Google login failed. Please try again.';
      return { success: false, error: message };
    }
  };

  // Browser-flow Google sign-in: the server runs the OAuth exactly like the
  // web app, then deep-links back to the app with freshly minted JWTs. We just
  // persist them and fetch the user (same admin-block rule as password login).
  // No native Google client, Expo login, or per-user OAuth config required.
  const googleLoginWithTokens = async (accessToken, refreshToken) => {
    try {
      if (!accessToken) {
        return { success: false, error: 'No token returned from Google sign-in.' };
      }
      await AsyncStorage.setItem('accessToken', accessToken);
      if (refreshToken) {
        await AsyncStorage.setItem('refreshToken', refreshToken);
      }

      const { data } = await authAPI.getMe();
      const userData = data.user || data;

      if (userData?.role === 'admin') {
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
        return {
          success: false,
          adminBlocked: true,
          error: 'System administrators must sign in from the web portal.',
        };
      }

      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      console.error('Google token login error:', error);
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Google login failed. Please try again.';
      return { success: false, error: message };
    }
  };
  // ───────────────────────────────────────────────────────────

  const register = async (userData) => {
    try {
      const { data } = await authAPI.register(userData);
      const token = data.accessToken || data.token;
      const refresh = data.refreshToken;

      if (token) {
        await AsyncStorage.setItem('accessToken', token);
        if (refresh) {
          await AsyncStorage.setItem('refreshToken', refresh);
        }
        const registeredUser = data.user || data;
        setUser(registeredUser);
        return { success: true, user: registeredUser };
      }

      return { success: true, message: data.message || 'Registration successful. Please log in.' };
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Registration failed. Please try again.';
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
      setUser(null);
      setUnreadMessageCount(0);
      setUnreadNotificationCount(0);
    } catch (error) {
      console.log('Logout error:', error?.message);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        googleLogin,  // ← token-based (legacy native flow)
        googleLoginWithTokens,  // ← browser-flow (server-side OAuth, deep link)
        register,
        logout,
        loadUser,
        unreadMessageCount,
        unreadNotificationCount,
        setUnreadMessageCount,
        setUnreadNotificationCount,
        refreshUnreadCounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;