import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '', email: '', phoneNumber: '', password: '', confirmPassword: '', role: 'skilled_worker', companyName: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (form.role === 'employer' && !form.companyName.trim()) {
      return toast.error('Please provide your company name');
    }
    setLoading(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phoneNumber: form.phoneNumber.trim(),
        password: form.password,
        role: form.role,
        ...(form.role === 'employer' ? { companyName: form.companyName.trim() } : {}),
      };
      await register(payload);
      toast.success('Registration successful! Please verify your email.');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">
            <span className="text-primary">Skill</span><span className="text-secondary">Bridge</span>
          </h1>
        </div>

        <div className="card">
          <h2 className="text-2xl font-semibold mb-6">Create account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" required className="input-field" value={form.fullName} onChange={update('fullName')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input type="email" required className="input-field" value={form.email} onChange={update('email')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
              <input type="tel" className="input-field" value={form.phoneNumber} onChange={update('phoneNumber')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required minLength={8} className="input-field" value={form.password} onChange={update('password')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" required className="input-field" value={form.confirmPassword} onChange={update('confirmPassword')} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select role</label>
              <div className="flex gap-3">
                {['employer', 'skilled_worker'].map((r) => (
                  <button key={r} type="button"
                    onClick={() => setForm({ ...form, role: r })}
                    className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition ${
                      form.role === r ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-500'
                    }`}>
                    {r === 'employer' ? 'Employer' : 'Skilled Worker'}
                  </button>
                ))}
              </div>
            </div>

            {form.role === 'employer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input type="text" required className="input-field" placeholder="Your company or business name" value={form.companyName} onChange={update('companyName')} />
              </div>
            )}

            <p className="text-xs text-gray-500">By continuing, you agree to our <a href="#" className="text-primary">Terms and Conditions</a>.</p>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating...' : 'Next'}
            </button>
          </form>

          <p className="text-center text-sm mt-4 text-gray-500">
            Already have an account? <Link to="/login" className="text-primary font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
