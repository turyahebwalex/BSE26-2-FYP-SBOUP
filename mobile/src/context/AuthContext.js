import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';

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

  useEffect(() => {
    loadUser();
  }, []);

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
      // Distinguish a server rejection (bad credentials, locked account, etc.)
      // from a network failure (timeout, unreachable host) — the latter shows
      // "check your credentials" otherwise, which sends people on a wild goose
      // chase when the real cause is a Wi-Fi or backend-URL problem.
      let message;
      if (error.response) {
        message =
          error.response.data?.message ||
          error.response.data?.error ||
          `Login failed (HTTP ${error.response.status}).`;
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
        register,
        logout,
        loadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
