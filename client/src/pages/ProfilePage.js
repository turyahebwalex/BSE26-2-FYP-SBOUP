import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { profileAPI } from '../services/api';
import { toast } from 'react-toastify';
import { FiCamera } from 'react-icons/fi';

// Per-user key so different accounts never share the same cached photo
const AVATAR_KEY = (userId) => `user_avatar_uri_${userId}`;

const ProfilePage = () => {
  const { user } = useAuth();
  const [profile, setProfile]     = useState(null);
  const [skills, setSkills]       = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const fileInputRef = useRef(null);

  // ── Load profile + avatar ──────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await profileAPI.getMyProfile();
        setProfile(data.profile);
        setSkills(data.skills || []);
        setExperiences(data.experiences || []);
        setEducation(data.education || []);

        // 1. Try localStorage cache first (instant)
        const userId = user?._id || user?.id || 'guest';
        const cached = localStorage.getItem(AVATAR_KEY(userId));
        if (cached) {
          setAvatarSrc(cached);
        } else if (data.profile?.avatarBase64) {
          // 2. Fall back to DB value
          const src = data.profile.avatarBase64.startsWith('data:')
            ? data.profile.avatarBase64
            : `data:image/jpeg;base64,${data.profile.avatarBase64}`;
          setAvatarSrc(src);
          localStorage.setItem(AVATAR_KEY(userId), src);
        }
      } catch { }
      setLoading(false);
    };
    load();
  }, [user]);

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return; }
    if (file.size > 2 * 1024 * 1024)    { toast.error('Image must be under 2 MB.');     return; }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUri = ev.target.result;
      const base64  = dataUri.split(',')[1];
      const userId  = user?._id || user?.id || 'guest';

      setAvatarSrc(dataUri);
      localStorage.setItem(AVATAR_KEY(userId), dataUri);

      try {
        await profileAPI.updateAvatar(base64);
        toast.success('Profile photo updated!');
      } catch {
        toast.error('Photo saved locally but could not sync to server.');
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* ── Avatar + name ── */}
      <div className="text-center mb-6">
        <div className="relative inline-block">
          {/* Avatar circle */}
          <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/20 mx-auto flex items-center justify-center text-2xl font-bold text-primary">
            {avatarSrc ? (
              <img src={avatarSrc} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              user?.fullName?.[0]
            )}
          </div>

          {/* Camera badge */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white hover:bg-gray-700 transition"
            title={avatarSrc ? 'Change photo' : 'Add photo'}
          >
            <FiCamera size={12} className="text-white" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <h1 className="text-xl font-bold mt-3">{user?.fullName}</h1>
        <p className="text-gray-500">{profile?.title || 'Add your title'}</p>
        <p className="text-sm text-gray-400">{profile?.location}</p>
      </div>

      {/* ── Rest of the page — unchanged ── */}
      {!profile ? (
        <div className="card text-center">
          <p className="text-gray-500 mb-3">You haven't set up your profile yet.</p>
          <button onClick={async () => {
            try {
              const { data } = await profileAPI.createProfile({ title: 'Professional', location: 'Uganda' });
              setProfile(data.profile);
              toast.success('Profile created!');
            } catch (e) { toast.error('Failed'); }
          }} className="btn-primary">Create Profile</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="card text-center"><p className="text-2xl font-bold text-primary">0</p><p className="text-xs text-gray-500">Opportunities</p></div>
            <div className="card text-center"><p className="text-2xl font-bold text-primary">{skills.length}</p><p className="text-xs text-gray-500">Skills</p></div>
            <div className="card text-center"><p className="text-2xl font-bold text-primary">0</p><p className="text-xs text-gray-500">Learn</p></div>
          </div>

          <div className="card mb-4">
            <h2 className="font-semibold mb-2">About</h2>
            <p className="text-sm text-gray-600">{profile.bio || 'Add a professional summary...'}</p>
          </div>

          <div className="card mb-4">
            <h2 className="font-semibold mb-2">Skills & Expertise</h2>
            <div className="flex gap-2 flex-wrap">
              {skills.map((s) => (
                <span key={s._id} className={`badge ${s.classification === 'primary' ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'}`}>
                  {s.skillId?.skillName || 'Skill'} • {s.proficiencyLevel}
                </span>
              ))}
              {skills.length === 0 && <p className="text-sm text-gray-400">No skills added yet</p>}
            </div>
          </div>

          <div className="card mb-4">
            <h2 className="font-semibold mb-2">Experience</h2>
            {experiences.map((e) => (
              <div key={e._id} className="mb-3 last:mb-0">
                <p className="font-medium text-sm">{e.jobTitle}</p>
                <p className="text-xs text-gray-500">{e.companyName} • {e.durationMonths} months</p>
              </div>
            ))}
            {experiences.length === 0 && <p className="text-sm text-gray-400">No experience added yet</p>}
          </div>

          <div className="card">
            <h2 className="font-semibold mb-2">Education</h2>
            {education.map((e) => (
              <div key={e._id} className="mb-3 last:mb-0">
                <p className="font-medium text-sm">{e.qualification}</p>
                <p className="text-xs text-gray-500">{e.institution} • {e.startYear}-{e.endYear || 'Present'}</p>
              </div>
            ))}
            {education.length === 0 && <p className="text-sm text-gray-400">No education added yet</p>}
          </div>
        </>
      )}
    </div>
  );
};

export default ProfilePage;
