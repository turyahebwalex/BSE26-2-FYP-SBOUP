import React, { useState, useEffect } from 'react';
import { learningAPI } from '../services/api';

const LearningPage = () => {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const { data } = await learningAPI.getMine(); setPaths(data.learningPaths || []); } catch {}
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Upskill</h1>
      <div className="card mb-4 bg-primary/5 border-primary/20">
        <p className="text-sm font-semibold text-primary">AI SKILL ANALYSIS</p>
        <p className="text-xs text-gray-600 mt-1">Complete your profile to get personalized skill gap analysis</p>
      </div>
      {loading ? <p className="text-center text-gray-400 py-8">Loading...</p> :
        paths.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">No learning paths yet. Apply to opportunities to discover skill gaps!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paths.map((p) => (
              <div key={p._id} className="card">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-sm">{p.targetSkill}</h3>
                  <span className="text-xs text-gray-500">{p.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div className="bg-primary rounded-full h-2" style={{ width: `${p.progress}%` }}></div>
                </div>
                <div className="mt-3 space-y-2">
                  {p.resources?.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noreferrer"
                      className="block text-sm text-primary hover:underline">
                      {r.title} <span className="text-gray-400">• {r.provider}</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
};
export default LearningPage;
