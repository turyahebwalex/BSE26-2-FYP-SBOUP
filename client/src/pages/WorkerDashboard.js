import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { matchingAPI, learningAPI } from '../services/api';
import { FiSearch, FiFileText, FiMapPin, FiMessageCircle } from 'react-icons/fi';

const WorkerDashboard = () => {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState([]);
  const [matchScore, setMatchScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await matchingAPI.getRecommendations();
        setRecommendations(data.recommendations || []);
        if (data.recommendations?.length > 0) {
          setMatchScore(Math.round(data.recommendations[0].matchScore));
        }
      } catch (err) {
        console.log('Matching service unavailable');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Greeting */}
      <div className="mb-4">
        <h1 className="text-xl font-bold">Good morning, <span className="text-primary">{user?.fullName?.split(' ')[0]}!</span></h1>
        <p className="text-sm text-gray-500">Senior Strategy Consultant</p>
      </div>

      {/* AI Match Score Card */}
      <div className="bg-secondary text-white rounded-2xl p-5 mb-6">
        <p className="text-sm opacity-80">YOUR AI MATCH SCORE TODAY</p>
        <div className="flex items-end gap-3 mt-1">
          <span className="text-4xl font-bold">{matchScore || '—'}%</span>
          {matchScore && matchScore >= 80 && (
            <span className="badge bg-green-500 text-white mb-1">EXCELLENT</span>
          )}
        </div>
        <p className="text-xs opacity-70 mt-2">
          {recommendations.length} new opportunities match your skills & experience
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { icon: FiSearch, label: 'Browse Matches', to: '/discover' },
          { icon: FiFileText, label: 'Generate CV', to: '/cv/generate' },
          { icon: FiMapPin, label: 'Local Hubs', to: '/discover' },
          { icon: FiMessageCircle, label: 'AI Assistant', to: '#' },
        ].map(({ icon: Icon, label, to }) => (
          <Link key={label} to={to} className="flex flex-col items-center gap-1 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <Icon size={20} className="text-gray-600" />
            </div>
            <span className="text-xs text-gray-600">{label}</span>
          </Link>
        ))}
      </div>

      {/* Recommended Opportunities */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Recommended for You</h2>
          <Link to="/discover" className="text-primary text-sm">View all</Link>
        </div>
        {loading ? (
          <div className="card text-center py-8 text-gray-400">Loading recommendations...</div>
        ) : recommendations.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">Complete your profile to get personalized matches!</p>
            <Link to="/profile" className="btn-primary mt-3 inline-block text-sm">Build Profile</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.slice(0, 3).map((rec) => (
              <Link key={rec.opportunityId} to={`/opportunities/${rec.opportunityId}`} className="card block hover:shadow-md transition">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm">{rec.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">{rec.missingSkills?.length || 0} skill gaps</p>
                  </div>
                  <span className="badge bg-green-100 text-green-700">{Math.round(rec.matchScore)}% Match</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Close Skill Gaps */}
      <div>
        <h2 className="font-semibold mb-3">Close Your Skill Gaps</h2>
        <Link to="/learning" className="card flex items-center gap-3 hover:shadow-md transition">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <span className="text-red-500 text-lg">📚</span>
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">Start Learning</p>
            <p className="text-xs text-gray-500">Unlock higher-paying roles</p>
          </div>
          <span className="btn-primary text-xs !px-3 !py-1">Start Learning</span>
        </Link>
      </div>
    </div>
  );
};

export default WorkerDashboard;
