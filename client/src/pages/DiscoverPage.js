import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { opportunityAPI, skillAPI } from '../services/api';
import { FiSearch, FiFilter } from 'react-icons/fi';

const DiscoverPage = () => {
  const [opportunities, setOpportunities] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await opportunityAPI.getAll({ search, category, limit: 20 });
        setOpportunities(data.opportunities || []);
      } catch { }
      setLoading(false);
    };
    load();
  }, [search, category]);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Discover Jobs</h1>
      <div className="relative mb-4">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input-field pl-11"
          placeholder="Search skills, roles, or companies"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {['', 'formal', 'contract', 'freelance', 'apprenticeship'].map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={`badge whitespace-nowrap ${category === c ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
            {c || 'All'}
          </button>
        ))}
      </div>
      {loading ? <p className="text-center text-gray-400 py-8">Loading...</p> : (
        <div className="space-y-3">
          {opportunities.map((opp) => (
            <Link key={opp._id} to={`/opportunities/${opp._id}`} className="card block hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{opp.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{opp.location} • {opp.category}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {opp.requiredSkills?.slice(0, 3).map((s) => (
                  <span key={s._id || s} className="badge bg-gray-100 text-gray-600">{s.skillName || s}</span>
                ))}
              </div>
              <button className="btn-primary w-full mt-3 text-sm">Quick Apply</button>
            </Link>
          ))}
          {opportunities.length === 0 && <p className="text-center text-gray-400 py-8">No opportunities found</p>}
        </div>
      )}
    </div>
  );
};
export default DiscoverPage;
