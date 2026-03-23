import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const loadUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) { setIsLoading(false); return; }

      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const { data } = await api.get('/auth/me');
      setUser(data.user);
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      delete api.defaults.headers.common['Authorization'];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
    setUser(data.user);
    return data.user;
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
    navigate('/login');
  };

  const value = { user, setUser, isLoading, login, register, logout, loadUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
