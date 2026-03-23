import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach access token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      // silently fail
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - refresh on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const { data } = await axios.post(`${BASE_URL}/auth/refresh-token`, {
          refreshToken,
        });

        const newAccessToken = data.accessToken || data.token;
        await AsyncStorage.setItem('accessToken', newAccessToken);
        if (data.refreshToken) {
          await AsyncStorage.setItem('refreshToken', data.refreshToken);
        }

        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken']);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth API ──
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  refreshToken: (refreshToken) =>
    api.post('/auth/refresh-token', { refreshToken }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
};

// ── Profile API ──
export const profileAPI = {
  getMyProfile: () => api.get('/profile/me'),
  getProfile: (userId) => api.get(`/profile/${userId}`),
  createProfile: (data) => api.post('/profile', data),
  updateProfile: (data) => api.put('/profile', data),
};

// ── Opportunity API ──
export const opportunityAPI = {
  getAll: (params) => api.get('/opportunities', { params }),
  getOne: (id) => api.get(`/opportunities/${id}`),
  create: (data) => api.post('/opportunities', data),
  update: (id, data) => api.put(`/opportunities/${id}`, data),
  delete: (id) => api.delete(`/opportunities/${id}`),
  getMyOpportunities: () => api.get('/opportunities/mine'),
  search: (params) => api.get('/opportunities/search', { params }),
};

// ── Application API ──
export const applicationAPI = {
  apply: (data) => api.post('/applications', data),
  getMyApplications: () => api.get('/applications/me'),
  getForOpportunity: (opportunityId) =>
    api.get(`/applications/opportunity/${opportunityId}`),
  getOne: (id) => api.get(`/applications/${id}`),
  updateStatus: (id, status) =>
    api.put(`/applications/${id}/status`, { status }),
  withdraw: (id) => api.put(`/applications/${id}/withdraw`),
};

// ── Matching API ──
export const matchingAPI = {
  getRecommendations: () => api.get('/matching/recommendations'),
  getMatchScore: (opportunityId) =>
    api.get(`/matching/score/${opportunityId}`),
  getTopCandidates: (opportunityId) =>
    api.get(`/matching/candidates/${opportunityId}`),
};

// ── Learning API ──
export const learningAPI = {
  getMine: () => api.get('/learning/my-paths'),
  getAll: () => api.get('/learning/paths'),
  getOne: (id) => api.get(`/learning/paths/${id}`),
  generate: (skillId) => api.post('/learning/generate', { skillId }),
  updateProgress: (pathId, resourceId, progress) =>
    api.put(`/learning/paths/${pathId}/progress`, { resourceId, progress }),
};

// ── CV API ──
export const cvAPI = {
  generate: (options) => api.post('/cv/generate', options),
  getTemplates: () => api.get('/cv/templates'),
  download: (id) => api.get(`/cv/download/${id}`, { responseType: 'blob' }),
};

// ── Message API ──
export const messageAPI = {
  getInbox: () => api.get('/messages/inbox'),
  getConversation: (userId) => api.get(`/messages/conversation/${userId}`),
  send: (data) => api.post('/messages', data),
  markAsRead: (messageId) => api.put(`/messages/${messageId}/read`),
};

// ── Notification API ──
export const notificationAPI = {
  getAll: () => api.get('/notifications'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

// ── Skill API ──
export const skillAPI = {
  getAll: () => api.get('/skills'),
  getCategories: () => api.get('/skills/categories'),
  search: (query) => api.get('/skills/search', { params: { q: query } }),
};

export default api;
