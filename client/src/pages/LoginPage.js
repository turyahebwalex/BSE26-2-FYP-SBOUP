import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

const LoginPage = () => {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  // ─── Check for error from interceptor or route guard ──────────────
  useEffect(() => {
    // 1. Check navigation state (from ProtectedRoute or AuthContext logout)
    const stateError = location.state?.authError;
    // 2. Check query parameter (from interceptor redirect)
    const params = new URLSearchParams(location.search);
    const queryError = params.get('error');

    const error = stateError || queryError;
    if (error) {
      setAuthError(error);
      toast.error(error);
      // Clean URL to remove error param
      if (queryError) {
        navigate('/login', { replace: true, state: {} });
      }
    }
  }, [location, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
    } catch (error) {
      const msg = error.response?.data?.error || 'Login failed';
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">
            <span className="text-primary">Skill</span><span className="text-secondary">Bridge</span>
          </h1>
          <p className="text-gray-500 mt-2">Bridging Skills with Opportunities</p>
        </div>

        <div className="card">
          <h2 className="text-2xl font-semibold text-center mb-6">Sign in</h2>
          <p className="text-center mb-6">
            <Link to="/register" className="text-primary font-medium hover:underline">No account? Click Here</Link>
          </p>

          {/* ─── Error Banner ─────────────────────────────────────────── */}
          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                className="input-field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="input-field pr-12"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" /> Remember me
              </label>
              <Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>

          <div className="mt-4">
            <a
              href={`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/auth/google`}
              className="btn-outline w-full flex items-center justify-center gap-2"
            >
              Sign in with Google
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;