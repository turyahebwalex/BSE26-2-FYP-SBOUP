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
        setUser(data.user || data);
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

      await AsyncStorage.setItem('accessToken', token);
      if (refresh) {
        await AsyncStorage.setItem('refreshToken', refresh);
      }

      const userData = data.user || data;
      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Login failed. Please check your credentials.';
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
