import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { profileAPI } from '../services/api';
import { toast } from 'react-toastify';

const ProfilePage = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [skills, setSkills] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [education, setEducation] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await profileAPI.getMyProfile();
        setProfile(data.profile);
        setSkills(data.skills || []);
        setExperiences(data.experiences || []);
        setEducation(data.education || []);
      } catch { }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-primary/20 rounded-full mx-auto flex items-center justify-center text-2xl font-bold text-primary">
          {user?.fullName?.[0]}
        </div>
        <h1 className="text-xl font-bold mt-3">{user?.fullName}</h1>
        <p className="text-gray-500">{profile?.title || 'Add your title'}</p>
        <p className="text-sm text-gray-400">{profile?.location}</p>
      </div>

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
