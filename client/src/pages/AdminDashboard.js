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
  }, []);

  const loadReports = async () => {
    try {
      const { data } = await reportAPI.getAll();
      setReports(data.reports || []);
    } catch {}
  };

  useEffect(() => {
    if (tab === 'reports') loadReports();
  }, [tab]);

  const moderate = async (contentId, action) => {
    try {
      await adminAPI.moderate({ contentId, action, contentType: 'opportunity' });
      toast.success(`Content ${action}d`);
      setFlagged((prev) => ({
        ...prev,
        flaggedOpportunities: prev.flaggedOpportunities.filter((o) => o._id !== contentId),
      }));
    } catch {
      toast.error('Action failed');
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
                  <button onClick={() => moderate(opp._id, 'approve')} className="btn-primary text-sm !py-1.5 !px-4">
                    Approve
                  </button>
                  <button
                    onClick={() => moderate(opp._id, 'remove')}
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
