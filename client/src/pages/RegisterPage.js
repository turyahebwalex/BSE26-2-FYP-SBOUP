import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';

const OTP_LENGTH = 6;

const RegisterPage = () => {
  const { loginWithTokens } = useAuth(); 
  const navigate = useNavigate();

  // ── Form fields ──────────────────────────────────────────────
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    companyName: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── OTP state ─────────────────────────────────────────────────
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [tempUserData, setTempUserData] = useState(null);

  const otpRefs = useRef([]);

  // ── OTP handlers ──────────────────────────────────────────────
  const handleOtpChange = (text, index) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e, index) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const getOtpCode = () => otpDigits.join('');

  // ── Send OTP ──────────────────────────────────────────────────
  const sendOtpToEmail = async (email) => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  };

  // ── Step 1: Validate & send OTP ──────────────────────────────
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (!form.companyName.trim()) {
      return toast.error('Please provide your company name');
    }
    if (!form.fullName.trim()) {
      return toast.error('Please enter your full name');
    }
    if (!form.email.trim()) {
      return toast.error('Please enter your email address');
    }
    if (form.password.length < 8) {
      return toast.error('Password must be at least 8 characters');
    }

    setOtpSending(true);
    const sent = await sendOtpToEmail(form.email.trim().toLowerCase());
    setOtpSending(false);

    if (sent) {
      setTempUserData({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phoneNumber: form.phoneNumber.trim(),
        password: form.password,
        role: 'employer',
        companyName: form.companyName.trim(),
      });
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setStep('otp');
      toast.success(`OTP sent to ${form.email}`);
    } else {
      toast.error('Failed to send OTP. Please try again.');
    }
  };

  // ── Resend OTP ─────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (!tempUserData?.email) return;
    setOtpSending(true);
    const sent = await sendOtpToEmail(tempUserData.email);
    setOtpSending(false);
    if (sent) {
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      toast.success(`OTP resent to ${tempUserData.email}`);
    } else {
      toast.error('Could not resend OTP. Please try again.');
    }
  };

  // ── Step 2: Verify OTP & complete registration ────────────────
  const handleVerifyOtp = async () => {
    const code = getOtpCode();
    if (code.length < OTP_LENGTH) {
      toast.error(`Please enter all ${OTP_LENGTH} digits.`);
      return;
    }

    setOtpVerifying(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: tempUserData.email,
          otp: code,
          userData: tempUserData,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Invalid OTP or server error.');
        setOtpVerifying(false);
        return;
      }

      if (data.accessToken && data.refreshToken && data.user) {
        // Use loginWithTokens – not the email/password login
        loginWithTokens(data.accessToken, data.refreshToken, data.user);
        toast.success('Registration successful! Welcome!');
        navigate('/dashboard');
      } else {
        toast.success('Registration successful. Please log in.');
        navigate('/login');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleBackToForm = () => {
    setStep('form');
    setOtpDigits(Array(OTP_LENGTH).fill(''));
  };

  // ── Form update helper ────────────────────────────────────────
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // ── Render: Registration Form ─────────────────────────────────
  const renderForm = () => (
    <>
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold">
          <span className="text-primary">Skill</span><span className="text-secondary">Bridge</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Employer Registration</p>
      </div>

      <div className="card">
        <h2 className="text-2xl font-semibold mb-6">Create your employer account</h2>

        <form onSubmit={handleSendOtp} className="space-y-4">
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

          {/* Password with show/hide */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                className="input-field pr-10"
                value={form.password}
                onChange={update('password')}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password with show/hide */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                className="input-field pr-10"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input type="text" required className="input-field" placeholder="Your company or business name" value={form.companyName} onChange={update('companyName')} />
          </div>

          <p className="text-xs text-gray-500">By continuing, you agree to our <a href="#" className="text-primary">Terms and Conditions</a>.</p>

          <button type="submit" disabled={otpSending} className="btn-primary w-full">
            {otpSending ? 'Sending...' : 'Continue → Verify Email'}
          </button>
        </form>

        <p className="text-center text-sm mt-4 text-gray-500">
          Already have an account? <Link to="/login" className="text-primary font-medium">Sign in</Link>
        </p>
      </div>
    </>
  );

  // ── Render: OTP Verification Screen ───────────────────────────
  const renderOtpScreen = () => (
    <div className="card max-w-md mx-auto">
      <button
        onClick={handleBackToForm}
        className="text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h2 className="text-2xl font-semibold text-center">Verify your account</h2>
      <p className="text-gray-500 text-center mt-2">We sent a verification code to</p>
      <p className="text-primary font-medium text-center">{tempUserData?.email}</p>

      <div className="flex justify-center gap-2 mt-6">
        {Array(OTP_LENGTH).fill(0).map((_, i) => (
          <input
            key={i}
            ref={(el) => (otpRefs.current[i] = el)}
            type="text"
            maxLength={1}
            className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-lg focus:border-primary focus:outline-none ${
              otpDigits[i] ? 'border-primary bg-orange-50' : 'border-gray-300'
            }`}
            value={otpDigits[i]}
            onChange={(e) => handleOtpChange(e.target.value, i)}
            onKeyDown={(e) => handleOtpKeyPress(e, i)}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-3">Code expires in 10 minutes</p>

      <div className="text-center mt-4">
        <button
          onClick={handleResendOtp}
          disabled={otpSending}
          className="text-primary font-medium hover:underline disabled:opacity-50"
        >
          {otpSending ? 'Sending...' : "Didn't receive the code? Resend"}
        </button>
      </div>

      <button
        onClick={handleVerifyOtp}
        disabled={otpVerifying}
        className="btn-primary w-full mt-6"
      >
        {otpVerifying ? 'Verifying...' : 'Verify & Register'}
      </button>
    </div>
  );

  // ── Main render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md">
        {step === 'form' ? renderForm() : renderOtpScreen()}
      </div>
    </div>
  );
};

export default RegisterPage;