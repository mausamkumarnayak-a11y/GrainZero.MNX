import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import './AuthPage.css';

export default function AuthPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [tab,          setTab]          = useState('login');   // 'login' | 'signup'
  const [role,         setRole]         = useState('student'); // 'student' | 'admin'
  const [form,         setForm]         = useState({ name: '', email: '', password: '', adminCode: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [loading,      setLoading]      = useState(false);

  function handleTab(t) {
    setTab(t);
    setError('');
    setSuccess('');
  }

  function handleRole(r) {
    setRole(r);
    setError('');
  }

  function set(k) {
    return (e) => {
      setForm(f => ({ ...f, [k]: e.target.value }));
      setError('');
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (tab === 'login') {
        const { data } = await api.post('/auth/login', {
          email: form.email,
          password: form.password
        });
        login(data.token, data.user);
        navigate(data.user.role === 'admin' ? '/admin' : '/student', { replace: true });
      } else {
        const payload = {
          name: form.name,
          email: form.email,
          password: form.password,
          role,
          ...(role === 'admin' ? { adminCode: form.adminCode } : {})
        };
        const { data } = await api.post('/auth/signup', payload);
        login(data.token, data.user);
        navigate(data.user.role === 'admin' ? '/admin' : '/student', { replace: true });
      }
    } catch (err) {
      // Show server's actual error message if returned, else show friendly network error
      const serverMsg = typeof err.response?.data?.error === 'string' ? err.response.data.error : null;
      let errorMsg = serverMsg;
      if (!errorMsg) {
        if (err.response?.status === 500) {
          errorMsg = 'Backend server error (500). Please ensure backend is running on port 3001.';
        } else if (err.code === 'ERR_NETWORK' || !err.response) {
          errorMsg = 'Cannot reach backend server. Please check if the server is running on port 3001.';
        } else {
          errorMsg = err.message || 'Unable to connect to server. Please try again.';
        }
      }
      setError(errorMsg);
      console.error('Auth submit error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        {/* Logo */}
        <div className="auth-logo-wrap">
          <img src="/grainzero-logo.png" alt="GrainZero" className="auth-logo" />
        </div>

        <p className="auth-tagline">Make every grain count</p>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => handleTab('login')}
          >
            Log In
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => handleTab('signup')}
          >
            Sign Up
          </button>
        </div>

        {/* Role toggle (signup only) */}
        {tab === 'signup' && (
          <div className="role-toggle">
            <button
              type="button"
              className={`role-btn ${role === 'student' ? 'active' : ''}`}
              onClick={() => handleRole('student')}
            >
              🎓 Student
            </button>
            <button
              type="button"
              className={`role-btn ${role === 'admin' ? 'active' : ''}`}
              onClick={() => handleRole('admin')}
            >
              🛡️ Authority
            </button>
          </div>
        )}

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {tab === 'signup' && (
            <div className="field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="Your full name"
                value={form.name}
                onChange={set('name')}
                required
              />
            </div>
          )}

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={form.email}
              onChange={set('email')}
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={tab === 'signup' ? 'Minimum 6 characters' : 'Your password'}
                value={form.password}
                onChange={set('password')}
                required
              />
            </div>
            {/* Eye toggle below password box */}
            <div className="password-eye-toggle-container">
              <button
                type="button"
                className="password-eye-toggle"
                onClick={() => setShowPassword(prev => !prev)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="eye-icon" aria-hidden="true">
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </span>
                <span className="eye-label">
                  {showPassword ? 'Hide password' : 'Show password'}
                </span>
              </button>
            </div>
          </div>

          {tab === 'signup' && role === 'admin' && (
            <div className="field">
              <label>Authority Access Code</label>
              <input
                type="password"
                placeholder="Enter the authority code"
                value={form.adminCode}
                onChange={set('adminCode')}
                required
              />
            </div>
          )}

          {error   && <p className="alert alert-error">{error}</p>}
          {success && <p className="alert alert-success">{success}</p>}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait…'
              : tab === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <p className="auth-switch">
          {tab === 'login'
            ? <>No account? <button type="button" className="link-btn" onClick={() => handleTab('signup')}>Sign up</button></>
            : <>Have an account? <button type="button" className="link-btn" onClick={() => handleTab('login')}>Log in</button></>
          }
        </p>

        {/* Demo Quick-Fill Box */}
        <div className="demo-fill-box" style={{
          marginTop: '1.25rem',
          padding: '0.85rem 1rem',
          background: 'var(--green-50, #f0fdf4)',
          border: '1px solid var(--green-200, #bbf7d0)',
          borderRadius: '8px',
          fontSize: '0.82rem'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--green-800, #166534)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span>⚡</span> Try the Demo
          </div>
          <p style={{ margin: '0 0 0.5rem 0', color: '#4b5563', fontSize: '0.78rem' }}>
            Click below to auto-fill sample credentials (Password: <code>Demo@1234</code>):
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setForm(prev => ({ ...prev, email: 'student1@demo.grainzero.com', password: 'Demo@1234' }));
                setError('');
              }}
              style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                background: '#fff',
                border: '1px solid var(--green-600, #16a34a)',
                color: 'var(--green-800, #166534)',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              🎓 Student Demo
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setForm(prev => ({ ...prev, email: 'admin@demo.grainzero.com', password: 'Demo@1234' }));
                setError('');
              }}
              style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                background: '#fff',
                border: '1px solid #2563eb',
                color: '#1e40af',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              🛡️ Admin Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
