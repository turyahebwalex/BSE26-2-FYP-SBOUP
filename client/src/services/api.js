import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ───
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
};

// ─── Profile ───
export const profileAPI = {
  getMyProfile: () => api.get('/profiles/me'),
  createProfile: (data) => api.post('/profiles', data),
  updateProfile: (data) => api.put('/profiles/me', data),
  addSkill: (data) => api.post('/profiles/skills', data),
  removeSkill: (id) => api.delete(`/profiles/skills/${id}`),
  addExperience: (data) => api.post('/profiles/experience', data),
  updateExperience: (id, data) => api.put(`/profiles/experience/${id}`, data),
  deleteExperience: (id) => api.delete(`/profiles/experience/${id}`),
  addEducation: (data) => api.post('/profiles/education', data),
  deleteEducation: (id) => api.delete(`/profiles/education/${id}`),
  updatePreference: (data) => api.put('/profiles/preferences', data),
};

// ─── Opportunities ───
export const opportunityAPI = {
  getAll: (params) => api.get('/opportunities', { params }),
  getById: (id) => api.get(`/opportunities/${id}`),
  create: (data) => api.post('/opportunities', data),
  update: (id, data) => api.put(`/opportunities/${id}`, data),
  archive: (id) => api.delete(`/opportunities/${id}`),
  getMine: () => api.get('/opportunities/employer/mine'),
};

// ─── Applications ───
export const applicationAPI = {
  apply: (data) => api.post('/applications', data),
  getMine: () => api.get('/applications/mine'),
  getForOpportunity: (oppId) => api.get(`/applications/opportunity/${oppId}`),
  updateStatus: (id, status) => api.put(`/applications/${id}/status`, { status }),
};

// ─── Matching ───
export const matchingAPI = {
  getRecommendations: () => api.get('/matching/recommendations'),
  getScore: (profileId, opportunityId) => api.get('/matching/score', { params: { profileId, opportunityId } }),
};

// ─── Learning ───
export const learningAPI = {
  generate: (data) => api.post('/learning/generate', data),
  getMine: () => api.get('/learning/mine'),
  updateProgress: (id, data) => api.put(`/learning/${id}/progress`, data),
};

// ─── CV ───
export const cvAPI = {
  generate: (data) => api.post('/cv/generate', data),
  getMine: () => api.get('/cv/mine'),
  delete: (id) => api.delete(`/cv/${id}`),
};

// ─── Messages ───
export const messageAPI = {
  send: (data) => api.post('/messages', data),
  getInbox: () => api.get('/messages/inbox'),
  getConversation: (userId) => api.get(`/messages/conversation/${userId}`),
  getUnreadCount: () => api.get('/messages/unread-count'),
};

// ─── Chatbot ───
export const chatbotAPI = {
  query: (data) => api.post('/chatbot/query', data),
};

// ─── Notifications ───
export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
};

// ─── Reports ───
export const reportAPI = {
  create: (data) => api.post('/reports', data),
  getAll: (params) => api.get('/reports', { params }),
  getByTarget: (targetType, targetId) => api.get(`/reports/target/${targetType}/${targetId}`),
  updateStatus: (id, status) => api.put(`/reports/${id}/status`, { status }),
};

// ─── Skills ───
export const skillAPI = {
  getAll: (params) => api.get('/skills', { params }),
};

// ─── Admin ───
export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  getTrends: (params) => api.get('/admin/dashboard/trends', { params }),
  getUserDistribution: () => api.get('/admin/dashboard/user-distribution'),
  getAlerts: () => api.get('/admin/dashboard/alerts'),
  getUserDensity: () => api.get('/admin/dashboard/user-density'),
  getFlagged: () => api.get('/admin/flagged'),
  moderate: (data) => api.post('/admin/moderate', data),
  getUsers: (params) => api.get('/admin/users', { params }),
  updateUser: (userId, data) => api.put(`/admin/users/${userId}`, data),
};

export default api;
