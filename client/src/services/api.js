import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  // Do NOT set a default Content-Type globally – let axios decide per request
  headers: {},
});

// ─── Request interceptor – attach token ──────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor – handle 401 (refresh) and 403 (banned/suspended) ──
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const errorMsg = error.response?.data?.error || '';

    // ─── 403 – Account banned/suspended ──────────────────────────────
    if (status === 403 &&
         (errorMsg.toLowerCase().includes('banned') ||
          errorMsg.toLowerCase().includes('suspended'))) {
      // Clear all auth data
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      delete api.defaults.headers.common['Authorization'];

      // Redirect to login with error message
      const encodedMsg = encodeURIComponent(errorMsg);
      window.location.href = `/login?error=${encodedMsg}`;
      return Promise.reject(error);
    }

    // ─── 401 – Token expired / invalid ──────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed – clear and redirect
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ─── All API functions (same as before) ──────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
};

export const profileAPI = {
  getMyProfile: () => api.get('/profiles/me'),
  getProfile: (id) => api.get(`/profiles/${id}`),
  getProfileByUserId: (userId) => api.get(`/profiles/user/${userId}`),
  createProfile: (data) => api.post('/profiles', data),
  updateProfile: (data) => api.put('/profiles/me', data),
  updateAvatar: (avatarBase64) => api.put('/profiles/avatar', { avatarBase64 }),
  updateUserAvatar: (avatarBase64) => api.post('/users/avatar', { avatarBase64 }),
  addSkill: (data) => api.post('/profiles/skills', data),
  removeSkill: (id) => api.delete(`/profiles/skills/${id}`),
  addExperience: (data) => api.post('/profiles/experience', data),
  updateExperience: (id, data) => api.put(`/profiles/experience/${id}`, data),
  deleteExperience: (id) => api.delete(`/profiles/experience/${id}`),
  addEducation: (data) => api.post('/profiles/education', data),
  deleteEducation: (id) => api.delete(`/profiles/education/${id}`),
  updatePreference: (data) => api.put('/profiles/preferences', data),
  addPortfolioItem: (data) => api.post('/profiles/portfolio', data),
  removePortfolioItem: (itemId) => api.delete(`/profiles/portfolio/${itemId}`),
};

export const opportunityAPI = {
  getAll: (params) => api.get('/opportunities', { params }),
  getById: (id) => api.get(`/opportunities/${id}`),
  create: (data) => api.post('/opportunities', data),
  update: (id, data) => api.put(`/opportunities/${id}`, data),
  archive: (id) => api.delete(`/opportunities/${id}`),
  getMine: () => api.get('/opportunities/employer/mine'),
  getApplicationOptions: (opportunityId) => api.get(`/opportunities/${opportunityId}/apply-options`),
  getExternalApplyUrl: (opportunityId) => api.get(`/opportunities/${opportunityId}/external-url`),
  getApplicationForm: (opportunityId) => api.get(`/opportunities/${opportunityId}/application-form`),
  checkApplicationStatus: (opportunityId) => api.get(`/opportunities/${opportunityId}/check-application`),
  applyViaMessage: (data) => api.post('/opportunities/apply-by-message', data),
  submitAppeal: (id, data) => api.post(`/opportunities/${id}/appeal`, data),
};

export const applicationAPI = {
  apply: (data) => api.post('/applications', data),
  applyWithFiles: (formData, onUploadProgress) =>
    api.post('/applications', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }),
  getMine: () => api.get('/applications/mine'),
  getForOpportunity: (oppId) => api.get(`/applications/opportunity/${oppId}`),
  getApplicationDocuments: (applicationId) => api.get(`/applications/${applicationId}/documents`),
  updateStatus: (id, status) => api.put(`/applications/${id}/status`, { status }),
  withdraw: (id) => api.put(`/applications/${id}/withdraw`),
  togglePin: (id) => api.put(`/applications/${id}/pin`),
};

export const matchingAPI = {
  getRecommendations: () => api.get('/matching/recommendations'),
  getScore: (profileId, opportunityId) => api.get('/matching/score', { params: { profileId, opportunityId } }),
};

export const learningAPI = {
  generate: (data) => api.post('/learning/generate', data),
  getMine: () => api.get('/learning/mine'),
  updateProgress: (id, data) => api.put(`/learning/${id}/progress`, data),
  skillGaps: (opportunityId) => api.post('/learning/skill-gaps', { opportunityId }),
  dashboardFit: () => api.post('/learning/dashboard-fit', {}),
  autoSuggest: ({ max = 3, force = false } = {}) => api.post('/learning/auto-suggest', { max, force }),
};

