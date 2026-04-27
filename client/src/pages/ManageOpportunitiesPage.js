import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FiSearch, FiEdit2, FiTrash2, FiEye, FiArchive, FiBriefcase, FiMapPin, FiCalendar, FiUsers } from 'react-icons/fi';
import { opportunityAPI } from '../services/api';

const statusColors = {
  published: 'bg-green-100 text-green-700',
  draft: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  blocked: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
};

const ManageOpportunitiesPage = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [archiveId, setArchiveId] = useState(null);

  useEffect(() => {
    loadOpportunities();
  }, []);

  const loadOpportunities = async () => {
    setLoading(true);
    try {
      const { data } = await opportunityAPI.getMine();
      setOpportunities(data.opportunities || []);
    } catch {
      // silently handle
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return opportunities.filter((opp) => {
      const matchesSearch =
        !search ||
        opp.title?.toLowerCase().includes(search.toLowerCase()) ||
        opp.location?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = !statusFilter || opp.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [opportunities, search, statusFilter]);

  const stats = useMemo(() => ({
    total: opportunities.length,
    active: opportunities.filter((o) => o.status === 'published').length,
    archived: opportunities.filter((o) => o.status === 'archived').length,
  }), [opportunities]);

  const handleArchive = async (id) => {
    try {
      await opportunityAPI.archive(id);
      setOpportunities((prev) =>
        prev.map((o) => (o._id === id ? { ...o, status: 'archived' } : o))
      );
    } catch {
      // silently handle
    }
    setArchiveId(null);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-center text-gray-400 py-16">Loading your opportunities...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">My Opportunities</h1>
        <Link to="/employer/post" className="btn-primary text-sm">+ Post New</Link>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">Total</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          <p className="text-xs text-gray-500 mt-1">Active</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-gray-500">{stats.archived}</p>
          <p className="text-xs text-gray-500 mt-1">Archived</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input-field pl-11"
          placeholder="Search by title or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['', 'published', 'draft', 'under_review', 'archived'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`badge whitespace-nowrap ${statusFilter === s ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      {/* Opportunities List */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <FiBriefcase className="mx-auto text-3xl text-gray-300 mb-3" />
          <p className="text-gray-500">
            {opportunities.length === 0
              ? 'You have not posted any opportunities yet.'
              : 'No opportunities match your filters.'}
          </p>
          {opportunities.length === 0 && (
            <Link to="/employer/post" className="btn-primary mt-4 inline-block text-sm">
              Post Your First Opportunity
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((opp) => (
            <div key={opp._id} className="card">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm truncate">{opp.title}</h3>
                    <span className={`badge text-xs ${statusColors[opp.status] || 'bg-gray-100 text-gray-500'}`}>
                      {opp.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                    {opp.location && (
                      <span className="flex items-center gap-1">
                        <FiMapPin className="text-gray-400" /> {opp.location}
                      </span>
                    )}
                    {opp.category && (
                      <span className="flex items-center gap-1">
                        <FiBriefcase className="text-gray-400" /> {opp.category}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <FiUsers className="text-gray-400" /> {opp.applicationCount || 0} applicants
                    </span>
                    <span className="flex items-center gap-1">
                      <FiCalendar className="text-gray-400" /> {new Date(opp.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Applicant match aggregates */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span
                      className="badge text-[11px] bg-orange-50 text-orange-700 border border-orange-200"
                      title="Best match score among applicants"
                    >
                      Top match: {opp.bestMatchScore != null ? `${opp.bestMatchScore}%` : '—'}
                    </span>
                    <span
                      className="badge text-[11px] bg-gray-50 text-gray-700 border border-gray-200"
                      title="Average match score across applicants"
                    >
                      Avg match: {opp.avgMatchScore != null ? `${opp.avgMatchScore}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <Link
                  to={`/employer/applications/${opp._id}`}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <FiEye /> View Applications
                </Link>
                <Link
                  to={`/employer/edit/${opp._id}`}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  <FiEdit2 /> Edit
                </Link>
                {opp.status !== 'archived' ? (
                  <button
                    onClick={() => setArchiveId(opp._id)}
                    className="flex items-center gap-1 text-xs text-yellow-600 hover:text-yellow-800 ml-auto"
                  >
                    <FiArchive /> Archive
                  </button>
                ) : (
                  <button
                    onClick={() => setArchiveId(opp._id)}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 ml-auto"
                  >
                    <FiTrash2 /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archive/Delete Confirmation Modal */}
      {archiveId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-lg mb-2">Confirm Action</h3>
            <p className="text-sm text-gray-600 mb-4">
              {opportunities.find((o) => o._id === archiveId)?.status === 'archived'
                ? 'Are you sure you want to delete this opportunity? This action cannot be undone.'
                : 'Are you sure you want to archive this opportunity? It will no longer be visible to applicants.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setArchiveId(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleArchive(archiveId)}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                {opportunities.find((o) => o._id === archiveId)?.status === 'archived' ? 'Delete' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ManageOpportunitiesPage;
