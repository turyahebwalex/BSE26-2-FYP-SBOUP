import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_PORT = 5000;

// Auto-detect the backend host from Metro's dev-server address.
function resolveBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

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
console.log('🔍 [API] BASE_URL =', BASE_URL);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300000, // 5 minutes — needed for local Ollama on CPU
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

// Endpoints where a 401 means "bad credentials", not "expired session".
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) =>
      originalRequest?.url?.endsWith(path)
    );

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
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
  updateAvatar: (avatarBase64) => api.put('/profiles/avatar', { avatarBase64 }),
  addSkill: (data) => api.post('/profiles/skills', data),
  removeSkill: (skillId) => api.delete(`/profiles/skills/${skillId}`),
  addExperience: (data) => api.post('/profiles/experience', data),
  updateExperience: (expId, data) => api.put(`/profiles/experience/${expId}`, data),
  deleteExperience: (expId) => api.delete(`/profiles/experience/${expId}`),
  addEducation: (data) => api.post('/profiles/education', data),
  deleteEducation: (eduId) => api.delete(`/profiles/education/${eduId}`),
  updatePreferences: (data) => api.put('/profiles/preferences', data),
  addPortfolioItem: (data) => api.post('/profiles/portfolio', data),
  removePortfolioItem: (itemId) => api.delete(`/profiles/portfolio/${itemId}`),
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
  // Pass targetSkill OR opportunityId; opportunity-driven mode engages
  // the §6.0 matching-engine consistency contract on the AI service.
  generate: ({ targetSkill, opportunityId } = {}) =>
    api.post('/learning/generate', { targetSkill, opportunityId }),
  // Pure analysis (no DB write). Returns missingSkills + matchBreakdown
  // + aliasHints for a (profile, opportunity) pair. Useful for the
  // mobile breakdown card to surface 'did you mean…?' hints alongside
  // the matching-engine's authoritative missing-skills chips.
  skillGaps: (opportunityId) =>
    api.post('/learning/skill-gaps', { opportunityId }),
  // Drives the §6.2.4 'Close Your Skill Gaps' dashboard section.
  dashboardFit: () => api.post('/learning/dashboard-fit', {}),
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
  suggest: (data) => api.post('/skills/suggest', data),
  addCustom: (name) => api.post('/skills/custom', { name }),
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

// ── Chatbot ──
export const chatbotAPI = {
  query: (data) => api.post('/chatbot/query', data),
};

export default api;
export { BASE_URL };