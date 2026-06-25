import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
  const [params] = useSearchParams();
  const { loadUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const refresh = params.get('refresh');

    if (!token) {
      navigate('/login?error=Authentication failed');
      return;
    }

    // Store tokens
    localStorage.setItem('accessToken', token);
    if (refresh) localStorage.setItem('refreshToken', refresh);

    // Attempt to load user data
    loadUser()
      .then(() => {
        // Success – redirect to dashboard (or home)
        navigate('/dashboard');
      })
      .catch((error) => {
        // If loadUser fails (e.g., 403 for banned/suspended), redirect to login with error
        const errorMsg = error.response?.data?.error || 'Authentication failed';
        navigate(`/login?error=${encodeURIComponent(errorMsg)}`);
      });
  }, [params, loadUser, navigate]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-gray-600">Authenticating...</p>
      </div>
    </div>
  );
};

export default AuthCallback;