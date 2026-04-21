import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { opportunityAPI } from '../services/api';
import { FiPlusCircle, FiBriefcase, FiUsers, FiTrendingUp, FiEye } from 'react-icons/fi';

const EmployerDashboard = () => {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await opportunityAPI.getMine();
        setOpportunities(data.opportunities || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const published = opportunities.filter((o) => o.status === 'published').length;
  const archived = opportunities.filter((o) => o.status === 'archived').length;
  const underReview = opportunities.filter((o) => o.status === 'under_review').length;
  const totalApps = opportunities.reduce((sum, o) => sum + (o.applicationCount || 0), 0);

  const statCards = [
    { label: 'Active Jobs', val: published, icon: FiBriefcase, color: 'text-green-600 bg-green-50' },
    { label: 'Total Applications', val: totalApps, icon: FiUsers, color: 'text-orange-600 bg-orange-50' },
    { label: 'Under Review', val: underReview, icon: FiTrendingUp, color: 'text-yellow-600 bg-yellow-50' },
    { label: 'Archived', val: archived, icon: FiEye, color: 'text-gray-600 bg-gray-50' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">Hello, {user?.fullName?.split(' ')[0]}!</h1>
          <p className="text-sm text-gray-500">Employer Dashboard</p>
        </div>
        <Link to="/employer/post" className="btn-primary flex items-center gap-2 text-sm">
          <FiPlusCircle size={16} /> Post Job
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="card">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon size={18} />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.val}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Post CTA */}
      <Link
        to="/employer/post"
        className="card flex items-center gap-3 mb-6 hover:shadow-md transition border-dashed border-2 border-primary/30"
      >
        <FiPlusCircle className="text-primary" size={28} />
        <div>
          <p className="font-semibold text-primary">Post New Opportunity</p>
          <p className="text-xs text-gray-500">Reach skilled workers across Uganda and East Africa</p>
        </div>
      </Link>

      {/* Opportunities List */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold text-lg">Your Opportunities</h2>
        <Link to="/employer/opportunities" className="text-primary text-sm hover:underline">
          View All →
        </Link>
      </div>

      {loading ? (
        <div className="card text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="card text-center py-12">
          <FiBriefcase size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-2">No opportunities posted yet.</p>
          <Link to="/employer/post" className="text-primary hover:underline text-sm">
            Post your first opportunity →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.slice(0, 5).map((opp) => (
            <div key={opp._id} className="card hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold">{opp.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {opp.location} • {opp.category} •{' '}
                    {opp.applicationCount || 0} application{(opp.applicationCount || 0) !== 1 ? 's' : ''}
                  </p>
                  {opp.createdAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      Posted {new Date(opp.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <span
                  className={`badge text-xs ${
                    opp.status === 'published'
                      ? 'bg-green-100 text-green-700'
                      : opp.status === 'blocked'
                      ? 'bg-red-100 text-red-700'
                      : opp.status === 'archived'
                      ? 'bg-gray-100 text-gray-600'
                      : opp.status === 'draft'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {opp.status?.replace('_', ' ')}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <Link
                  to={`/employer/applications/${opp._id}`}
                  className="text-primary text-sm hover:underline flex items-center gap-1"
                >
                  <FiUsers size={14} /> View Applications
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmployerDashboard;