export const cvAPI = {
  generate: (data) => api.post('/cv/generate', data),
  getMine: () => api.get('/cv/mine'),
  getOne: (id) => api.get(`/cv/${id}`),
  delete: (id) => api.delete(`/cv/${id}`),
};

export const messageAPI = {
  send: (data) => {
    if (data instanceof FormData) {
      return api.post('/messages', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return api.post('/messages', data);
  },
  getInbox: () => api.get('/messages/inbox'),
  getConversation: (userId, params) => api.get(`/messages/conversation/${userId}`, { params }),
  getUnreadCount: () => api.get('/messages/unread-count'),
  markAsRead: (messageIds) => api.post('/messages/mark-read', { messageIds }),
  getUserStatus: (userId) => api.get(`/users/status/${userId}`),
  deleteMessage: (id) => api.delete(`/messages/${id}`),
};

export const userAPI = {
  getSuggested: (role) => api.get('/users/suggested', { params: { role } }),
  searchUsers: (query, role) => api.get('/users/search', { params: { query, role } }),
  getUserStatus: (userId) => api.get(`/users/status/${userId}`),
  updateOnlineStatus: (data) => api.post('/users/online-status', data),
};

export const chatbotAPI = {
  query: (data) => api.post('/chatbot/query', data),
};

export const notificationAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
};

export const reportAPI = {
  create: (data) => api.post('/reports', data),
  getAll: (params) => api.get('/reports', { params }),
  getByTarget: (targetType, targetId) => api.get(`/reports/target/${targetType}/${targetId}`),
  updateStatus: (id, status) => api.put(`/reports/${id}/status`, { status }),
};

export const companyAPI = {
  getAll: (params) => api.get('/companies', { params }),
  getById: (id) => api.get(`/companies/${id}`),
  create: (data) => api.post('/companies', data),
  update: (id, data) => api.put(`/companies/${id}`, data),
  updateAvatar: (id, avatarBase64) => api.put(`/companies/${id}/avatar`, { avatarBase64 }),
};

export const skillAPI = {
  getAll: (params) => api.get('/skills', { params }),
  getCategories: () => api.get('/skills/categories'),
  suggest: (data) => api.post('/skills/suggest', data),
  addCustom: (name) => api.post('/skills/custom', { name }),
};

export const adminAPI = {
   getDashboard: () => api.get('/admin/dashboard'),
   getTrends: (params) => api.get('/admin/dashboard/trends', { params }),
   getUserDistribution: () => api.get('/admin/dashboard/user-distribution'),
   getAlerts: () => api.get('/admin/dashboard/alerts'),
   getUserDensity: () => api.get('/admin/dashboard/user-density'),
   getFlagged: () => api.get('/admin/flagged'),
   getCases: () => api.get('/admin/cases'),
   moderate: (data) => api.post('/admin/moderate', data),
   getUsers: (params) => api.get('/admin/users', { params }),
   getUser: (userId) => api.get(`/admin/users/${userId}`),
   updateUser: (userId, data) => api.put(`/admin/users/${userId}`, data),
   getFraudInsights: (params) => api.get('/admin/fraud-insights', { params }),
   getAppeals: (params) => api.get('/admin/appeals', { params }),
   reviewAppeal: (id, data) => api.post(`/admin/appeals/${id}/review`, data),
   getArchivedOpportunities: (params) => api.get('/admin/archived-opportunities', { params }),
   restoreArchivedOpportunity: (id) => api.post(`/admin/archived-opportunities/${id}/restore`),
   permanentlyRemoveOpportunity: (id) => api.delete(`/admin/opportunities/${id}/permanent-remove`),
   getModelHealth: (params) => api.get('/admin/model-health', { params }),
   getTrainingExport: (params) => api.get('/admin/training-export', { params }),
   applyUserAction: (userId, data) => api.post(`/admin/users/${userId}/action`, data),
   applyCompanyAction: (companyId, data) => api.post(`/admin/companies/${companyId}/action`, data),
   applyMessageAction: (messageId, data) => api.post(`/admin/messages/${messageId}/action`, data),
 };

export default api;
export { API_URL as BASE_URL };