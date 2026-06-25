import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminAPI, opportunityAPI } from '../services/api';

const AdminOpportunityReviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const loadOpportunity = async () => {
      try {
        const { data } = await opportunityAPI.getById(id);
        setOpportunity(data.opportunity || data);
      } catch {
        toast.error('Failed to load opportunity details');
      } finally {
        setLoading(false);
      }
    };

    loadOpportunity();
  }, [id]);

  const handleModerationAction = async (action) => {
    if (!id) return;
    setActionLoading(true);
    try {
      await adminAPI.moderate({
        contentId: id,
        action: action === 'remove' ? 'remove' : 'approve',
        contentType: 'opportunity',
        feedback: '',
      });

      toast.success(action === 'remove' ? 'Opportunity removed from public view' : 'Opportunity left as is');
      navigate('/admin');
    } catch {
      toast.error('Failed to update opportunity');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading opportunity…</div>;
  }

  if (!opportunity) {
    return <div className="max-w-4xl mx-auto px-4 py-8">Opportunity not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <Link to="/admin" className="text-sm text-primary hover:underline">← Back to admin reports</Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">{opportunity.title || 'Opportunity review'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {opportunity.location || 'Location not provided'} • {new Date(opportunity.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            disabled={actionLoading}
            onClick={() => handleModerationAction('remove')}
            className="px-4 py-2 rounded-xl bg-red-50 text-red-700 font-medium hover:bg-red-100 disabled:opacity-50"
          >
            Remove
          </button>
          <button
            disabled={actionLoading}
            onClick={() => handleModerationAction('leave')}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            Leave as is
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_0.8fr]">
        <div className="card">
          <div className="mb-6">
            <h2 className="font-semibold text-lg mb-2">Description</h2>
            <p className="text-sm text-gray-700 whitespace-pre-line">{opportunity.description || 'No description provided.'}</p>
          </div>

          <div className="mb-6">
            <h2 className="font-semibold text-lg mb-2">Required skills</h2>
            <div className="flex flex-wrap gap-2">
              {(opportunity.requiredSkills || []).length > 0 ? (
                opportunity.requiredSkills.map((skill, index) => (
                  <span key={skill._id || `${skill}-${index}`} className="badge bg-gray-100 text-gray-600">
                    {skill.skillName || skill}
                  </span>
                ))
              ) : (
                <p className="text-sm text-gray-500">No skills listed.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h2 className="font-semibold text-lg mb-2">Compensation</h2>
              <p className="text-sm text-gray-700">
                {opportunity.compensationRange?.currency || ''}{' '}
                {opportunity.compensationRange?.min?.toLocaleString() || ''}
                {opportunity.compensationRange?.min && opportunity.compensationRange?.max ? ' - ' : ''}
                {opportunity.compensationRange?.max?.toLocaleString() || ''}
                {opportunity.compensationRange?.period ? ` / ${opportunity.compensationRange.period}` : ''}
              </p>
            </div>
            <div>
              <h2 className="font-semibold text-lg mb-2">Status</h2>
              <span className="badge bg-yellow-100 text-yellow-700">{opportunity.status || 'unknown'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-lg mb-3">Opportunity details</h2>
            <div className="space-y-2 text-sm text-gray-700">
              <div><span className="font-medium text-gray-500">Employer:</span> {opportunity.companyId?.name || opportunity.postedByUserId?.fullName || 'Unknown'}</div>
              <div><span className="font-medium text-gray-500">Category:</span> {opportunity.category || 'N/A'}</div>
              <div><span className="font-medium text-gray-500">Deadline:</span> {opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString() : 'N/A'}</div>
              <div><span className="font-medium text-gray-500">Fraud risk:</span> {opportunity.fraudRiskScore ?? 'N/A'}</div>
            </div>
          </div>

          <div className="card border-red-100 bg-red-50/40">
            <h2 className="font-semibold text-lg mb-2">Admin review</h2>
            <p className="text-sm text-gray-700">
              Review the posting content above and choose whether to remove it from public view or leave it visible.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminOpportunityReviewPage;
