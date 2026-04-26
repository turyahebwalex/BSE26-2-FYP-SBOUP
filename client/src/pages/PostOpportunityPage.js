import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { opportunityAPI, skillAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatMoney = (n) => (n ? Number(n).toLocaleString('en-US') : null);

const labelForType = (c) => c ? c.charAt(0).toUpperCase() + c.slice(1) : '—';
const labelForExperience = (e) => ({ any: 'Any level', entry: 'Entry level', mid: 'Mid level', senior: 'Senior' }[e] || e || '—');
const labelForApply = (m) => (m === 'internal' ? 'In-app messaging' : 'External link');

const PostOpportunityPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [allSkills, setAllSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customAdding, setCustomAdding] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', category: 'formal', location: '', isRemote: false,
    requiredSkills: [], compensationRange: { min: '', max: '', currency: 'UGX', period: 'monthly' },
    deadline: '', experienceLevel: 'any', schedule: '', applicationMethod: 'internal',
  });

  useEffect(() => {
    skillAPI.getAll().then(({ data }) => setAllSkills(data.skills || [])).catch(() => {});
  }, []);

  // Debounced AI suggestions: only fire when both title and description have meaningful content.
  useEffect(() => {
    const title = form.title.trim();
    const description = form.description.trim();
    if (title.length < 10 || description.length < 10) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    setSuggestLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await skillAPI.suggest({ title, description });
        if (!alive) return;
        const list = data.suggestions || [];
        setSuggestions(list);
        // merge any newly-created external skills into allSkills so they render in the catalog too
        setAllSkills((prev) => {
          const existing = new Set(prev.map((s) => String(s._id)));
          const merged = [...prev];
          for (const s of list) {
            if (!existing.has(String(s._id))) merged.push({ _id: s._id, skillName: s.name });
          }
          return merged;
        });
      } catch {
        if (alive) setSuggestions([]);
      } finally {
        if (alive) setSuggestLoading(false);
      }
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [form.title, form.description]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const toggleSkill = (id) => {
    setForm((prev) => ({
      ...prev,
      requiredSkills: prev.requiredSkills.includes(id)
        ? prev.requiredSkills.filter((s) => s !== id)
        : [...prev.requiredSkills, id],
    }));
  };

  const customMatches = (() => {
    const q = customInput.trim().toLowerCase();
    if (q.length < 2) return [];
    return allSkills
      .filter((s) => s.skillName.toLowerCase().includes(q))
      .slice(0, 3);
  })();

  const addCustomSkill = async () => {
    const name = customInput.trim();
    if (!name) return;
    // Exact (case-insensitive) match in catalog → just select it.
    const existing = allSkills.find((s) => s.skillName.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!form.requiredSkills.includes(existing._id)) toggleSkill(existing._id);
      setCustomInput('');
      return;
    }
    setCustomAdding(true);
    try {
      const { data } = await skillAPI.addCustom(name);
      const skill = data.skill;
      setAllSkills((prev) => (prev.some((s) => String(s._id) === String(skill._id)) ? prev : [...prev, skill]));
      if (!form.requiredSkills.includes(skill._id)) toggleSkill(skill._id);
      setCustomInput('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add skill');
    } finally {
      setCustomAdding(false);
    }
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
    </div>,
    // Step 1: Title & Description
    <div className="space-y-4" key="s1">
      <div>
        <label className="block text-sm font-medium mb-2 text-primary">3. OPPORTUNITY TITLE</label>
        <input className="input-field" value={form.title} onChange={update('title')} placeholder="e.g., Cleaner Needed in Kawaala" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-primary">4. DESCRIPTION</label>
        <textarea className="input-field h-32" value={form.description} onChange={update('description')} placeholder="Describe the tasks, environment, and expectations..." />
      </div>
    </div>,
    // Step 2: Required Skills
    <div className="space-y-4" key="s2">
      <div>
        <label className="block text-sm font-medium mb-2 text-primary">5. REQUIRED SKILLS</label>
        <p className="text-xs text-gray-500 mb-3">Pick the skills this opportunity needs. Suggestions appear once your title and description are filled in.</p>

        {(suggestLoading || suggestions.length > 0) && (
          <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-primary uppercase tracking-wide">AI Suggested</span>
              {suggestLoading && <span className="text-xs text-gray-500">Thinking…</span>}
            </div>
            {suggestions.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {suggestions.map((s) => {
                  const selected = form.requiredSkills.includes(s._id);
                  const external = s.source && s.source !== 'internal';
                  return (
                    <button
                      key={s._id}
                      onClick={() => toggleSkill(s._id)}
                      title={external ? `Suggested from ${s.source}` : 'From your skill catalog'}
                      className={`badge text-xs ${selected ? 'bg-primary text-white' : 'bg-white border border-primary/40 text-primary'}`}
                    >
                      {external && <span className="mr-1">⚡</span>}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              !suggestLoading && <p className="text-xs text-gray-500">No suggestions yet — try refining your title or description.</p>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap max-h-60 overflow-y-auto">
          {allSkills
            .filter((s) => !suggestions.some((sg) => String(sg._id) === String(s._id)))
            .map((s) => (
              <button key={s._id} onClick={() => toggleSkill(s._id)}
                className={`badge text-xs ${form.requiredSkills.includes(s._id) ? 'bg-primary text-white' : 'bg-gray-100'}`}>
                {s.skillName}
              </button>
            ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Add a custom skill</label>
          <div className="flex gap-2">
            <input
              className="input-field flex-1"
              placeholder="e.g., Boda boda dispatching"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomSkill();
                }
              }}
            />
            <button
              type="button"
              onClick={addCustomSkill}
              disabled={customAdding || !customInput.trim()}
              className="btn-primary px-4 text-sm"
            >
              {customAdding ? 'Adding…' : '+ Add'}
            </button>
          </div>
          {customMatches.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">
              Did you mean:{' '}
              {customMatches.map((m, i) => (
                <span key={m._id}>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      if (!form.requiredSkills.includes(m._id)) toggleSkill(m._id);
                      setCustomInput('');
                    }}
                  >
                    {m.skillName}
                  </button>
                  {i < customMatches.length - 1 && ', '}
                </span>
              ))}
              ?
            </div>
          )}
        </div>
      </div>
    </div>,
    // Step 3: Final
    <div className="space-y-4" key="s3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Min Pay (UGX)</label>
          <input type="number" className="input-field" placeholder="e.g., 100,000 UGX" value={form.compensationRange.min}
            onChange={(e) => setForm({ ...form, compensationRange: { ...form.compensationRange, min: e.target.value } })} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max Pay (UGX)</label>
          <input type="number" className="input-field" placeholder="e.g., 500,000 UGX" value={form.compensationRange.max}
            onChange={(e) => setForm({ ...form, compensationRange: { ...form.compensationRange, max: e.target.value } })} />
        </div>
      </div>
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
          <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }}></div>
        </div>
        <span className="text-sm text-primary font-medium">{Math.round(((step + 1) / steps.length) * 100)}%</span>
      </div>

      {steps[step]}

      <div className="flex gap-3 mt-6">
        {step > 0 && <button onClick={() => setStep(step - 1)} className="btn-outline flex-1">Back</button>}
        {step < steps.length - 1 ? (
          <button onClick={() => setStep(step + 1)} className="btn-primary flex-1">Next →</button>
        ) : (
          <div className="flex gap-3 flex-1">
            <button onClick={() => setPreviewOpen(true)} className="btn-outline flex-1">Preview</button>
            <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Posting...' : 'Post Now'}
            </button>
          </div>
        )}
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="bg-gray-100 rounded-lg max-w-2xl w-full my-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal chrome */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white rounded-t-lg">
              <span className="text-sm font-semibold text-gray-700">Opportunity Preview</span>
              <button
                onClick={() => setPreviewOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                aria-label="Close preview"
              >
                ×
              </button>
            </div>

            {/* Printable A4-style document */}
            <div className="p-4 sm:p-6">
              <div
                className="bg-white shadow-sm border border-gray-200 mx-auto"
                style={{ maxWidth: '720px', padding: '40px 48px' }}
              >
                {/* Letterhead */}
                <div className="flex items-center justify-between pb-4 border-b-2 border-primary">
                  <div>
                    <div className="text-xl font-bold">
                      <span className="text-primary">Skill</span>
                      <span className="text-gray-900">Bridge</span>
                    </div>
                    <div className="text-[11px] text-gray-500 tracking-wide uppercase">Opportunity Posting</div>
                  </div>
                  <div className="text-right text-[11px] text-gray-500">
                    <div>Generated</div>
                    <div className="font-medium text-gray-700">{formatDate(new Date().toISOString())}</div>
                  </div>
                </div>

                {/* Title block */}
                <div className="pt-5 pb-4">
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                    {form.title || 'Untitled Opportunity'}
                  </h1>
                  <div className="mt-2 text-sm text-gray-600">
                    Posted by <span className="font-medium text-gray-800">{user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user?.email || 'Employer')}</span>
                  </div>
                </div>

                {/* Quick facts */}
                <div className="grid grid-cols-3 gap-4 py-4 border-y border-gray-200 text-sm">
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Type</div>
                    <div className="text-gray-900">{labelForType(form.category)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</div>
                    <div className="text-gray-900">{form.location || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Mode</div>
                    <div className="text-gray-900">{form.isRemote ? 'Remote' : 'On-site'}</div>
                  </div>
                </div>

                {/* About */}
                <section className="pt-5">
                  <h2 className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-2">About this opportunity</h2>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {form.description || <span className="italic text-gray-400">No description provided.</span>}
                  </p>
                </section>

                {/* Required skills */}
                <section className="pt-5">
                  <h2 className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-2">Required Skills</h2>
                  {form.requiredSkills.length === 0 ? (
                    <p className="text-sm italic text-gray-400">No skills selected yet.</p>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      {form.requiredSkills.map((id) => {
                        const s = allSkills.find((x) => String(x._id) === String(id));
                        return (
                          <span
                            key={id}
                            className="text-xs px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary font-medium"
                          >
                            {s ? s.skillName : 'Skill'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Compensation & terms */}
                <section className="pt-5 pb-2">
                  <h2 className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-3">Compensation &amp; Terms</h2>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-500 w-1/2">Pay range</td>
                        <td className="py-2 text-gray-900 text-right font-medium">
                          {(formatMoney(form.compensationRange.min) || formatMoney(form.compensationRange.max))
                            ? `UGX ${formatMoney(form.compensationRange.min) || '—'} – ${formatMoney(form.compensationRange.max) || '—'}`
                            : '—'}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-500">Payment period</td>
                        <td className="py-2 text-gray-900 text-right font-medium capitalize">
                          {form.compensationRange.period || 'Monthly'}
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-500">Experience level</td>
                        <td className="py-2 text-gray-900 text-right font-medium">{labelForExperience(form.experienceLevel)}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-500">Application method</td>
                        <td className="py-2 text-gray-900 text-right font-medium">{labelForApply(form.applicationMethod)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-gray-500">Apply by</td>
                        <td className="py-2 text-gray-900 text-right font-medium">{formatDate(form.deadline)}</td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                {/* Footer */}
                <div className="mt-6 pt-3 border-t border-gray-200 text-[10px] text-gray-400 text-center">
                  Generated via SkillBridge — confirm details before posting.
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="px-5 py-3 border-t border-gray-200 bg-white rounded-b-lg flex gap-2">
              <button
                onClick={() => setPreviewOpen(false)}
                className="btn-outline flex-1 text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => { setPreviewOpen(false); handleSubmit(); }}
                disabled={loading}
                className="btn-primary flex-1 text-sm"
              >
                {loading ? 'Posting…' : 'Post Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PostOpportunityPage;
