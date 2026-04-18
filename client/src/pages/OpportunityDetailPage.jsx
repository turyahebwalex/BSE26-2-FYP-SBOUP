import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { opportunityAPI, applicationAPI, matchingAPI } from '../services/api';
import { toast } from 'react-toastify';

const OpportunityDetailPage = () => {
  const { id } = useParams();
  const [opp, setOpp] = useState(null);
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await opportunityAPI.getById(id);
        setOpp(data.opportunity);
      } catch { }
      setLoading(false);
    };
    load();
  }, [id]);

  const handleApply = async () => {
    try {
      await applicationAPI.apply({ opportunityId: id, profileId: 'auto' });
      toast.success('Application submitted!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to apply');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;
  if (!opp) return <div className="text-center py-8">Opportunity not found</div>;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold">{opp.title}</h1>
      <p className="text-gray-500 text-sm mt-1">{opp.location} • Posted {new Date(opp.createdAt).toLocaleDateString()}</p>

      {matchData && (
        <div className="card mt-4 bg-green-50 border-green-200">
          <p className="text-sm font-medium text-green-700">MATCH SCORE</p>
          <p className="text-3xl font-bold text-green-700">{Math.round(matchData.matchScore)}%</p>
        </div>
      )}

      <Link to="/cv/generate" className="btn-primary w-full mt-4 text-center block">Generate Tailored CV</Link>

      <div className="mt-6">
        <h2 className="font-semibold mb-2">Job Description</h2>
        <p className="text-gray-700 text-sm whitespace-pre-line">{opp.description}</p>
      </div>

      <div className="mt-4">
        <h2 className="font-semibold mb-2">Required Skills</h2>
        <div className="flex gap-2 flex-wrap">
          {opp.requiredSkills?.map((s) => (
            <span key={s._id || s} className="badge bg-gray-100 text-gray-600">{s.skillName || s}</span>
          ))}
        </div>
      </div>

      {opp.compensationRange?.min && (
        <div className="mt-4">
          <h2 className="font-semibold mb-1">Compensation</h2>
          <p className="text-sm text-gray-600">{opp.compensationRange.currency} {opp.compensationRange.min?.toLocaleString()} - {opp.compensationRange.max?.toLocaleString()} / {opp.compensationRange.period}</p>
        </div>
      )}

      <button onClick={handleApply} className="btn-primary w-full mt-6">Quick Apply</button>
    </div>
  );
};
export default OpportunityDetailPage;
