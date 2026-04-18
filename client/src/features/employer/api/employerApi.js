import api from '../../../services/api';

/**
 * Employer-scoped API calls.
 * All endpoints are protected — JWT is attached by the axios interceptor.
 */
const employerApi = {
  /** GET /api/employer/dashboard — summary stats + active postings + top candidates */
  getDashboard: () => api.get('/employer/dashboard'),

  /** GET /api/opportunities/employer/mine — full postings list */
  getMyOpportunities: () => api.get('/opportunities/employer/mine'),

  /** GET /api/applications/opportunity/:id — applicants for one posting */
  getApplicantsForOpportunity: (opportunityId) =>
    api.get(`/applications/opportunity/${opportunityId}`),
};

export default employerApi;
