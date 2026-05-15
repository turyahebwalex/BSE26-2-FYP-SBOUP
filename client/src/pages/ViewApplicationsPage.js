import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { applicationAPI, opportunityAPI } from '../services/api';
import { toast } from 'react-toastify';
import {
  FiArrowLeft,
  FiUsers,
  FiSearch,
  FiCheck,
  FiX,
  FiCalendar,
  FiStar,
  FiDownload,
  FiEye,
  FiPaperclip,
} from 'react-icons/fi';

const statusStyles = {
  submitted: 'bg-gray-100 text-gray-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  shortlisted: 'bg-blue-100 text-blue-700',
  interview_scheduled: 'bg-purple-100 text-purple-700',
  offer_extended: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-500',
};

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'submitted', label: 'New' },
  { key: 'under_review', label: 'Reviewing' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview_scheduled', label: 'Interview' },
  { key: 'offer_extended', label: 'Offered' },
  { key: 'rejected', label: 'Rejected' },
];

const ViewApplicationsPage = () => {
  const { opportunityId } = useParams();
  const [applications, setApplications] = useState([]);
  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [attachmentModal, setAttachmentModal] = useState(null); // { fileName, fileUrl, fileType }

  // Derive a meaningful skill score from available breakdown data.
  // The ML model stores cosineScore (0-100). Older applications stored
  // skillScore which was always 0. Fall back to the overall matchScore
  // so the employer always sees a non-zero number when there is a match.
  const getSkillScore = (app) => {
    const bd = app.matchBreakdown || {};
    if (bd.cosineScore > 0) return Math.round(bd.cosineScore);
    if (bd.skillScore > 0)  return Math.round(bd.skillScore);
    // Use overall match score as the best available proxy
    return Math.round(app.matchScore || 0);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [appsRes, oppRes] = await Promise.all([
          applicationAPI.getForOpportunity(opportunityId),
          opportunityAPI.getById(opportunityId).catch(() => ({ data: { opportunity: null } })),
        ]);
        setApplications(appsRes.data.applications || []);
        setOpportunity(oppRes.data.opportunity || null);
      } catch {
        toast.error('Failed to load applications');
      }
      setLoading(false);
    };
    load();
  }, [opportunityId]);

  const updateStatus = async (appId, status) => {
    try {
      await applicationAPI.updateStatus(appId, status);
      setApplications((prev) => prev.map((a) => (a._id === appId ? { ...a, status } : a)));
      toast.success(`Marked ${status.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const counts = useMemo(() => {
    const c = { total: applications.length };
    STATUS_TABS.forEach((t) => {
      if (t.key) c[t.key] = applications.filter((a) => a.status === t.key).length;
    });
    return c;
  }, [applications]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return applications
      .filter((a) => !statusFilter || a.status === statusFilter)
      .filter(
        (a) =>
          !q ||
          a.profileId?.userId?.fullName?.toLowerCase().includes(q) ||
          a.profileId?.userId?.email?.toLowerCase().includes(q) ||
          a.coverLetter?.toLowerCase().includes(q)
      )
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [applications, statusFilter, search]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <Link to="/employer/opportunities" className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-3">
        <FiArrowLeft size={14} /> Back to opportunities
      </Link>

      <div className="card mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">{opportunity?.title || 'Applications'}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {opportunity?.location || 'Location TBD'} • {opportunity?.category || 'General'}
            </p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <FiUsers size={12} /> {counts.total} applicant{counts.total !== 1 ? 's' : ''}
            </p>
          </div>
          {opportunity?.status && (
            <span className="badge bg-gray-100 text-gray-600 text-xs">{opportunity.status.replace('_', ' ')}</span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key || 'all'}
            onClick={() => setStatusFilter(t.key)}
            className={`badge whitespace-nowrap text-xs ${
              statusFilter === t.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {t.label}
            {t.key && counts[t.key] > 0 && <span className="ml-1 opacity-70">({counts[t.key]})</span>}
          </button>
        ))}
      </div>

      <div className="relative mb-5">
        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          className="input-field !pl-10"
          placeholder="Search applicants by name, email, or cover letter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Applications */}
      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <FiUsers size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">
            {applications.length === 0 ? 'No applications yet.' : 'No applicants match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => {
            const score = Math.round(app.matchScore || 0);
            const scoreColor =
              score >= 70 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-gray-500';
            const open = expanded === app._id;
            return (
              <div key={app._id} className="card">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                      {app.profileId?.userId?.fullName?.charAt(0) || 'W'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {app.profileId?.userId?.fullName || 'Applicant'}
                      </h3>
                      <p className="text-xs text-gray-500 truncate">{app.profileId?.userId?.email}</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <FiCalendar size={10} /> Applied {new Date(app.submittedAt || app.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`flex items-center gap-1 font-bold ${scoreColor}`}>
                      <FiStar size={14} /> {score}%
                    </div>
                    <span className={`badge text-xs mt-1 inline-block ${statusStyles[app.status] || 'bg-gray-100'}`}>
                      {app.status?.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Match breakdown — uses ML model fields */}
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-500">Skill Match</p>
                    <p className="font-semibold">{getSkillScore(app)}%</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-500">Location</p>
                    <p className="font-semibold">
                      {app.matchBreakdown?.locationMatch != null
                        ? (app.matchBreakdown.locationMatch ? '✓ Match' : '✗ No match')
                        : '—'}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-500">Experience</p>
                    <p className="font-semibold">
                      {app.matchBreakdown?.expFit != null
                        ? (app.matchBreakdown.expFit ? '✓ Meets req' : '✗ Below req')
                        : app.matchBreakdown?.experienceScore != null
                        ? `${Math.round(app.matchBreakdown.experienceScore)}%`
                        : '—'}
                    </p>
                  </div>
                </div>

                {app.coverLetter && (
                  <>
                    <button
                      onClick={() => setExpanded(open ? null : app._id)}
                      className="text-xs text-primary mt-3 hover:underline"
                    >
                      {open ? 'Hide cover letter' : 'View cover letter'}
                    </button>
                    {open && (
                      <p className="text-sm text-gray-600 mt-2 border-t pt-2 whitespace-pre-wrap">
                        {app.coverLetter}
                      </p>
                    )}
                  </>
                )}

                {/* Attachments */}
                {app.attachments && app.attachments.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1 font-medium flex items-center gap-1">
                      <FiPaperclip size={11} /> Attachments ({app.attachments.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {app.attachments.map((att, idx) => {
                        const isImage = att.fileType?.startsWith('image');
                        // Build a full URL: server paths start with /uploads/
                        // Local device paths (file:///) are not accessible from the web
                        const isServerUrl = att.fileUrl && (
                          att.fileUrl.startsWith('/uploads/') ||
                          att.fileUrl.startsWith('http')
                        );
                        const fullUrl = isServerUrl
                          ? att.fileUrl.startsWith('http')
                            ? att.fileUrl
                            : `${window.location.protocol}//${window.location.hostname}:5000${att.fileUrl}`
                          : null;

                        return (
                          <div
                            key={att._id || idx}
                            className="flex items-center gap-1 text-xs bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5"
                          >
                            <span className="mr-0.5">{isImage ? '🖼' : '📄'}</span>
                            <span className="max-w-[110px] truncate text-gray-700">
                              {att.fileName || 'Attachment'}
                            </span>
                            {fullUrl ? (
                              <>
                                {/* View — opens in new tab */}
                                <a
                                  href={fullUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 text-primary hover:text-primary-dark"
                                  title="View"
                                >
                                  <FiEye size={13} />
                                </a>
                                {/* Download */}
                                <a
                                  href={fullUrl}
                                  download={att.fileName || 'attachment'}
                                  className="text-gray-500 hover:text-gray-700"
                                  title="Download"
                                >
                                  <FiDownload size={13} />
                                </a>
                              </>
                            ) : (
                              <span className="ml-1 text-gray-400 text-xs italic" title="File was attached from a mobile device and cannot be accessed from the web">
                                (local file)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                  <button
                    onClick={() => updateStatus(app._id, 'under_review')}
                    className="badge bg-yellow-100 text-yellow-700 cursor-pointer hover:bg-yellow-200 text-xs"
                  >
                    Reviewing
                  </button>
                  <button
                    onClick={() => updateStatus(app._id, 'shortlisted')}
                    className="badge bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200 text-xs"
                  >
                    Shortlist
                  </button>
                  <button
                    onClick={() => updateStatus(app._id, 'interview_scheduled')}
                    className="badge bg-purple-100 text-purple-700 cursor-pointer hover:bg-purple-200 text-xs"
                  >
                    Interview
                  </button>
                  <button
                    onClick={() => updateStatus(app._id, 'offer_extended')}
                    className="badge bg-green-100 text-green-700 cursor-pointer hover:bg-green-200 text-xs flex items-center gap-1"
                  >
                    <FiCheck size={10} /> Offer
                  </button>
                  <button
                    onClick={() => updateStatus(app._id, 'rejected')}
                    className="badge bg-red-100 text-red-700 cursor-pointer hover:bg-red-200 text-xs flex items-center gap-1 ml-auto"
                  >
                    <FiX size={10} /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ViewApplicationsPage;
