import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminAPI, companyAPI, opportunityAPI, profileAPI } from '../services/api';
import { toast } from 'react-toastify';
import { FiArrowLeft, FiBriefcase, FiMapPin, FiGlobe, FiMail, FiPhone, FiAlertTriangle } from 'react-icons/fi';

const AdminTargetDetailPage = () => {
  const { targetType, targetId } = useParams();
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [positions, setPositions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posLoading, setPosLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        if (targetType === 'user') {
          try {
            const { data } = await adminAPI.getUser(targetId);
            if (data?.user) {
              setDetails(data.user);
              // Fetch profile for skilled workers
              if (data.user.role === 'skilled_worker') {
                try {
                  const profileRes = await profileAPI.getProfileByUserId(data.user._id);
                  if (profileRes.data?.profile) {
                    setProfile(profileRes.data.profile);
                  }
                } catch (e) {
                  // Profile might not exist
                }
              }
            } else {
              setDetails({ _id: targetId, error: 'User not found' });
            }
          } catch (e) {
            setDetails({ _id: targetId, error: 'User not found' });
          }
        } else if (targetType === 'company') {
          const { data } = await companyAPI.getById(targetId);
          setDetails(data.company || { _id: targetId, error: 'Company not found' });
          setPosLoading(true);
          // Fetch open positions (published status)
          const posRes = await opportunityAPI.getAll({ companyId: targetId, limit: 50, status: 'published' });
          setPositions(posRes.data.opportunities || []);
          setPosLoading(false);
        }
      } catch (error) {
        toast.error('Failed to load details');
        setDetails({ _id: targetId, error: 'Failed to load' });
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [targetType, targetId]);

  const handleAction = async (action) => {
    const note = action !== 'reinstate' ? prompt('Enter reason for this action:') : null;
    if (note === null && action !== 'reinstate') return;
    try {
      if (targetType === 'user') {
        await adminAPI.applyUserAction(targetId, { action, note });
      } else {
        await adminAPI.applyCompanyAction(targetId, { action, note });
      }
      toast.success(`Action ${action} applied`);
      navigate('/admin?tab=reports');
    } catch {
      toast.error('Action failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!details || details.error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/admin?tab=reports')} className="flex items-center gap-2 text-sm text-gray-600 mb-4 hover:text-primary">
          <FiArrowLeft size={16} /> Back to Reports
        </button>
        <div className="card text-center py-12">
          <FiAlertTriangle size={32} className="mx-auto text-red-500 mb-3" />
          <p className="text-gray-600">{details?.error || 'Target not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => navigate('/admin?tab=reports')} className="flex items-center gap-2 text-sm text-gray-600 mb-4 hover:text-primary">
        <FiArrowLeft size={16} /> Back to Reports
      </button>

      <div className="card mb-6">
        <h2 className="font-semibold text-lg mb-4 capitalize">{targetType} Details</h2>
        
        {targetType === 'user' && details && !details.error && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p><span className="font-medium">Name:</span> {details.fullName}</p>
                <p><span className="font-medium">Email:</span> {details.email}</p>
                <p><span className="font-medium">Role:</span> {details.role?.replace('_', ' ')}</p>
                <p><span className="font-medium">Status:</span> 
                  <span className={`ml-2 badge ${
                    details.accountStatus === 'active' 
                      ? 'bg-green-100 text-green-700' 
                      : details.accountStatus === 'suspended' 
                        ? 'bg-red-100 text-red-700' 
                        : details.accountStatus === 'banned'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {details.accountStatus}
                  </span>
                </p>
              </div>
              {details.phoneNumber && (
                <div className="space-y-2">
                  <p><span className="font-medium">Phone:</span> {details.phoneNumber}</p>
                  <p><span className="font-medium">Member since:</span> {new Date(details.createdAt).toLocaleDateString()}</p>
                  {details.lastLoginAt && (
                    <p><span className="font-medium">Last login:</span> {new Date(details.lastLoginAt).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>

            {profile && profile.title && (
              <div className="pt-3 border-t">
                <p className="font-medium">Professional Title:</p>
                <p className="text-sm text-gray-600">{profile.title}</p>
              </div>
            )}

            {profile && profile.bio && (
              <div>
                <p className="font-medium">Bio:</p>
                <p className="text-sm text-gray-600">{profile.bio}</p>
              </div>
            )}

            {profile && profile.location && (
              <div>
                <p className="font-medium">Location:</p>
                <p className="text-sm text-gray-600">{profile.location}</p>
              </div>
            )}

            {profile && profile.portfolioItems?.length > 0 && (
              <div>
                <p className="font-medium mb-2">Portfolio Items ({profile.portfolioItems.length})</p>
                <div className="space-y-2">
                  {profile.portfolioItems.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="p-2 bg-gray-50 rounded">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500">{item.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {targetType === 'company' && details && !details.error && (
          <div className="space-y-3">
            <p className="text-xl font-semibold">{details.name}</p>
            {details.industry && <p><span className="font-medium">Industry:</span> {details.industry}</p>}
            {details.location && <p className="flex items-center gap-2"><FiMapPin size={14} /> {details.location}</p>}
            {details.website && <p className="flex items-center gap-2"><FiGlobe size={14} /> <a href={details.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{details.website}</a></p>}
            {details.contactEmail && <p className="flex items-center gap-2"><FiMail size={14} /> {details.contactEmail}</p>}
            {details.contactPhone && <p className="flex items-center gap-2"><FiPhone size={14} /> {details.contactPhone}</p>}
            <p><span className="font-medium">Verification:</span> 
              <span className="ml-2 badge bg-gray-100">{details.verificationStatus || 'unverified'}</span>
            </p>
            <p><span className="font-medium">Moderation Status:</span> 
              <span className={`ml-2 badge ${details.moderationStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {details.moderationStatus || 'active'}
              </span>
            </p>
            {details.moderationNote && (
              <p className="text-sm text-gray-500"><span className="font-medium">Note:</span> {details.moderationNote}</p>
            )}
            {details.description && (
              <>
                <p className="font-medium mt-4">About</p>
                <p className="text-sm text-gray-600">{details.description}</p>
              </>
            )}
          </div>
        )}
      </div>

      {targetType === 'company' && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FiBriefcase size={18} className="text-primary" />
            <h3 className="font-semibold text-lg">Open Positions ({positions.length})</h3>
          </div>
          {posLoading ? (
            <p className="text-gray-400">Loading positions...</p>
          ) : positions.length === 0 ? (
            <p className="text-gray-400">No open positions</p>
          ) : (
            <div className="space-y-3">
              {positions.map(pos => (
                <div key={pos._id} className="border-b pb-3 last:border-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{pos.title}</p>
                      <p className="text-sm text-gray-500">{pos.category} • {pos.location || 'Remote'}</p>
                    </div>
                    <span className="badge bg-gray-100 text-xs">{pos.status}</span>
                  </div>
                  {pos.compensationRange?.min || pos.compensationRange?.max ? (
                    <p className="text-sm text-gray-600 mt-1">
                      Salary: {pos.compensationRange.min?.toLocaleString() || '—'} – {pos.compensationRange.max?.toLocaleString() || '—'} UGX
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {targetType === 'user' && details?.companyId && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FiBriefcase size={16} className="text-primary" />
            <h3 className="font-semibold">Associated Company</h3>
          </div>
          <Link 
            to={`/admin/target/company/${details.companyId}`}
            className="text-primary hover:underline text-sm"
          >
            View company details →
          </Link>
        </div>
      )}

      {targetType === 'user' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Admin Actions</h3>
          <p className="text-xs text-gray-500 mb-3">Review the profile above before taking action.</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleAction('warn')} className="badge bg-amber-50 text-amber-700 hover:bg-amber-100">Warn</button>
            <button onClick={() => handleAction('suspend')} className="badge bg-orange-50 text-orange-700 hover:bg-orange-100">Suspend</button>
            <button onClick={() => handleAction('ban')} className="badge bg-red-50 text-red-700 hover:bg-red-100">Ban</button>
            {details.accountStatus !== 'active' && (
              <button onClick={() => handleAction('reinstate')} className="badge bg-green-50 text-green-700 hover:bg-green-100">Reinstate</button>
            )}
          </div>
        </div>
      )}

      {targetType === 'company' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Admin Actions</h3>
          <p className="text-xs text-gray-500 mb-3">Review the profile above before taking action.</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleAction('warn')} className="badge bg-amber-50 text-amber-700 hover:bg-amber-100">Warn</button>
            <button onClick={() => handleAction('suspend')} className="badge bg-orange-50 text-orange-700 hover:bg-orange-100">Suspend</button>
            <button onClick={() => handleAction('ban')} className="badge bg-red-50 text-red-700 hover:bg-red-100">Ban</button>
            {details.moderationStatus !== 'active' && (
              <button onClick={() => handleAction('reinstate')} className="badge bg-green-50 text-green-700 hover:bg-green-100">Reinstate</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTargetDetailPage;