import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiBell, FiPlus, FiCode, FiChevronRight, FiUsers, FiBriefcase } from 'react-icons/fi';
import { Button, Card, Badge, Avatar } from '../../../components/ui';

// ─── Dummy Data ───────────────────────────────────────────────────────────────
const STATS = { activePostings: 5, totalApplications: 34 };

const POSTINGS = [
  { _id: '1', title: 'Senior Frontend Engineer', postedAgo: '2 days ago', appCount: 12, icon: <FiCode size={18} className="text-primary" /> },
  { _id: '2', title: 'Product Designer',          postedAgo: '5 days ago', appCount: 8,  icon: <span className="text-base">✏️</span> },
  { _id: '3', title: 'Backend Engineer',           postedAgo: '1 week ago', appCount: 14, icon: <span className="text-base">⚙️</span> },
  { _id: '4', title: 'Data Analyst',               postedAgo: '3 days ago', appCount: 6,  icon: <span className="text-base">📊</span> },
];

const CANDIDATES = [
  { _id: '1', name: 'Amina Jumbe',   role: 'React Developer', yearsExp: 4, matchScore: 95, skills: ['TYPESCRIPT', 'TAILWIND'] },
  { _id: '2', name: 'Kevin Otiero',  role: 'UI/UX Designer',  yearsExp: 3, matchScore: 92, skills: ['FIGMA', 'UX'] },
  { _id: '3', name: 'Sarah Nakato',  role: 'Backend Dev',     yearsExp: 5, matchScore: 88, skills: ['NODE.JS', 'MONGODB'] },
];

// ─── Posting Card ─────────────────────────────────────────────────────────────
const PostingCard = ({ posting }) => (
  <Card
    onClick={() => {}}
    className="w-64 shrink-0 hover:shadow-md transition-shadow"
  >
    {/* Icon top-left, badge top-right */}
    <div className="flex items-start justify-between mb-4">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        {posting.icon}
      </div>
      <Badge variant="match" className="bg-primary text-white px-4 py-1.5 text-xs font-bold rounded-full">
        {posting.appCount} APPS
      </Badge>
    </div>

    {/* Title + date */}
    <p className="font-bold text-text-primary text-base leading-snug mb-1">
      {posting.title}
    </p>
    <p className="text-sm text-text-muted">Posted {posting.postedAgo}</p>

    <button className="text-primary text-xs font-semibold hover:underline text-left mt-3">
      View Applicants →
    </button>
  </Card>
);

// ─── Candidate Row ────────────────────────────────────────────────────────────
const CandidateCard = ({ candidate }) => {
  const navigate = useNavigate();
  return (
    <Card className="flex items-center gap-4 max-w-2xl">
      <Avatar name={candidate.name} size="md" className="shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-text-primary text-sm">{candidate.name}</span>
          <Badge variant="match">{candidate.matchScore}% Match</Badge>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">
          {candidate.role} • {candidate.yearsExp} yrs exp
        </p>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {candidate.skills.map((s) => (
            <span key={s} className="text-[11px] bg-surface border border-border px-2 py-0.5 rounded-full text-text-secondary font-medium">
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(`/profile/${candidate._id}`)}
          className="text-primary text-xs font-bold hover:underline"
        >
          VIEW
        </button>
        <Button size="sm">Shortlist</Button>
      </div>
    </Card>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ value, label, valueClass, icon }) => (
  <Card className="flex items-center gap-4 py-5">
    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div>
      <p className={`text-4xl font-bold leading-none ${valueClass}`}>{value}</p>
      <p className="text-xs text-text-muted uppercase tracking-wide mt-1.5">{label}</p>
    </div>
  </Card>
);

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const EmployerDashboard = () => {
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-border px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {greeting}, John!
          </h1>
          <p className="text-xs text-text-secondary">Talent Acquisition Manager</p>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => navigate('/employer/post')} size="sm">
            <FiPlus size={16} /> Post Opportunity
          </Button>
          <button
            onClick={() => navigate('/notifications')}
            className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface transition"
            aria-label="Notifications"
          >
            <FiBell size={20} className="text-text-primary" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border-2 border-white" />
          </button>
          <Avatar name="John Employer" size="md" className="cursor-pointer" />
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">

        {/* ── Stats + Quick Actions row ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            value={STATS.activePostings}
            label="Active Postings"
            valueClass="text-primary"
            icon={<FiBriefcase size={22} className="text-primary" />}
          />
          <StatCard
            value={STATS.totalApplications}
            label="Total Applications"
            valueClass="text-text-primary"
            icon={<FiUsers size={22} className="text-primary" />}
          />

          {/* Quick action cards */}
          <Card
            onClick={() => navigate('/employer/post')}
            className="flex flex-col items-center justify-center gap-2 py-5 border-dashed border-2 border-primary/30 hover:border-primary transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <FiPlus size={20} className="text-white" />
            </div>
            <p className="font-semibold text-primary text-sm">Post Opportunity</p>
            <p className="text-xs text-text-muted text-center">Reach skilled workers</p>
          </Card>

          <Card
            onClick={() => navigate('/employer/applications')}
            className="flex flex-col items-center justify-center gap-2 py-5 border-dashed border-2 border-border hover:border-primary/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center">
              <FiUsers size={20} className="text-text-secondary" />
            </div>
            <p className="font-semibold text-text-primary text-sm">View Applications</p>
            <p className="text-xs text-text-muted text-center">Review all applicants</p>
          </Card>
        </div>

        {/* ── Active Postings ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text-primary">Your Active Postings</h2>
            <Link
              to="/employer/opportunities"
              className="text-primary text-sm font-semibold hover:underline flex items-center gap-1"
            >
              See All <FiChevronRight size={14} />
            </Link>
          </div>

          {/* Horizontal scroll on smaller screens, grid on large */}
          <div className="hidden lg:grid lg:grid-cols-4 gap-4">
            {POSTINGS.map((p) => <PostingCard key={p._id} posting={p} />)}
          </div>
          <div className="flex lg:hidden gap-4 overflow-x-auto pb-2 -mx-8 px-8">
            {POSTINGS.map((p) => <PostingCard key={p._id} posting={p} />)}
          </div>        </section>

        {/* ── Two-column layout: Candidates + Side panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Candidates list — takes 2/3 */}
          <section className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-primary">Top Candidates This Week</h2>
              <Link
                to="/employer/applications"
                className="text-primary text-sm font-semibold hover:underline flex items-center gap-1"
              >
                View All <FiChevronRight size={14} />
              </Link>
            </div>
            <div className="space-y-3">
              {CANDIDATES.map((c) => <CandidateCard key={c._id} candidate={c} />)}
            </div>
          </section>

          {/* Side panel — takes 1/3 */}
          <aside className="space-y-4">
            {/* Hiring summary */}
            <Card>
              <h3 className="font-semibold text-text-primary mb-4">Hiring Summary</h3>
              <div className="space-y-3">
                {[
                  { label: 'Shortlisted',  value: 8,  color: 'bg-primary' },
                  { label: 'Interviewed',  value: 5,  color: 'bg-blue-400' },
                  { label: 'Offered',      value: 2,  color: 'bg-success' },
                  { label: 'Rejected',     value: 11, color: 'bg-gray-300' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">{item.label}</span>
                      <span className="font-semibold text-text-primary">{item.value}</span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color}`}
                        style={{ width: `${(item.value / 34) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent activity */}
            <Card>
              <h3 className="font-semibold text-text-primary mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {[
                  { text: 'Amina Jumbe applied to Senior Frontend Engineer', time: '2h ago' },
                  { text: 'Kevin Otiero shortlisted for Product Designer',    time: '4h ago' },
                  { text: 'New application for Backend Engineer',             time: '6h ago' },
                  { text: 'Sarah Nakato viewed your posting',                 time: '1d ago' },
                ].map((a, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-text-primary leading-snug">{a.text}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default EmployerDashboard;
