import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { opportunityAPI, skillAPI } from '../services/api';
import { toast } from 'react-toastify';

const PostOpportunityPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [allSkills, setAllSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', category: 'formal', location: '', isRemote: false,
    requiredSkills: [], compensationRange: { min: '', max: '', currency: 'UGX', period: 'monthly' },
    deadline: '', experienceLevel: 'any', schedule: '', applicationMethod: 'internal',
  });

  useEffect(() => {
    skillAPI.getAll().then(({ data }) => setAllSkills(data.skills || [])).catch(() => {});
  }, []);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const toggleSkill = (id) => {
    setForm((prev) => ({
      ...prev,
      requiredSkills: prev.requiredSkills.includes(id)
        ? prev.requiredSkills.filter((s) => s !== id)
        : [...prev.requiredSkills, id],
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        ...form,
        compensationRange: {
          ...form.compensationRange,
          min: Number(form.compensationRange.min) || undefined,
          max: Number(form.compensationRange.max) || undefined,
        },
      };
      await opportunityAPI.create(payload);
      toast.success('Opportunity posted! It will be reviewed shortly.');
      navigate('/employer/opportunities');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    // Step 0: Type & Location
    <div className="space-y-4" key="s0">
      <div>
        <label className="block text-sm font-medium mb-2 text-primary">1. OPPORTUNITY TYPE</label>
        <div className="flex gap-2 flex-wrap">
          {['formal', 'contract', 'freelance', 'apprenticeship'].map((c) => (
            <button key={c} onClick={() => setForm({ ...form, category: c })}
              className={`badge text-sm ${form.category === c ? 'bg-primary text-white' : 'bg-gray-100'}`}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-primary">2. LOCATION</label>
        <input className="input-field" placeholder="Enter city or area" value={form.location} onChange={update('location')} />
        <label className="flex items-center gap-2 mt-2 text-sm">
          <input type="checkbox" checked={form.isRemote} onChange={(e) => setForm({ ...form, isRemote: e.target.checked })} /> Remote
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-primary">3. REQUIRED SKILLS</label>
        <div className="flex gap-2 flex-wrap max-h-40 overflow-y-auto">
          {allSkills.map((s) => (
            <button key={s._id} onClick={() => toggleSkill(s._id)}
              className={`badge text-xs ${form.requiredSkills.includes(s._id) ? 'bg-primary text-white' : 'bg-gray-100'}`}>
              {s.skillName}
            </button>
          ))}
        </div>
      </div>
    </div>,
    // Step 1: Details
    <div className="space-y-4" key="s1">
      <div>
        <label className="block text-sm font-medium mb-1">Opportunity Title</label>
        <input className="input-field" value={form.title} onChange={update('title')} placeholder="e.g., Cleaner Needed in Kawaala" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea className="input-field h-32" value={form.description} onChange={update('description')} placeholder="Describe the tasks, environment, and expectations..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Min Pay</label>
          <input type="number" className="input-field" value={form.compensationRange.min}
            onChange={(e) => setForm({ ...form, compensationRange: { ...form.compensationRange, min: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max Pay</label>
          <input type="number" className="input-field" value={form.compensationRange.max}
            onChange={(e) => setForm({ ...form, compensationRange: { ...form.compensationRange, max: e.target.value } })} />
        </div>
      </div>
    </div>,
    // Step 2: Final
    <div className="space-y-4" key="s2">
      <div>
        <label className="block text-sm font-medium mb-1">Deadline</label>
        <input type="date" className="input-field" value={form.deadline} onChange={update('deadline')} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Experience Level</label>
        <select className="input-field" value={form.experienceLevel} onChange={update('experienceLevel')}>
          <option value="any">Any</option>
          <option value="entry">Entry Level</option>
          <option value="mid">Mid Level</option>
          <option value="senior">Senior</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">How should people apply?</label>
        <div className="flex gap-3">
          {['internal', 'external'].map((m) => (
            <button key={m} onClick={() => setForm({ ...form, applicationMethod: m })}
              className={`card flex-1 text-center py-3 text-sm ${form.applicationMethod === m ? 'border-primary bg-primary/5' : ''}`}>
              {m === 'internal' ? 'Message here' : 'External link'}
            </button>
          ))}
        </div>
      </div>
    </div>,
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-2">Post Opportunity</h1>
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${((step + 1) / 3) * 100}%` }}></div>
        </div>
        <span className="text-sm text-primary font-medium">{Math.round(((step + 1) / 3) * 100)}%</span>
      </div>

      {steps[step]}

      <div className="flex gap-3 mt-6">
        {step > 0 && <button onClick={() => setStep(step - 1)} className="btn-outline flex-1">Back</button>}
        {step < 2 ? (
          <button onClick={() => setStep(step + 1)} className="btn-primary flex-1">Next →</button>
        ) : (
          <div className="flex gap-3 flex-1">
            <button className="btn-outline flex-1">Preview</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Posting...' : 'Post Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
export default PostOpportunityPage;
