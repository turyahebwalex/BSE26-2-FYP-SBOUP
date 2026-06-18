
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI, reportAPI } from '../services/api';
import { toast } from 'react-toastify';
import {
  FiUsers,
  FiBriefcase,
  FiAlertTriangle,
  FiFlag,
  FiSearch,
  FiShield,
  FiMapPin,
  FiActivity,
  FiLock,
  FiCheckSquare,
  FiZap,
} from 'react-icons/fi';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [flagged, setFlagged] = useState({ flaggedOpportunities: [], pendingReports: [] });
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [cases, setCases] = useState([]);
  const [trends, setTrends] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [density, setDensity] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, flagRes, userRes, trendRes, alertRes, densityRes] = await Promise.all([
          adminAPI.getDashboard(),
          adminAPI.getFlagged(),
          adminAPI.getUsers({ limit: 50 }),
          adminAPI.getTrends({ range: '30d', granularity: 'day' }),
          adminAPI.getAlerts(),
          adminAPI.getUserDensity(),
        ]);
        setStats(dashRes.data);
        setFlagged(flagRes.data);
        setUsers(userRes.data.users || []);
        setTrends(trendRes.data.trends || []);
        setAlerts(alertRes.data.alerts || null);
        setDensity(densityRes.data.density || []);
      } catch {}
      setLoading(false);
    };
    load();
    loadReports();
    loadCases();
  }, []);

  const loadReports = async () => {
    try {
      const { data } = await reportAPI.getAll({ page: 1, limit: 100 });
      const reportList = Array.isArray(data?.reports)
        ? data.reports
        : Array.isArray(data?.data?.reports)
        ? data.data.reports
        : [];
      setReports(reportList);
    } catch (error) {
      console.error('Failed to load reports:', error);
      toast.error('Could not load report queue.');
    }
  };

  const getTargetLabel = (report) => {
    const details = report.targetDetails;
    if (!details) {
      return report.targetId || 'Unknown target';
    }

    if (details.fullName) return details.fullName;
    if (details.name) return details.name;
    if (details.title) return details.title;
    if (details.content) return details.content.slice(0, 60);
    return report.targetType;
  };

  const loadCases = async () => {
    try {
      const { data } = await adminAPI.getCases();
      setCases(data.cases || []);
    } catch {}
  };

  useEffect(() => {
    if (tab === 'reports') loadReports();
    if (tab === 'cases') loadCases();
  }, [tab]);

  const moderateContent = async (contentId, contentType, action) => {
    try {
      await adminAPI.moderate({ contentId, contentType, action });
      toast.success(`Content ${action}d`);
      if (contentType === 'opportunity') {
        setFlagged((prev) => ({
          ...prev,
          flaggedOpportunities: prev.flaggedOpportunities.filter((o) => o._id !== contentId),
        }));
      }
      setCases((prev) => prev.filter((c) => c.targetId !== contentId || c.targetType !== contentType));
    } catch {
      toast.error('Action failed');
    }
  };

  // NEW: Handles removal of reported user or message and updates report status
  const handleRemoveContent = async (report) => {
    const { targetId, targetType, _id: reportId } = report;
    const targetLabel = getTargetLabel(report);

    // Confirm deletion
    if (!window.confirm(`Are you sure you want to permanently remove this ${targetType}?`)) {
      return;
    }

    try {
      // 1. Remove the content
      await adminAPI.moderate({ contentId: targetId, contentType: targetType, action: 'remove' });

      // 2. Update the report status to 'action_taken'
      await reportAPI.updateStatus(reportId, 'action_taken');

      // 3. Update local state: remove the report from the list
      setReports((prev) => prev.filter((r) => r._id !== reportId));

      toast.success(`${targetType} removed and report closed. The user has been notified.`);
    } catch (error) {
      console.error('Failed to remove content:', error);
      toast.error('Could not remove content. Please try again.');
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await adminAPI.updateUser(userId, { accountStatus: newStatus });
      setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, accountStatus: newStatus } : u)));
      toast.success(`User ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch {
      toast.error('Failed to update user');
    }
  };

  const updateReportStatus = async (reportId, status) => {
    try {
      await reportAPI.updateStatus(reportId, status);
      setReports((prev) => prev.map((r) => (r._id === reportId ? { ...r, status } : r)));
      toast.success(`Report ${status.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update report');
    }
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const pagedUsers = useMemo(() => {
    const start = (userPage - 1) * 10;
    return filteredUsers.slice(start, start + 10);
  }, [filteredUsers, userPage]);

  // Chart data
  const roleDistribution = useMemo(() => {
    const counts = { skilled_worker: 0, employer: 0, admin: 0 };
    users.forEach((u) => {
      if (counts[u.role] !== undefined) counts[u.role]++;
    });
    return {
      labels: ['Skilled Workers', 'Employers', 'Admins'],
      datasets: [
        {
          data: [counts.skilled_worker, counts.employer, counts.admin],
          backgroundColor: ['#F97316', '#1F2937', '#6366F1'],
          borderWidth: 0,
        },
      ],
    };
  }, [users]);

  const trendChart = useMemo(() => {
    const labels = trends.map((t) => t._id);
    const totals = trends.map((t) => t.total || 0);
    const workers = trends.map((t) => t.byRole?.find((r) => r.role === 'skilled_worker')?.count || 0);
    const employers = trends.map((t) => t.byRole?.find((r) => r.role === 'employer')?.count || 0);
    return {
      labels,
      datasets: [
        {
          label: 'Total',
          data: totals,
          borderColor: '#F97316',
          backgroundColor: 'rgba(249,115,22,0.15)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Workers',
          data: workers,
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: false,
          tension: 0.3,
        },
        {
          label: 'Employers',
          data: employers,
          borderColor: '#1F2937',
          backgroundColor: 'rgba(31,41,55,0.1)',
          fill: false,
          tension: 0.3,
        },
      ],
    };
  }, [trends]);

  const statusDistribution = useMemo(() => {
    const counts = { active: 0, suspended: 0, deactivated: 0 };
    users.forEach((u) => {
      if (counts[u.accountStatus] !== undefined) counts[u.accountStatus]++;
    });
    return {
      labels: ['Active', 'Suspended', 'Deactivated'],
      datasets: [
        {
          label: 'Users',
          data: [counts.active, counts.suspended, counts.deactivated],
          backgroundColor: ['#22C55E', '#EF4444', '#9CA3AF'],
          borderRadius: 6,
        },
      ],
    };
  }, [users]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );

  const tabs = [
    { key: 'overview', label: 'Overview', icon: FiShield },
    { key: 'moderation', label: 'Moderation', icon: FiAlertTriangle },
    { key: 'cases', label: 'Cases', icon: FiCheckSquare },
    { key: 'users', label: 'Users', icon: FiUsers },
    { key: 'reports', label: 'Reports', icon: FiFlag },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">SkillBridge Platform Management</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {tab === 'overview' && stats && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total Users', val: stats.stats?.totalUsers, icon: FiUsers, color: 'text-blue-600 bg-blue-50' },
              { label: 'Active Users', val: stats.stats?.activeUsers, icon: FiUsers, color: 'text-green-600 bg-green-50' },
              { label: 'Opportunities', val: stats.stats?.totalOpportunities, icon: FiBriefcase, color: 'text-orange-600 bg-orange-50' },
              { label: 'Pending Reviews', val: stats.stats?.pendingReviews, icon: FiAlertTriangle, color: 'text-yellow-600 bg-yellow-50' },
              { label: 'Pending Reports', val: stats.stats?.pendingReports, icon: FiFlag, color: 'text-red-600 bg-red-50' },
            ].map((s) => (
              <div key={s.label} className="card">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                    <s.icon size={18} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{s.val?.toLocaleString() || 0}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <h2 className="font-semibold mb-4">User Distribution by Role</h2>
              <div className="h-64 flex items-center justify-center">
                <Doughnut
                  data={roleDistribution}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
                />
              </div>
            </div>
            <div className="card">
              <h2 className="font-semibold mb-4">Account Status Overview</h2>
              <div className="h-64">
                <Bar
                  data={statusDistribution}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Registration Trends + Urgent Alerts */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="card md:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FiActivity className="text-primary" size={18} />
                  <h2 className="font-semibold">Registration Trends (30d)</h2>
                </div>
                <span className="text-xs text-gray-400">
                  {trends.length > 0 ? `${trends.length} period${trends.length > 1 ? 's' : ''}` : 'No data'}
                </span>
              </div>
              <div className="h-64">
                {trends.length > 0 ? (
                  <Line
                    data={trendChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
                      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    No registrations in the last 30 days
                  </div>
                )}
              </div>
            </div>

            <div className="card border-l-4 border-l-red-400">
              <div className="flex items-center gap-2 mb-4">
                <FiZap className="text-red-500" size={18} />
                <h2 className="font-semibold">Urgent Alerts</h2>
              </div>
              <div className="space-y-3">
                {[
                  {
                    label: 'High-Risk Opportunities',
                    val: alerts?.counts?.highRiskOpportunities ?? 0,
                    icon: FiAlertTriangle,
                    color: 'text-red-600 bg-red-50',
                  },
                  {
                    label: 'Pending Reports',
                    val: alerts?.counts?.pendingReports ?? 0,
                    icon: FiFlag,
                    color: 'text-orange-600 bg-orange-50',
                  },
                  {
                    label: 'Locked Accounts',
                    val: alerts?.counts?.lockedAccounts ?? 0,
                    icon: FiLock,
                    color: 'text-yellow-600 bg-yellow-50',
                  },
                  {
                    label: 'Unverified Companies',
                    val: alerts?.counts?.unverifiedCompanies ?? 0,
                    icon: FiCheckSquare,
                    color: 'text-blue-600 bg-blue-50',
                  },
                ].map((a) => (
                  <div key={a.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.color}`}>
                        <a.icon size={14} />
                      </div>
                      <span className="text-sm text-gray-600">{a.label}</span>
                    </div>
                    <span className="font-bold">{a.val}</span>
                  </div>
                ))}
              </div>
              {alerts?.highRiskOpportunities?.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs text-gray-500 mb-2">Top high-risk postings</p>
                  <div className="space-y-1">
                    {alerts.highRiskOpportunities.slice(0, 3).map((o) => (
                      <div key={o._id} className="flex justify-between text-xs">
                        <span className="truncate pr-2">{o.title}</span>
                        <span className="font-bold text-red-600">{o.fraudRiskScore}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setTab('moderation')}
                className="flex items-center gap-2 p-3 rounded-xl bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition text-sm font-medium"
              >
                <FiAlertTriangle size={16} />
                Review Flagged
              </button>
              <button
                onClick={() => setTab('reports')}
                className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition text-sm font-medium"
              >
                <FiFlag size={16} />
                Handle Reports
              </button>
              <button
                onClick={() => setTab('users')}
                className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition text-sm font-medium"
              >
                <FiUsers size={16} />
                Manage Users
              </button>
              <Link
                to="/opportunities"
                className="flex items-center gap-2 p-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition text-sm font-medium"
              >
                <FiBriefcase size={16} />
                View Platform
              </Link>
            </div>
          </div>

          {/* User Density */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FiMapPin className="text-primary" size={18} />
                <h2 className="font-semibold">User Density by Location</h2>
              </div>
              <span className="text-xs text-gray-400">Top 10</span>
            </div>
            {density.length > 0 ? (
              <div className="space-y-2">
                {density.slice(0, 10).map((d, i) => {
                  const max = density[0]?.count || 1;
                  const pct = Math.round((d.count / max) * 100);
                  return (
                    <div key={d.location || i} className="flex items-center gap-3">
                      <div className="w-32 text-sm text-gray-600 truncate">{d.location || 'Unknown'}</div>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-10 text-right text-xs font-semibold text-gray-600">{d.count}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-6">No location data available yet</p>
            )}
          </div>

          {/* Recent Registrations */}
          <div className="card">
            <h2 className="font-semibold mb-3">Recent Registrations</h2>
            <div className="space-y-2">
              {stats.recentRegistrations?.length > 0 ? (
                stats.recentRegistrations.map((u) => (
                  <div key={u._id} className="flex justify-between items-center text-sm py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {u.fullName?.charAt(0)}
                      </div>
                      <div>
                        <span className="font-medium">{u.fullName}</span>
                        <span className="text-gray-400 ml-2">({u.email})</span>
                      </div>
                    </div>
                    <span className="badge bg-gray-100">{u.role?.replace('_', ' ')}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">No recent registrations</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Moderation Tab ─── */}
      {tab === 'moderation' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">
              Flagged Opportunities ({flagged.flaggedOpportunities?.length || 0})
            </h2>
          </div>

          {flagged.flaggedOpportunities?.length > 0 ? (
            flagged.flaggedOpportunities.map((opp) => (
              <div key={opp._id} className="card border-l-4 border-l-yellow-400">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{opp.title}</h3>
                    <p className="text-sm text-gray-500">
                      Posted by: {opp.employerId?.fullName || 'Unknown'} • Fraud Risk Score:{' '}
                      <span
                        className={`font-bold ${
                          opp.fraudRiskScore > 70 ? 'text-red-600' : opp.fraudRiskScore > 30 ? 'text-yellow-600' : 'text-green-600'
                        }`}
                      >
                        {opp.fraudRiskScore}
                      </span>
                    </p>
                  </div>
                  <span className="badge bg-yellow-100 text-yellow-700">Under Review</span>
                </div>
                <p className="text-sm text-gray-600 mt-2 line-clamp-3">{opp.description}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => moderateContent(opp._id, 'opportunity', 'approve')} className="btn-primary text-sm !py-1.5 !px-4">
                    Approve
                  </button>
                  <button
                    onClick={() => moderateContent(opp._id, 'opportunity', 'remove')}
                    className="bg-red-500 text-white px-4 py-1.5 rounded-full text-sm hover:bg-red-600 transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="card text-center py-12">
              <FiAlertTriangle size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">No flagged content — everything looks good!</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Cases Tab ─── */}
      {tab === 'cases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">Moderation Cases</h2>
              <p className="text-sm text-gray-500">Review content that reached admin moderation.</p>
            </div>
            <span className="text-xs text-gray-400">{cases.length} open case{cases.length !== 1 ? 's' : ''}</span>
          </div>

          {cases.length > 0 ? (
            cases.map((c) => (
              <div key={c._id} className="card border-l-4 border-l-blue-400">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">{c.targetType}</p>
                    <p className="font-semibold">Target ID: <span className="font-normal text-gray-600 break-all">{c.targetId}</span></p>
                    <p className="text-sm text-gray-500">Reports: {c.reportCount}</p>
                    <p className="text-sm text-gray-500">Status: <span className="font-medium">{c.status?.replace('_', ' ')}</span></p>
                    {c.assignedAdmin ? (
                      <p className="text-sm text-gray-500">Assigned admin: {c.assignedAdmin.fullName || c.assignedAdmin.email}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.targetType === 'opportunity' && (
                      <>
                        <button
                          onClick={() => moderateContent(c.targetId, 'opportunity', 'approve')}
                          className="badge bg-blue-100 text-blue-700 hover:bg-blue-200"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => moderateContent(c.targetId, 'opportunity', 'remove')}
                          className="badge bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {c.targetType === 'user' && (
                      <>
                        <button
                          onClick={() => moderateContent(c.targetId, 'user', 'remove')}
                          className="badge bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => moderateContent(c.targetId, 'user', 'suspend')}
                          className="badge bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => moderateContent(c.targetId, 'user', 'reactivate')}
                          className="badge bg-green-100 text-green-700 hover:bg-green-200"
                        >
                          Reactivate
                        </button>
                      </>
                    )}
                    {c.targetType === 'message' && (
                      <>
                        <button
                          onClick={() => moderateContent(c.targetId, 'message', 'remove')}
                          className="badge bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => moderateContent(c.targetId, 'message', 'restore')}
                          className="badge bg-green-100 text-green-700 hover:bg-green-200"
                        >
                          Restore
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="card text-center py-12">
              <FiShield size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">No moderation cases available.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Users Tab ─── */}
      {tab === 'users' && (
        <div>
          {/* Search */}
          <div className="relative mb-4">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search users by name, email, or role..."
              className="input-field !pl-10"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserPage(1);
              }}
            />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => (
                  <tr key={u._id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {u.fullName?.charAt(0)}
                        </div>
                        <span className="font-medium">{u.fullName}</span>
                      </div>
                    </td>
                    <td className="py-3 text-gray-500">{u.email}</td>
                    <td className="py-3">
                      <span className="badge bg-gray-100 text-gray-600">{u.role?.replace('_', ' ')}</span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`badge ${
                          u.accountStatus === 'active'
                            ? 'bg-green-100 text-green-700'
                            : u.accountStatus === 'suspended'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {u.accountStatus}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => toggleUserStatus(u._id, u.accountStatus)}
                          className={`text-xs px-3 py-1 rounded-full transition ${
                            u.accountStatus === 'active'
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          }`}
                        >
                          {u.accountStatus === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <p className="text-center py-8 text-gray-400">No users found</p>
            )}

            {/* Pagination */}
            {filteredUsers.length > 10 && (
              <div className="flex justify-between items-center mt-4 pt-3 border-t">
                <p className="text-xs text-gray-400">
                  Showing {(userPage - 1) * 10 + 1}–{Math.min(userPage * 10, filteredUsers.length)} of{' '}
                  {filteredUsers.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    disabled={userPage === 1}
                    className="badge bg-gray-100 cursor-pointer disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setUserPage((p) => p + 1)}
                    disabled={userPage * 10 >= filteredUsers.length}
                    className="badge bg-gray-100 cursor-pointer disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Reports Tab ─── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">Content Reports ({reports.length})</h2>
          {reports.length > 0 ? (
            reports.map((r) => (
              <div
                key={r._id}
                className={`card border-l-4 ${
                  r.status === 'pending'
                    ? 'border-l-yellow-400'
                    : r.status === 'reviewed'
                    ? 'border-l-blue-400'
                    : r.status === 'action_taken'
                    ? 'border-l-green-400'
                    : 'border-l-gray-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm">
                      {r.targetType}: <span className="text-gray-600">{getTargetLabel(r)}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Reported by: {r.reporterId?.fullName || r.reporterId?.email || 'Unknown'} •{' '}
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">{r.reason}</p>
                  </div>
                  <span
                    className={`badge text-xs ${
                      r.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : r.status === 'reviewed'
                        ? 'bg-blue-100 text-blue-700'
                        : r.status === 'action_taken'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {r.status?.replace('_', ' ')}
                  </span>
                </div>
                {r.status === 'pending' && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={() => updateReportStatus(r._id, 'reviewed')}
                      className="badge bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200"
                    >
                      Mark Reviewed
                    </button>
                    <button
                      onClick={() => updateReportStatus(r._id, 'action_taken')}
                      className="badge bg-green-100 text-green-700 cursor-pointer hover:bg-green-200"
                    >
                      Action Taken
                    </button>
                    <button
                      onClick={() => updateReportStatus(r._id, 'dismissed')}
                      className="badge bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200"
                    >
                      Dismiss
                    </button>

                    {/* ✨ NEW: Remove button – only for users and messages */}
                    {(r.targetType === 'user' || r.targetType === 'message') && (
                      <button
                        onClick={() => handleRemoveContent(r)}
                        className="badge bg-red-100 text-red-700 cursor-pointer hover:bg-red-200"
                      >
                        Remove Content
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="card text-center py-12">
              <FiFlag size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">No reports to review</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
=======
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI, reportAPI } from '../services/api';
import { toast } from 'react-toastify';
import {
  FiUsers,
  FiBriefcase,
  FiAlertTriangle,
  FiFlag,
  FiSearch,
  FiShield,
  FiMapPin,
  FiActivity,
  FiLock,
  FiCheckSquare,
  FiZap,
  FiInfo,
  FiBarChart2,
  FiMessageSquare,
} from 'react-icons/fi';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [flagged, setFlagged] = useState({
    flaggedOpportunities: [],
    suspendedOpportunities: [],
    pendingAppeals: [],
    pendingReports: [],
  });
  const [modSubTab, setModSubTab] = useState('review');
  const [archivedOps, setArchivedOps] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [appealNotes, setAppealNotes] = useState({});
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [trends, setTrends] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [density, setDensity] = useState([]);
  const [fraudInsights, setFraudInsights] = useState(null);
  const [modelHealth, setModelHealth] = useState(null);
  const [modelHealthLoading, setModelHealthLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [feedbacks, setFeedbacks] = useState({});   // { [oppId]: string }
  const [expandedOpp, setExpandedOpp] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [dashRes, flagRes, userRes, trendRes, alertRes, densityRes] = await Promise.all([
          adminAPI.getDashboard(),
          adminAPI.getFlagged(),
          adminAPI.getUsers({ limit: 50 }),
          adminAPI.getTrends({ range: '30d', granularity: 'day' }),
          adminAPI.getAlerts(),
          adminAPI.getUserDensity(),
        ]);
        setStats(dashRes.data);
        setFlagged(flagRes.data);
        setUsers(userRes.data.users || []);
        setTrends(trendRes.data.trends || []);
        setAlerts(alertRes.data.alerts || null);
        setDensity(densityRes.data.density || []);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const loadReports = async () => {
    try {
      const { data } = await reportAPI.getAll();
      setReports(data.reports || []);
    } catch {}
  };

  useEffect(() => {
    if (tab === 'reports') loadReports();
    if (tab === 'fraud') loadFraudInsights();
    if (tab === 'model_health') loadModelHealth();
  }, [tab]);

  const loadFraudInsights = async () => {
    try {
      const { data } = await adminAPI.getFraudInsights({ range: '30d', granularity: 'day' });
      setFraudInsights(data);
    } catch {}
  };

  const loadModelHealth = async () => {
    setModelHealthLoading(true);
    try {
      const { data } = await adminAPI.getModelHealth({ weeks: 12 });
      setModelHealth(data);
    } catch {}
    setModelHealthLoading(false);
  };

  const downloadTrainingExport = async (days = 90) => {
    setExportLoading(true);
    try {
      const { data } = await adminAPI.getTrainingExport({ days });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fraud_training_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.totalRecords} labelled records`);
    } catch {
      toast.error('Export failed');
    }
    setExportLoading(false);
  };

  const moderate = async (contentId, action) => {
    try {
      const feedback = feedbacks[contentId] || '';
      await adminAPI.moderate({ contentId, action, contentType: 'opportunity', feedback });
      toast.success(`Content ${action}d`);
      setFlagged((prev) => ({
        ...prev,
        flaggedOpportunities: (prev.flaggedOpportunities || []).filter((o) => o._id !== contentId),
        suspendedOpportunities: (prev.suspendedOpportunities || []).filter((o) => o._id !== contentId),
        pendingAppeals: (prev.pendingAppeals || []).filter((o) => o._id !== contentId),
      }));
      setFeedbacks((prev) => {
        const n = { ...prev };
        delete n[contentId];
        return n;
      });
    } catch {
      toast.error('Action failed');
    }
  };

  const loadArchived = async () => {
    setArchivedLoading(true);
    try {
      const { data } = await adminAPI.getArchivedOpportunities({ limit: 50 });
      setArchivedOps(data.opportunities || []);
    } catch {
      toast.error('Failed to load archived postings');
    }
    setArchivedLoading(false);
  };

  useEffect(() => {
    if (tab === 'moderation' && modSubTab === 'archived') loadArchived();
  }, [tab, modSubTab]);

  const restoreArchived = async (id) => {
    try {
      await adminAPI.restoreArchivedOpportunity(id);
      toast.success('Posting restored to published');
      setArchivedOps((prev) => prev.filter((o) => o._id !== id));
    } catch {
      toast.error('Restore failed');
    }
  };

  const purgeArchived = async (id) => {
    if (!window.confirm('Permanently delete this posting? This cannot be undone.')) return;
    try {
      await adminAPI.permanentlyRemoveOpportunity(id);
      toast.success('Posting permanently removed');
      setArchivedOps((prev) => prev.filter((o) => o._id !== id));
    } catch {
      toast.error('Removal failed');
    }
  };

  const reviewAppeal = async (oppId, action) => {
    try {
      const adminNote = appealNotes[oppId] || '';
      await adminAPI.reviewAppeal(oppId, { action, adminNote });
      toast.success(`Appeal ${action}d`);
      setFlagged((prev) => ({
        ...prev,
        pendingAppeals: (prev.pendingAppeals || []).filter((o) => o._id !== oppId),
      }));
      setAppealNotes((prev) => {
        const n = { ...prev };
        delete n[oppId];
        return n;
      });
    } catch {
      toast.error('Appeal review failed');
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await adminAPI.updateUser(userId, { accountStatus: newStatus });
      setUsers((prev) => prev.map((u) => (u._id === userId ? { ...u, accountStatus: newStatus } : u)));
      toast.success(`User ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch {
      toast.error('Failed to update user');
    }
  };

  const updateReportStatus = async (reportId, status) => {
    try {
      await reportAPI.updateStatus(reportId, status);
      setReports((prev) => prev.map((r) => (r._id === reportId ? { ...r, status } : r)));
      toast.success(`Report ${status.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to update report');
    }
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const pagedUsers = useMemo(() => {
    const start = (userPage - 1) * 10;
    return filteredUsers.slice(start, start + 10);
  }, [filteredUsers, userPage]);

  // Chart data
  const roleDistribution = useMemo(() => {
    const counts = { skilled_worker: 0, employer: 0, admin: 0 };
    users.forEach((u) => {
      if (counts[u.role] !== undefined) counts[u.role]++;
    });
    return {
      labels: ['Skilled Workers', 'Employers', 'Admins'],
      datasets: [
        {
          data: [counts.skilled_worker, counts.employer, counts.admin],
          backgroundColor: ['#F97316', '#1F2937', '#6366F1'],
          borderWidth: 0,
        },
      ],
    };
  }, [users]);

  const trendChart = useMemo(() => {
    const labels = trends.map((t) => t._id);
    const totals = trends.map((t) => t.total || 0);
    const workers = trends.map((t) => t.byRole?.find((r) => r.role === 'skilled_worker')?.count || 0);
    const employers = trends.map((t) => t.byRole?.find((r) => r.role === 'employer')?.count || 0);
    return {
      labels,
      datasets: [
        {
          label: 'Total',
          data: totals,
          borderColor: '#F97316',
          backgroundColor: 'rgba(249,115,22,0.15)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Workers',
          data: workers,
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: false,
          tension: 0.3,
        },
        {
          label: 'Employers',
          data: employers,
          borderColor: '#1F2937',
          backgroundColor: 'rgba(31,41,55,0.1)',
          fill: false,
          tension: 0.3,
        },
      ],
    };
  }, [trends]);

  const statusDistribution = useMemo(() => {
    const counts = { active: 0, suspended: 0, deactivated: 0 };
    users.forEach((u) => {
      if (counts[u.accountStatus] !== undefined) counts[u.accountStatus]++;
    });
    return {
      labels: ['Active', 'Suspended', 'Deactivated'],
      datasets: [
        {
          label: 'Users',
          data: [counts.active, counts.suspended, counts.deactivated],
          backgroundColor: ['#22C55E', '#EF4444', '#9CA3AF'],
          borderRadius: 6,
        },
      ],
    };
  }, [users]);

  const renderQueueCard = (opp, ctx) => {
    const { borderClass, statusTag } = ctx;
    const signals = opp.fraudSignals || [];
    const isExpanded = expandedOpp === opp._id;
    const scoreColor = opp.fraudRiskScore >= 70 ? 'text-red-600' : opp.fraudRiskScore >= 30 ? 'text-yellow-600' : 'text-green-600';
    const scoreBg = opp.fraudRiskScore >= 70 ? 'bg-red-50' : opp.fraudRiskScore >= 30 ? 'bg-yellow-50' : 'bg-green-50';

    const xai = opp.fraudXai || {};
    const qm = xai.qualityMetrics || {};
    const checksRaw = qm.completeness_checks || {};
    const fallbackChecks = {
      has_description: (opp.description || '').length > 50,
      has_requirements: (opp.requirements || '').length > 20,
      has_salary: !!(opp.compensationRange?.min || opp.compensationRange?.max),
      has_location: !!(opp.location && String(opp.location).length > 2),
    };
    const checks = Object.keys(checksRaw).length ? checksRaw : fallbackChecks;

    const meta = opp.employerModerationMeta || {};
    const emQ = qm.employer_metrics || {};
    const accountAge = meta.accountAgeDays ?? emQ.account_age_days;
    const prevPost = meta.previousPostings ?? emQ.previous_postings;
    const blockedCnt = meta.blockedCount ?? emQ.blocked_count;

    const conf = (xai.confidenceLevel || '').toLowerCase();
    const confCls =
      conf === 'high'
        ? 'bg-indigo-100 text-indigo-800'
        : conf === 'medium'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-gray-100 text-gray-700';

    const rationale =
      xai.plainEnglishRationale ||
      opp.moderationExplanation ||
      (signals.length
        ? 'No plain-language summary is stored for this posting yet; use the signal list below.'
        : 'No fraud signals recorded.');

    return (
      <div key={opp._id} className="card hover:shadow-md transition">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{opp.title}</h3>
              {statusTag && (
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {statusTag}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Posted by: {opp.postedByUserId?.fullName || 'Unknown'} • {opp.companyId?.name || 'No company'}
            </p>
          </div>
          <div className={`flex flex-col items-center px-3 py-2 rounded-xl shrink-0 ${scoreBg}`}>
            <span className={`text-2xl font-bold ${scoreColor}`}>{opp.fraudRiskScore ?? '—'}</span>
            <span className="text-xs text-gray-500">Fraud score</span>
          </div>
        </div>

        <p className="text-sm text-gray-600 mt-3 line-clamp-2">{opp.description}</p>

        <div className="mt-3 grid md:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">Explanation</span>
              {xai.confidenceLevel && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${confCls}`}>
                  {xai.confidenceLevel} confidence
                </span>
              )}
            </div>
            <p className="text-sm text-slate-700 leading-snug">{rationale}</p>
          </div>

          <div className="p-3 bg-white rounded-xl border border-gray-100">
            <p className="text-xs font-semibold text-gray-700 mb-2">Posting completeness</p>
            <div className="space-y-1">
              {[
                ['has_description', 'Description'],
                ['has_requirements', 'Requirements'],
                ['has_salary', 'Salary'],
                ['has_location', 'Location'],
              ].map(([k, label]) => (
                <div key={k} className="flex justify-between text-xs text-gray-600">
                  <span>{label}</span>
                  <span className={checks[k] ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {checks[k] ? '✓' : '—'}
                  </span>
                </div>
              ))}
            </div>
            {typeof qm.overall_score === 'number' && (
              <p className="text-[11px] text-gray-500 mt-2">Quality score (service): {qm.overall_score}/100</p>
            )}
          </div>
        </div>

        <div className="mt-3 p-3 bg-gray-50 rounded-xl text-xs text-gray-700">
          <span className="font-semibold text-gray-800">Employer history</span>
          <p className="mt-1">
            Account age:{' '}
            {typeof accountAge === 'number' ? `${accountAge} days` : '—'} • Prior postings:{' '}
            {typeof prevPost === 'number' ? prevPost : '—'} • Blocked postings:{' '}
            {typeof blockedCnt === 'number' ? blockedCnt : '—'}
            {emQ.verification_status && (
              <>
                {' '}
                • Company verification: {emQ.verification_status}
              </>
            )}
          </p>
        </div>

        {signals.length > 0 && (
          <div className="mt-3 p-3 bg-red-50 rounded-xl">
            <div className="flex items-center gap-1.5 mb-2">
              <FiInfo size={13} className="text-red-500" />
              <span className="text-xs font-semibold text-red-700">Model signals</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {signals.slice(0, 8).map((s, i) => (
                <span
                  key={i}
                  className="text-xs bg-white border border-red-200 text-red-700 px-2 py-0.5 rounded-full"
                >
                  {s.signal}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpandedOpp(isExpanded ? null : opp._id)}
          className="text-xs text-primary mt-2 hover:underline"
        >
          {isExpanded ? 'Hide details' : 'View full posting'}
        </button>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-2 text-sm text-gray-600">
            {opp.requirements && (
              <p>
                <span className="font-medium">Requirements:</span> {opp.requirements}
              </p>
            )}
            {opp.location && (
              <p>
                <span className="font-medium">Location:</span> {opp.location}
              </p>
            )}
            {opp.compensationRange && (
              <p>
                <span className="font-medium">Salary:</span>{' '}
                {opp.compensationRange.min?.toLocaleString()} – {opp.compensationRange.max?.toLocaleString()} UGX
              </p>
            )}
            <p>
              <span className="font-medium">Remote:</span> {opp.isRemote ? 'Yes' : 'No'}
            </p>
          </div>
        )}

        <div className="mt-3">
          <div className="flex items-center gap-1.5 mb-1">
            <FiMessageSquare size={13} className="text-gray-400" />
            <span className="text-xs text-gray-500">Admin feedback (optional)</span>
          </div>
          <textarea
            rows={2}
            placeholder="Notes for audit trail / retraining..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            value={feedbacks[opp._id] || ''}
            onChange={(e) => setFeedbacks((prev) => ({ ...prev, [opp._id]: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => moderate(opp._id, 'approve')}
            className="btn-primary text-sm !py-1.5 !px-4"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => moderate(opp._id, 'suspend')}
            className="bg-amber-500 text-white px-4 py-1.5 rounded-full text-sm hover:bg-amber-600 transition"
          >
            Suspend
          </button>
          <button
            type="button"
            onClick={() => moderate(opp._id, 'remove')}
            className="bg-red-500 text-white px-4 py-1.5 rounded-full text-sm hover:bg-red-600 transition"
          >
            Block
          </button>
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );

  const tabs = [
    { key: 'overview', label: 'Overview', icon: FiShield },
    { key: 'moderation', label: 'Moderation', icon: FiAlertTriangle },
    { key: 'fraud', label: 'Fraud Insights', icon: FiBarChart2 },
    { key: 'model_health', label: 'Model Health', icon: FiActivity },
    { key: 'users', label: 'Users', icon: FiUsers },
    { key: 'reports', label: 'Reports', icon: FiFlag },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">SkillBridge Platform Management</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {tab === 'overview' && stats && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: 'Total Users', val: stats.stats?.totalUsers, icon: FiUsers, color: 'text-blue-600 bg-blue-50' },
              { label: 'Active Users', val: stats.stats?.activeUsers, icon: FiUsers, color: 'text-green-600 bg-green-50' },
              { label: 'Opportunities', val: stats.stats?.totalOpportunities, icon: FiBriefcase, color: 'text-orange-600 bg-orange-50' },
              { label: 'Pending Reviews', val: stats.stats?.pendingReviews, icon: FiAlertTriangle, color: 'text-yellow-600 bg-yellow-50' },
              { label: 'Pending Reports', val: stats.stats?.pendingReports, icon: FiFlag, color: 'text-red-600 bg-red-50' },
            ].map((s) => (
              <div key={s.label} className="card">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                    <s.icon size={18} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{s.val?.toLocaleString() || 0}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <h2 className="font-semibold mb-4">User Distribution by Role</h2>
              <div className="h-64 flex items-center justify-center">
                <Doughnut
                  data={roleDistribution}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
                />
              </div>
            </div>
            <div className="card">
              <h2 className="font-semibold mb-4">Account Status Overview</h2>
              <div className="h-64">
                <Bar
                  data={statusDistribution}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Registration Trends + Urgent Alerts */}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="card md:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FiActivity className="text-primary" size={18} />
                  <h2 className="font-semibold">Registration Trends (30d)</h2>
                </div>
                <span className="text-xs text-gray-400">
                  {trends.length > 0 ? `${trends.length} period${trends.length > 1 ? 's' : ''}` : 'No data'}
                </span>
              </div>
              <div className="h-64">
                {trends.length > 0 ? (
                  <Line
                    data={trendChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
                      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    }}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    No registrations in the last 30 days
                  </div>
                )}
              </div>
            </div>

            <div className="card border-l-4 border-l-red-400">
              <div className="flex items-center gap-2 mb-4">
                <FiZap className="text-red-500" size={18} />
                <h2 className="font-semibold">Urgent Alerts</h2>
              </div>
              <div className="space-y-3">
                {[
                  {
                    label: 'High-Risk Opportunities',
                    val: alerts?.counts?.highRiskOpportunities ?? 0,
                    icon: FiAlertTriangle,
                    color: 'text-red-600 bg-red-50',
                  },
                  {
                    label: 'Pending Reports',
                    val: alerts?.counts?.pendingReports ?? 0,
                    icon: FiFlag,
                    color: 'text-orange-600 bg-orange-50',
                  },
                  {
                    label: 'Locked Accounts',
                    val: alerts?.counts?.lockedAccounts ?? 0,
                    icon: FiLock,
                    color: 'text-yellow-600 bg-yellow-50',
                  },
                  {
                    label: 'Unverified Companies',
                    val: alerts?.counts?.unverifiedCompanies ?? 0,
                    icon: FiCheckSquare,
                    color: 'text-blue-600 bg-blue-50',
                  },
                ].map((a) => (
                  <div key={a.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.color}`}>
                        <a.icon size={14} />
                      </div>
                      <span className="text-sm text-gray-600">{a.label}</span>
                    </div>
                    <span className="font-bold">{a.val}</span>
                  </div>
                ))}
              </div>
              {alerts?.highRiskOpportunities?.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs text-gray-500 mb-2">Top high-risk postings</p>
                  <div className="space-y-1">
                    {alerts.highRiskOpportunities.slice(0, 3).map((o) => (
                      <div key={o._id} className="flex justify-between text-xs">
                        <span className="truncate pr-2">{o.title}</span>
                        <span className="font-bold text-red-600">{o.fraudRiskScore}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card mb-6">
            <h2 className="font-semibold mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setTab('moderation')}
                className="flex items-center gap-2 p-3 rounded-xl bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition text-sm font-medium"
              >
                <FiAlertTriangle size={16} />
                Review Flagged
              </button>
              <button
                onClick={() => setTab('reports')}
                className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition text-sm font-medium"
              >
                <FiFlag size={16} />
                Handle Reports
              </button>
              <button
                onClick={() => setTab('users')}
                className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition text-sm font-medium"
              >
                <FiUsers size={16} />
                Manage Users
              </button>
              <Link
                to="/opportunities"
                className="flex items-center gap-2 p-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition text-sm font-medium"
              >
                <FiBriefcase size={16} />
                View Platform
              </Link>
            </div>
          </div>

          {/* User Density */}
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FiMapPin className="text-primary" size={18} />
                <h2 className="font-semibold">User Density by Location</h2>
              </div>
              <span className="text-xs text-gray-400">Top 10</span>
            </div>
            {density.length > 0 ? (
              <div className="space-y-2">
                {density.slice(0, 10).map((d, i) => {
                  const max = density[0]?.count || 1;
                  const pct = Math.round((d.count / max) * 100);
                  return (
                    <div key={d.location || i} className="flex items-center gap-3">
                      <div className="w-32 text-sm text-gray-600 truncate">{d.location || 'Unknown'}</div>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-10 text-right text-xs font-semibold text-gray-600">{d.count}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-6">No location data available yet</p>
            )}
          </div>

          {/* Recent Registrations */}
          <div className="card">
            <h2 className="font-semibold mb-3">Recent Registrations</h2>
            <div className="space-y-2">
              {stats.recentRegistrations?.length > 0 ? (
                stats.recentRegistrations.map((u) => (
                  <div key={u._id} className="flex justify-between items-center text-sm py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {u.fullName?.charAt(0)}
                      </div>
                      <div>
                        <span className="font-medium">{u.fullName}</span>
                        <span className="text-gray-400 ml-2">({u.email})</span>
                      </div>
                    </div>
                    <span className="badge bg-gray-100">{u.role?.replace('_', ' ')}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">No recent registrations</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Moderation Tab ─── */}
      {tab === 'moderation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setModSubTab('review')}
              className="card text-left hover:shadow-md transition"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">Under review</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{flagged.flaggedOpportunities?.length || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Initial review queue</p>
            </button>

            <button
              type="button"
              onClick={() => setModSubTab('suspended')}
              className="card text-left hover:shadow-md transition"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Suspended</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{flagged.suspendedOpportunities?.length || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Separated moderation queue</p>
            </button>

            <button
              type="button"
              onClick={() => setModSubTab('appeals')}
              className="card text-left hover:shadow-md transition"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Appeals</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{flagged.pendingAppeals?.length || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Waiting for admin review</p>
            </button>
          </div>

          <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {[
              { key: 'review', label: 'Review queue' },
              { key: 'suspended', label: 'Suspended' },
              { key: 'appeals', label: 'Appeals' },
              { key: 'archived', label: 'Archived' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setModSubTab(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  modSubTab === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {modSubTab === 'review' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Under manual review
                </h3>
                {(flagged.flaggedOpportunities || []).length > 0 ? (
                  <div className="space-y-4">
                    {flagged.flaggedOpportunities.map((opp) =>
                      renderQueueCard(opp, { borderClass: 'border-l-yellow-400', statusTag: 'under review' })
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-4">No postings awaiting initial review.</p>
                )}
              </div>
            </>
          )}

          {modSubTab === 'suspended' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Suspended (temporary)</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Suspended postings stay hidden from the public feed until you approve them or permanently block them
                  (score ≥ 70 auto-block is separate).
                </p>
                {(flagged.suspendedOpportunities || []).length > 0 ? (
                  <div className="space-y-4">
                    {flagged.suspendedOpportunities.map((opp) =>
                      renderQueueCard(opp, { borderClass: 'border-l-amber-400', statusTag: 'suspended' })
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-4">No suspended postings.</p>
                )}
              </div>
            </div>
          )}

          {modSubTab === 'appeals' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Employers may submit one appeal per blocked, suspended, or under review posting. Review their
                justification below.
              </p>
              {(flagged.pendingAppeals || []).length > 0 ? (
                <div className="space-y-4">
                  {flagged.pendingAppeals.map((opp) => {
                    const signals = opp.fraudSignals || [];
                    const submitted = opp.appeal?.submittedAt
                      ? new Date(opp.appeal.submittedAt).toLocaleString()
                      : '';
                    return (
                      <div key={opp._id} className="card">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <h3 className="font-semibold">{opp.title}</h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {opp.postedByUserId?.fullName || 'Unknown'} • Status:{' '}
                            <span className="font-medium text-gray-700">{opp.status}</span> • Risk{' '}
                            {opp.fraudRiskScore ?? '—'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 p-3 bg-indigo-50 rounded-xl">
                        <p className="text-xs font-semibold text-indigo-800 mb-1">Employer appeal</p>
                        <p className="text-sm text-indigo-950 whitespace-pre-wrap">{opp.appeal?.reason || '—'}</p>
                        <p className="text-[11px] text-indigo-700 mt-2">Submitted: {submitted || '—'}</p>
                      </div>
                      {signals.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {signals.slice(0, 5).map((s, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-white border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full"
                            >
                              {s.signal}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        <span className="text-xs text-gray-500">Admin note (optional)</span>
                        <textarea
                          rows={2}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                          value={appealNotes[opp._id] || ''}
                          onChange={(e) => setAppealNotes((prev) => ({ ...prev, [opp._id]: e.target.value }))}
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => reviewAppeal(opp._id, 'approve')}
                          className="btn-primary text-sm !py-1.5 !px-4"
                        >
                          Approve appeal
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewAppeal(opp._id, 'reject')}
                          className="bg-gray-200 text-gray-800 px-4 py-1.5 rounded-full text-sm hover:bg-gray-300 transition"
                        >
                          Reject appeal
                        </button>
                      </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="card text-center py-12">
                  <FiMessageSquare size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400">No pending appeals</p>
                </div>
              )}
            </div>
          )}

          {modSubTab === 'archived' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Employer-archived postings are hidden from discovery. Restore them to published or permanently remove
                them (distinct from fraud-blocked postings).
              </p>
              {archivedLoading ? (
                <div className="card text-center py-12 text-gray-400 text-sm">Loading archived postings…</div>
              ) : archivedOps.length > 0 ? (
                <div className="space-y-4">
                  {archivedOps.map((opp) => (
                    <div key={opp._id} className="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{opp.title}</h3>
                        <p className="text-sm text-gray-500">
                          {opp.postedByUserId?.fullName || 'Unknown'} • Updated{' '}
                          {opp.updatedAt ? new Date(opp.updatedAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => restoreArchived(opp._id)}
                          className="btn-primary text-sm !py-1.5 !px-4"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => purgeArchived(opp._id)}
                          className="bg-red-500 text-white px-4 py-1.5 rounded-full text-sm hover:bg-red-600 transition"
                        >
                          Delete permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card text-center py-12">
                  <FiBriefcase size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400">No archived postings</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Fraud Insights Tab ─── */}
      {tab === 'fraud' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Fraud Detection Insights (Last 30 days)</h2>
            <button
              onClick={loadFraudInsights}
              className="text-xs text-primary hover:underline"
            >
              Refresh
            </button>
          </div>

          {!fraudInsights ? (
            <div className="card text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
              <p className="text-gray-400">Loading fraud insights...</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Screened', val: fraudInsights.summary?.totalLogs ?? 0, color: 'text-blue-600 bg-blue-50' },
                  { label: 'Auto-Published', val: fraudInsights.summary?.autoPublished ?? 0, color: 'text-green-600 bg-green-50' },
                  { label: 'Sent for Review', val: fraudInsights.summary?.underReview ?? 0, color: 'text-yellow-600 bg-yellow-50' },
                  { label: 'Auto-Blocked', val: fraudInsights.summary?.blocked ?? 0, color: 'text-red-600 bg-red-50' },
                ].map((s) => (
                  <div key={s.label} className="card text-center">
                    <p className={`text-3xl font-bold ${s.color.split(' ')[0]}`}>{s.val}</p>
                    <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Average Score + Thresholds */}
              <div className="card">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FiBarChart2 size={16} className="text-primary" />
                  Model Performance Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Avg Fraud Score</p>
                    <p className="font-bold text-lg">{fraudInsights.summary?.averageScore?.toFixed(1) ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Model Predictions</p>
                    <p className="font-bold text-lg">{fraudInsights.summary?.modelPredictions ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Low Threshold</p>
                    <p className="font-bold text-lg text-green-600">{fraudInsights.thresholds?.low ?? 30}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">High Threshold</p>
                    <p className="font-bold text-lg text-red-600">{fraudInsights.thresholds?.high ?? 70}</p>
                  </div>
                </div>
              </div>

              {/* Decision Breakdown Bar Chart */}
              {fraudInsights.breakdown?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Decision Breakdown</h3>
                  <div className="space-y-3">
                    {fraudInsights.breakdown.map((b) => {
                      const total = fraudInsights.summary?.totalLogs || 1;
                      const pct = Math.round((b.count / total) * 100);
                      const color = b._id === 'published' ? 'bg-green-500' : b._id === 'blocked' ? 'bg-red-500' : 'bg-yellow-500';
                      const label = b._id === 'published' ? 'Auto-Published' : b._id === 'blocked' ? 'Auto-Blocked' : 'Sent for Review';
                      return (
                        <div key={b._id}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{label}</span>
                            <span className="font-semibold">{b.count} ({pct}%) — avg score: {b.averageScore?.toFixed(0)}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent Decision Logs */}
              <div className="card">
                <h3 className="font-semibold mb-4">Recent Decision Log (last 25)</h3>
                {fraudInsights.recentLogs?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 font-medium">Posting</th>
                          <th className="pb-2 font-medium">Score</th>
                          <th className="pb-2 font-medium">Decision</th>
                          <th className="pb-2 font-medium">Source</th>
                          <th className="pb-2 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fraudInsights.recentLogs.map((log) => (
                          <tr key={log._id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2 max-w-[180px] truncate">
                              {log.opportunityId?.title || 'Deleted posting'}
                            </td>
                            <td className="py-2">
                              <span className={`font-bold ${log.fraudScore >= 70 ? 'text-red-600' : log.fraudScore >= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {log.fraudScore}
                              </span>
                            </td>
                            <td className="py-2">
                              <span className={`badge text-xs ${
                                log.decisionOutcome === 'published' ? 'bg-green-100 text-green-700' :
                                log.decisionOutcome === 'blocked' ? 'bg-red-100 text-red-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {log.decisionOutcome?.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-2">
                              <span className="badge bg-gray-100 text-gray-600 text-xs">{log.source}</span>
                            </td>
                            <td className="py-2 text-gray-400 text-xs">
                              {new Date(log.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-6">No decision logs yet</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Model Health Tab ─── */}
      {tab === 'model_health' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">Model Health &amp; Drift Detection</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Live performance metrics, admin override trends, and training data export.
              </p>
            </div>
            <button
              onClick={loadModelHealth}
              className="text-xs text-primary hover:underline"
            >
              Refresh
            </button>
          </div>

          {modelHealthLoading ? (
            <div className="card text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
              <p className="text-gray-400">Analysing model health…</p>
            </div>
          ) : !modelHealth ? (
            <div className="card text-center py-12 text-gray-400 text-sm">
              No data yet — click Refresh to run drift analysis.
            </div>
          ) : (
            <>
              {/* ── Drift Status Banner ── */}
              {(() => {
                const dr = modelHealth.driftReport;
                if (!dr) return null;
                const statusCfg = {
                  ok: { bg: 'bg-green-50 border-green-200', icon: '✓', iconCls: 'text-green-600', label: 'Model OK', labelCls: 'text-green-800' },
                  warning: { bg: 'bg-yellow-50 border-yellow-200', icon: '⚠', iconCls: 'text-yellow-600', label: 'Warning — early drift signals', labelCls: 'text-yellow-800' },
                  drift_detected: { bg: 'bg-red-50 border-red-200', icon: '✕', iconCls: 'text-red-600', label: 'Drift Detected', labelCls: 'text-red-800' },
                };
                const cfg = statusCfg[dr.overallStatus] || statusCfg.warning;
                return (
                  <div className={`rounded-xl border p-4 ${cfg.bg}`}>
                    <div className="flex items-start gap-3">
                      <span className={`text-2xl font-bold mt-0.5 ${cfg.iconCls}`}>{cfg.icon}</span>
                      <div className="flex-1">
                        <p className={`font-semibold ${cfg.labelCls}`}>{cfg.label}</p>
                        <p className="text-sm text-gray-700 mt-1">{dr.recommendation}</p>
                        {dr.signals && dr.signals.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {dr.signals.map((s, i) => (
                              <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                                <span className="text-gray-400 mt-0.5">•</span> {s}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Model: {dr.modelVersion || '—'} · Checked: {dr.checkedAt ? new Date(dr.checkedAt).toLocaleString() : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Model Performance Metrics ── */}
              {modelHealth.modelStats && (
                <div className="card">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <FiBarChart2 size={16} className="text-primary" />
                    Model Performance Metrics
                    {modelHealth.modelStats.available && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Live</span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Accuracy', val: modelHealth.modelStats.accuracy, target: 0.85 },
                      { label: 'Precision', val: modelHealth.modelStats.precision, target: 0.90 },
                      { label: 'Recall', val: modelHealth.modelStats.recall, target: null },
                      { label: 'F1 Score', val: modelHealth.modelStats.f1, target: 0.82 },
                    ].map(({ label, val, target }) => {
                      const pct = val != null ? (val * 100).toFixed(1) : null;
                      const ok = target == null || val == null || val >= target;
                      return (
                        <div key={label} className={`rounded-xl p-4 border ${ok ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                          <p className="text-xs text-gray-500 mb-1">{label}</p>
                          <p className={`text-2xl font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>
                            {pct != null ? `${pct}%` : '—'}
                          </p>
                          {target != null && (
                            <p className={`text-xs mt-1 ${ok ? 'text-green-600' : 'text-red-600'}`}>
                              Target ≥ {(target * 100).toFixed(0)}% {ok ? '✓' : '✕'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>Evaluated on <strong>{modelHealth.modelStats.sampleCount?.toLocaleString() ?? '—'}</strong> test samples</span>
                    <span>Features: <strong>{modelHealth.modelStats.featureCount ?? '—'}</strong></span>
                    <span>Version: <strong className="font-mono text-xs">{modelHealth.modelStats.modelVersion ?? '—'}</strong></span>
                    {modelHealth.modelStats.lastTrainedAt && (
                      <span>Last trained: <strong>{new Date(modelHealth.modelStats.lastTrainedAt).toLocaleDateString()}</strong></span>
                    )}
                  </div>
                </div>
              )}

              {/* ── Admin Agreement Rate ── */}
              {modelHealth.driftReport?.adminAgreementRate != null && (
                <div className="card">
                  <h3 className="font-semibold mb-3">Admin Override Rate (last 30 days)</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Agreement with model decisions</span>
                        <span className="font-semibold">
                          {(modelHealth.driftReport.adminAgreementRate * 100).toFixed(1)}%
                          <span className="text-gray-400 font-normal ml-1">
                            ({modelHealth.driftReport.adminAgreementSampleSize} decisions)
                          </span>
                        </span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            modelHealth.driftReport.adminAgreementRate >= 0.70 ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${(modelHealth.driftReport.adminAgreementRate * 100).toFixed(1)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Threshold: 70% — below this indicates frequent model/human disagreement (drift signal)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Score Distribution Shift ── */}
              {modelHealth.driftReport?.scoreDistributionShift && (
                <div className="card">
                  <h3 className="font-semibold mb-3">Score Distribution Shift</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {[
                      { label: 'Recent high-risk rate (7d)', val: `${(modelHealth.driftReport.scoreDistributionShift.recentHighRiskRate * 100).toFixed(1)}%` },
                      { label: 'Historical high-risk rate (30d)', val: `${(modelHealth.driftReport.scoreDistributionShift.historicalHighRiskRate * 100).toFixed(1)}%` },
                      { label: 'Recent avg score', val: modelHealth.driftReport.scoreDistributionShift.recentAvgScore },
                      { label: 'Historical avg score', val: modelHealth.driftReport.scoreDistributionShift.historicalAvgScore },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="text-xl font-bold text-gray-800 mt-1">{val}</p>
                      </div>
                    ))}
                  </div>
                  {Math.abs(modelHealth.driftReport.scoreDistributionShift.shift) > 0.15 && (
                    <p className="text-sm text-yellow-700 mt-3 p-2 bg-yellow-50 rounded-lg">
                      ⚠ High-risk rate shifted by{' '}
                      {(modelHealth.driftReport.scoreDistributionShift.shift * 100).toFixed(1)}% — this may indicate
                      a change in the type of postings being submitted or concept drift.
                    </p>
                  )}
                </div>
              )}

              {/* ── Weekly Decision Trend Chart ── */}
              {modelHealth.weeklyTrend && modelHealth.weeklyTrend.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Weekly Model Decision Trend</h3>
                  <div className="h-64">
                    <Bar
                      data={{
                        labels: modelHealth.weeklyTrend.map((w) => w.week),
                        datasets: [
                          {
                            label: 'Auto-Published',
                            data: modelHealth.weeklyTrend.map((w) => w.published),
                            backgroundColor: '#22C55E',
                            borderRadius: 3,
                          },
                          {
                            label: 'Sent for Review',
                            data: modelHealth.weeklyTrend.map((w) => w.underReview),
                            backgroundColor: '#F59E0B',
                            borderRadius: 3,
                          },
                          {
                            label: 'Auto-Blocked',
                            data: modelHealth.weeklyTrend.map((w) => w.blocked),
                            backgroundColor: '#EF4444',
                            borderRadius: 3,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
                        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ── Auto-Approval Rate Trend ── */}
              {modelHealth.weeklyTrend && modelHealth.weeklyTrend.length > 1 && (
                <div className="card">
                  <h3 className="font-semibold mb-4">Auto-Approval Rate Over Time (%)</h3>
                  <div className="h-48">
                    <Line
                      data={{
                        labels: modelHealth.weeklyTrend.map((w) => w.week),
                        datasets: [
                          {
                            label: 'Auto-Approval Rate %',
                            data: modelHealth.weeklyTrend.map((w) => w.autoApprovalRate),
                            borderColor: '#6366F1',
                            backgroundColor: 'rgba(99,102,241,0.1)',
                            fill: true,
                            tension: 0.3,
                            pointRadius: 4,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, max: 100 } },
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    A sudden drop in auto-approval rate (without a matching rise in reported fraud) can signal over-sensitive model behaviour.
                  </p>
                </div>
              )}

              {/* ── Admin Feedback Log ── */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Admin Feedback Log (recent 50)</h3>
                  <span className="text-xs text-gray-400">Used as training labels</span>
                </div>
                {modelHealth.feedbackLog && modelHealth.feedbackLog.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 font-medium">Posting</th>
                          <th className="pb-2 font-medium">Score</th>
                          <th className="pb-2 font-medium">Admin Action</th>
                          <th className="pb-2 font-medium">Label</th>
                          <th className="pb-2 font-medium">Feedback</th>
                          <th className="pb-2 font-medium">By</th>
                          <th className="pb-2 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modelHealth.feedbackLog.map((log) => {
                          const isLegit = ['approve', 'appeal_approve', 'restore'].includes(log.adminAction);
                          return (
                            <tr key={log._id} className="border-b last:border-0 hover:bg-gray-50">
                              <td className="py-2 max-w-[140px] truncate">
                                {log.opportunityId?.title || 'Deleted'}
                              </td>
                              <td className="py-2">
                                <span className={`font-bold text-xs ${log.fraudScore >= 70 ? 'text-red-600' : log.fraudScore >= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                                  {log.fraudScore}
                                </span>
                              </td>
                              <td className="py-2">
                                <span className="badge bg-gray-100 text-gray-600 text-xs">{log.adminAction}</span>
                              </td>
                              <td className="py-2">
                                <span className={`badge text-xs ${isLegit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {isLegit ? 'Legitimate' : 'Fraud'}
                                </span>
                              </td>
                              <td className="py-2 max-w-[200px] truncate text-gray-500 text-xs">
                                {log.adminFeedback || '—'}
                              </td>
                              <td className="py-2 text-gray-400 text-xs">
                                {log.adminId?.fullName || '—'}
                              </td>
                              <td className="py-2 text-gray-400 text-xs">
                                {new Date(log.createdAt).toLocaleDateString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm text-center py-6">
                    No admin feedback recorded yet. Add notes when approving/rejecting postings to build training labels.
                  </p>
                )}
              </div>

              {/* ── Training Export ── */}
              <div className="card border-l-4 border-l-indigo-400">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold mb-1">Export Training Data</h3>
                    <p className="text-sm text-gray-600">
                      Download all admin-labelled fraud decisions as a JSON file. Use this with{' '}
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">scripts/retrain_model.py</code>{' '}
                      to retrain the model with real platform feedback.
                    </p>
                    {modelHealth.driftReport?.overallStatus !== 'ok' && (
                      <p className="text-sm text-yellow-700 mt-2 font-medium">
                        ⚠ Drift signals detected — retraining is recommended.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => downloadTrainingExport(90)}
                      disabled={exportLoading}
                      className="btn-primary text-sm !py-2 disabled:opacity-50"
                    >
                      {exportLoading ? 'Exporting…' : 'Export 90d'}
                    </button>
                    <button
                      onClick={() => downloadTrainingExport(365)}
                      disabled={exportLoading}
                      className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm hover:bg-indigo-200 transition disabled:opacity-50"
                    >
                      Export 1yr
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Users Tab ─── */}
      {tab === 'users' && (
        <div>
          {/* Search */}
          <div className="relative mb-4">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search users by name, email, or role..."
              className="input-field !pl-10"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserPage(1);
              }}
            />
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u) => (
                  <tr key={u._id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {u.fullName?.charAt(0)}
                        </div>
                        <span className="font-medium">{u.fullName}</span>
                      </div>
                    </td>
                    <td className="py-3 text-gray-500">{u.email}</td>
                    <td className="py-3">
                      <span className="badge bg-gray-100 text-gray-600">{u.role?.replace('_', ' ')}</span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`badge ${
                          u.accountStatus === 'active'
                            ? 'bg-green-100 text-green-700'
                            : u.accountStatus === 'suspended'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {u.accountStatus}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => toggleUserStatus(u._id, u.accountStatus)}
                          className={`text-xs px-3 py-1 rounded-full transition ${
                            u.accountStatus === 'active'
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-600 hover:bg-green-100'
                          }`}
                        >
                          {u.accountStatus === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <p className="text-center py-8 text-gray-400">No users found</p>
            )}

            {/* Pagination */}
            {filteredUsers.length > 10 && (
              <div className="flex justify-between items-center mt-4 pt-3 border-t">
                <p className="text-xs text-gray-400">
                  Showing {(userPage - 1) * 10 + 1}–{Math.min(userPage * 10, filteredUsers.length)} of{' '}
                  {filteredUsers.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    disabled={userPage === 1}
                    className="badge bg-gray-100 cursor-pointer disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setUserPage((p) => p + 1)}
                    disabled={userPage * 10 >= filteredUsers.length}
                    className="badge bg-gray-100 cursor-pointer disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Reports Tab ─── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">Content Reports ({reports.length})</h2>
          {reports.length > 0 ? (
            reports.map((r) => (
              <div
                key={r._id}
                className={`card border-l-4 ${
                  r.status === 'pending'
                    ? 'border-l-yellow-400'
                    : r.status === 'reviewed'
                    ? 'border-l-blue-400'
                    : r.status === 'action_taken'
                    ? 'border-l-green-400'
                    : 'border-l-gray-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-sm">
                      {r.targetType}: <span className="text-gray-600">{r.targetId}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Reported by: {r.reporterId?.fullName || r.reporterId?.email || 'Unknown'} •{' '}
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">{r.reason}</p>
                  </div>
                  <span
                    className={`badge text-xs ${
                      r.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-700'
                        : r.status === 'reviewed'
                        ? 'bg-blue-100 text-blue-700'
                        : r.status === 'action_taken'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {r.status?.replace('_', ' ')}
                  </span>
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => updateReportStatus(r._id, 'reviewed')}
                      className="badge bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200"
                    >
                      Mark Reviewed
                    </button>
                    <button
                      onClick={() => updateReportStatus(r._id, 'action_taken')}
                      className="badge bg-green-100 text-green-700 cursor-pointer hover:bg-green-200"
                    >
                      Action Taken
                    </button>
                    <button
                      onClick={() => updateReportStatus(r._id, 'dismissed')}
                      className="badge bg-gray-100 text-gray-600 cursor-pointer hover:bg-gray-200"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="card text-center py-12">
              <FiFlag size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400">No reports to review</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

