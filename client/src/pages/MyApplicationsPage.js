import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { applicationAPI } from '../services/api';

const statusColors = {
  submitted: 'bg-blue-100 text-blue-700', under_review: 'bg-yellow-100 text-yellow-700',
  interview_scheduled: 'bg-purple-100 text-purple-700', rejected: 'bg-red-100 text-red-700',
  offer_extended: 'bg-green-100 text-green-700',
};

const MyApplicationsPage = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const { data } = await applicationAPI.getMine(); setApplications(data.applications || []); } catch {}
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">My Applications</h1>
      {loading ? <p className="text-center text-gray-400 py-8">Loading...</p> :
        applications.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">No applications yet.</p>
            <Link to="/discover" className="btn-primary mt-3 inline-block text-sm">Discover Opportunities</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <div key={app._id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm">{app.opportunityId?.title || 'Opportunity'}</h3>
                    <p className="text-xs text-gray-500 mt-1">Applied {new Date(app.submittedAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`badge ${statusColors[app.status] || 'bg-gray-100'}`}>{app.status?.replace('_', ' ')}</span>
                </div>
                {app.matchScore > 0 && <p className="text-xs text-gray-500 mt-2">Match Score: {Math.round(app.matchScore)}%</p>}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
};
export default MyApplicationsPage;
