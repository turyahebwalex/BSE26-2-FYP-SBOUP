import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_PORT = 5000;

// Auto-detect the backend host from Metro's dev-server address. When a phone
// connects via LAN, hostUri looks like "10.70.1.222:8081" — using that same
// IP for the backend means any collaborator on the same Wi-Fi as their phone
// can run `docker compose up --build` without editing mobile/.env.
// Set EXPO_PUBLIC_API_URL only to override (tunnels, deployed backend, etc).
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host && !host.endsWith('.exp.direct')) {
    return `http://${host}:${API_PORT}/api`;
  }

  return `http://localhost:${API_PORT}/api`;
}

const BASE_URL = resolveBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch (_) {}
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
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
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        const newAccessToken = data.accessToken || data.token;
        await AsyncStorage.setItem('accessToken', newAccessToken);
        if (data.refreshToken) await AsyncStorage.setItem('refreshToken', data.refreshToken);

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

// ── Auth ──
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
};

// ── Profile ──
export const profileAPI = {
  getMyProfile: () => api.get('/profiles/me'),
  getProfile: (id) => api.get(`/profiles/${id}`),
  createProfile: (data) => api.post('/profiles', data),
  updateProfile: (data) => api.put('/profiles/me', data),
  addSkill: (data) => api.post('/profiles/skills', data),
  removeSkill: (skillId) => api.delete(`/profiles/skills/${skillId}`),
  addExperience: (data) => api.post('/profiles/experience', data),
  updateExperience: (expId, data) => api.put(`/profiles/experience/${expId}`, data),
  deleteExperience: (expId) => api.delete(`/profiles/experience/${expId}`),
  addEducation: (data) => api.post('/profiles/education', data),
  deleteEducation: (eduId) => api.delete(`/profiles/education/${eduId}`),
  updatePreferences: (data) => api.put('/profiles/preferences', data),
};

// ── Opportunity ──
export const opportunityAPI = {
  getAll: (params) => api.get('/opportunities', { params }),
  getOne: (id) => api.get(`/opportunities/${id}`),
  create: (data) => api.post('/opportunities', data),
  update: (id, data) => api.put(`/opportunities/${id}`, data),
  archive: (id) => api.delete(`/opportunities/${id}`),
  getMyOpportunities: () => api.get('/opportunities/employer/mine'),
};

// ── Application ──
export const applicationAPI = {
  apply: (data) => api.post('/applications', data),
  getMyApplications: () => api.get('/applications/mine'),
  getForOpportunity: (opportunityId) => api.get(`/applications/opportunity/${opportunityId}`),
  updateStatus: (id, status) => api.put(`/applications/${id}/status`, { status }),
  withdraw: (id) => api.put(`/applications/${id}/withdraw`),
};

// ── Matching ──
export const matchingAPI = {
  getRecommendations: () => api.get('/matching/recommendations'),
  getMatchScore: (profileId, opportunityId) =>
    api.get('/matching/score', { params: { profileId, opportunityId } }),
};

// ── Learning ──
export const learningAPI = {
  getMine: () => api.get('/learning/mine'),
  generate: (targetSkill) => api.post('/learning/generate', { targetSkill }),
  updateProgress: (pathId, resourceIndex, isCompleted) =>
    api.put(`/learning/${pathId}/progress`, { resourceIndex, isCompleted }),
};

// ── CV ──
export const cvAPI = {
  generate: (options) => api.post('/cv/generate', options),
  getMine: () => api.get('/cv/mine'),
  getOne: (id) => api.get(`/cv/${id}`),
  delete: (id) => api.delete(`/cv/${id}`),
};

// ── Message ──
export const messageAPI = {
  getInbox: () => api.get('/messages/inbox'),
  getConversation: (userId) => api.get(`/messages/conversation/${userId}`),
  getUnreadCount: () => api.get('/messages/unread-count'),
  send: (data) => api.post('/messages', data),
};

// ── Notification ──
export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
};

// ── Skill ──
export const skillAPI = {
  getAll: (params) => api.get('/skills', { params }),
  getCategories: () => api.get('/skills/categories'),
};

// ── Company ──
export const companyAPI = {
  getAll: (params) => api.get('/companies', { params }),
  getOne: (id) => api.get(`/companies/${id}`),
  create: (data) => api.post('/companies', data),
  update: (id, data) => api.put(`/companies/${id}`, data),
};

// ── Report ──
export const reportAPI = {
  create: (data) => api.post('/reports', data),
};

export default api;
