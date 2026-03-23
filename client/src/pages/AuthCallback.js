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
    if (token) {
      localStorage.setItem('accessToken', token);
      if (refresh) localStorage.setItem('refreshToken', refresh);
      loadUser().then(() => navigate('/dashboard'));
    } else {
      navigate('/login');
    }
  }, [params, loadUser, navigate]);

  return <div className="flex items-center justify-center h-screen">Authenticating...</div>;
};
export default AuthCallback;
