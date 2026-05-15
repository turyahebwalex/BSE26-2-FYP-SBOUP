import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { companyAPI } from '../services/api';
import { toast } from 'react-toastify';
import { FiCamera, FiEdit2, FiSave, FiX } from 'react-icons/fi';

const EmployerProfilePage = () => {
  const { user } = useAuth();
  const [company, setCompany]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '', industry: '', description: '', website: '',
    location: '', contactEmail: '', contactPhone: '',
  });

  // ── Load company on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.companyId) { setLoading(false); return; }
    companyAPI.getById(user.companyId)
      .then(({ data }) => {
        const c = data.company || null;
        setCompany(c);
        if (c) {
          setForm({
            name:         c.name         || '',
            industry:     c.industry     || '',
            description:  c.description  || '',
            website:      c.website      || '',
            location:     c.location     || '',
            contactEmail: c.contactEmail || '',
            contactPhone: c.contactPhone || '',
          });
          if (c.avatarBase64) {
            const src = c.avatarBase64.startsWith('data:')
              ? c.avatarBase64
              : `data:image/jpeg;base64,${c.avatarBase64}`;
            setAvatarSrc(src);
          }
        }
      })
      .catch(() => toast.error('Failed to load company profile.'))
      .finally(() => setLoading(false));
  }, [user?.companyId]);

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUri = ev.target.result;           // full data URI
      const base64  = dataUri.split(',')[1];      // raw base64 only

      setAvatarSrc(dataUri);                      // show preview immediately

      try {
        await companyAPI.updateAvatar(user.companyId, base64);
        toast.success('Company photo updated!');
      } catch {
        toast.error('Photo saved locally but could not sync to server.');
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Save company info ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Company name is required.'); return; }
    setSaving(true);
    try {
      const { data } = await companyAPI.update(user.companyId, form);
      setCompany(data.company);
      setEditing(false);
      toast.success('Company profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (company) {
      setForm({
        name:         company.name         || '',
        industry:     company.industry     || '',
        description:  company.description  || '',
        website:      company.website      || '',
        location:     company.location     || '',
        contactEmail: company.contactEmail || '',
        contactPhone: company.contactPhone || '',
      });
    }
    setEditing(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user?.companyId) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center">
        <p className="text-gray-500 mb-2">Your account is not linked to a company yet.</p>
        <p className="text-sm text-gray-400">Contact an admin to link your account to a company.</p>
      </div>
    );
  }

  const initials = (company?.name || user?.fullName || 'E')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">

      {/* ── Avatar + name header ── */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative mb-3">
          {/* Avatar circle */}
          <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center">
            {avatarSrc ? (
              <img src={avatarSrc} alt="Company logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">{initials}</span>
            )}
          </div>

          {/* Camera button overlay */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white hover:bg-gray-700 transition"
            title={avatarSrc ? 'Change photo' : 'Add photo'}
          >
            <FiCamera size={14} className="text-white" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <h1 className="text-xl font-bold">{company?.name || user?.fullName}</h1>
        <p className="text-sm text-gray-500">{company?.industry || 'Employer'}</p>
        {company?.verificationStatus === 'verified' && (
          <span className="badge bg-green-100 text-green-700 mt-1 text-xs">✓ Verified</span>
        )}
      </div>

      {/* ── Company info card ── */}
      <div className="card mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Company Information</h2>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 text-primary text-sm hover:underline"
            >
              <FiEdit2 size={14} /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 text-gray-500 text-sm hover:underline"
              >
                <FiX size={14} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 text-primary text-sm font-semibold hover:underline disabled:opacity-50"
              >
                <FiSave size={14} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {[
            { label: 'Company Name',   field: 'name',         required: true },
            { label: 'Industry',       field: 'industry' },
            { label: 'Location',       field: 'location' },
            { label: 'Website',        field: 'website',      type: 'url' },
            { label: 'Contact Email',  field: 'contactEmail', type: 'email' },
            { label: 'Contact Phone',  field: 'contactPhone', type: 'tel' },
          ].map(({ label, field, type = 'text', required }) => (
            <div key={field}>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {editing ? (
                <input
                  type={type}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="input-field w-full text-sm"
                  placeholder={`Enter ${label.toLowerCase()}`}
                />
              ) : (
                <p className="text-sm text-gray-800">
                  {company?.[field] || <span className="text-gray-400 italic">Not set</span>}
                </p>
              )}
            </div>
          ))}

          {/* Description — textarea */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            {editing ? (
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="input-field w-full text-sm resize-none"
                placeholder="Describe your company…"
              />
            ) : (
              <p className="text-sm text-gray-800 whitespace-pre-line">
                {company?.description || <span className="text-gray-400 italic">Not set</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Account info (read-only) ── */}
      <div className="card">
        <h2 className="font-semibold mb-3">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Name</span>
            <span className="font-medium">{user?.fullName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Role</span>
            <span className="badge bg-primary/10 text-primary text-xs">Employer</span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default EmployerProfilePage;
