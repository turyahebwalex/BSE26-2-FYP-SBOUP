import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { applicationAPI } from '../services/api';
import { toast } from 'react-toastify';

const ViewApplicationsPage = () => {
  const { opportunityId } = useParams();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const { data } = await applicationAPI.getForOpportunity(opportunityId); setApplications(data.applications || []); } catch {}
      setLoading(false);
    };
    load();
  }, [opportunityId]);

  const updateStatus = async (appId, status) => {
    try {
      await applicationAPI.updateStatus(appId, status);
      setApplications((prev) => prev.map((a) => a._id === appId ? { ...a, status } : a));
      toast.success(`Application ${status.replace('_', ' ')}`);
    } catch { toast.error('Failed to update status'); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Applications</h1>
      {loading ? <p className="text-center py-8 text-gray-400">Loading...</p> : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={app._id} className="card">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{app.profileId?.userId?.fullName || 'Worker'}</h3>
                  <p className="text-xs text-gray-500">{app.profileId?.userId?.email}</p>
                  <p className="text-xs text-gray-500 mt-1">Match: {Math.round(app.matchScore || 0)}% • {new Date(app.submittedAt).toLocaleDateString()}</p>
                </div>
                <span className="badge bg-gray-100 text-gray-600">{app.status?.replace('_', ' ')}</span>
              </div>
              {app.coverLetter && <p className="text-sm text-gray-600 mt-2 border-t pt-2">{app.coverLetter}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => updateStatus(app._id, 'under_review')} className="badge bg-yellow-100 text-yellow-700 cursor-pointer hover:bg-yellow-200">Review</button>
                <button onClick={() => updateStatus(app._id, 'interview_scheduled')} className="badge bg-purple-100 text-purple-700 cursor-pointer hover:bg-purple-200">Interview</button>
                <button onClick={() => updateStatus(app._id, 'offer_extended')} className="badge bg-green-100 text-green-700 cursor-pointer hover:bg-green-200">Offer</button>
                <button onClick={() => updateStatus(app._id, 'rejected')} className="badge bg-red-100 text-red-700 cursor-pointer hover:bg-red-200">Reject</button>
              </div>
            </div>
          ))}
          {applications.length === 0 && <p className="text-center py-8 text-gray-400">No applications yet</p>}
        </div>
      )}
    </div>
  );
};
export default ViewApplicationsPage;
