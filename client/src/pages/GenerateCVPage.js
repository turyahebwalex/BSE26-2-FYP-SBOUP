import React, { useState } from 'react';
import { cvAPI } from '../services/api';
import { toast } from 'react-toastify';

const GenerateCVPage = () => {
  const [selectedData, setSelectedData] = useState(['experience', 'skills']);
  const [template, setTemplate] = useState('chronological');
  const [loading, setLoading] = useState(false);
  const [cv, setCv] = useState(null);

  const toggleData = (key) => {
    setSelectedData((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await cvAPI.generate({ templateType: template, selectedData });
      setCv(data.cv);
      toast.success('CV generated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'CV generation failed');
    } finally {
      setLoading(false);
    }
  };

  const dataOptions = [
    { key: 'experience', label: 'Work Experience', desc: 'Include roles, dates, and achievements', icon: '💼' },
    { key: 'skills', label: 'Skills', desc: 'Imaginative, Idealistic, Leadership', icon: '⭐' },
    { key: 'community', label: 'Community Engagements', desc: 'Volunteering and local initiatives', icon: '🤝' },
    { key: 'personality', label: 'Personality Traits', desc: 'Extroversion, Openness, Reliability', icon: '🧠' },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-6">Generate Your CV</h1>

      <div className="mb-6">
        <h2 className="font-semibold mb-3 text-sm text-gray-700 uppercase">Select Profile Data</h2>
        <div className="space-y-3">
          {dataOptions.map((opt) => (
            <button key={opt.key} onClick={() => toggleData(opt.key)}
              className={`card w-full text-left flex items-center gap-3 transition ${selectedData.includes(opt.key) ? 'border-primary bg-primary/5' : ''}`}>
              <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${selectedData.includes(opt.key) ? 'bg-primary border-primary text-white' : 'border-gray-300'}`}>
                {selectedData.includes(opt.key) && '✓'}
              </span>
              <div>
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="font-semibold mb-3 text-sm text-gray-700 uppercase">Choose a Template</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'chronological', label: 'Professional' },
            { key: 'skills_based', label: 'Modern' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTemplate(t.key)}
              className={`card text-center py-6 transition ${template === t.key ? 'border-primary bg-primary/5' : ''}`}>
              <div className="w-12 h-16 bg-gray-200 rounded mx-auto mb-2"></div>
              <p className="text-sm font-medium">{t.label}</p>
              {template === t.key && <span className="text-primary text-lg">✓</span>}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleGenerate} disabled={loading || selectedData.length === 0}
        className="btn-primary w-full flex items-center justify-center gap-2">
        {loading ? 'Generating...' : '✨ Generate Preview'}
      </button>

      {cv && (
        <div className="card mt-4 bg-green-50 border-green-200">
          <p className="font-semibold text-green-700">CV Generated!</p>
          <p className="text-sm text-gray-600 mt-1">Template: {cv.templateType}</p>
          <a href={cv.fileUrl} className="text-primary text-sm hover:underline mt-2 inline-block">Download CV</a>
        </div>
      )}
    </div>
  );
};
export default GenerateCVPage;
