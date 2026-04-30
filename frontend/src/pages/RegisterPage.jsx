import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { handleImgError } from '../components/Layout.jsx';

export default function RegisterPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('on-auth-page');
    return () => document.body.classList.remove('on-auth-page');
  }, []);

  const [form, setForm] = useState({
    username: '', password: '', confirmPassword: '',
    email: '', phone: '', role: 'customer',
    businessName: '', address: '', category: '',
  });
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [busy,    setBusy]    = useState(false);

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setBusy(true);
    try {
      const data = await api.post('/auth/register', form);
      setSuccess(data.message);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-centered auth-centered-register">
      {/* Floating food images */}
      <img className="float-img fc1" src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc2" src="https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc3" src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc4" src="https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc5" src="https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc6" src="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80" onError={handleImgError} alt="" />

      {/* Concentric circle ornament */}
      <svg className="auth-centered-ornament" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="0.5"/>
      </svg>

      <div className="auth-centered-content">
        {/* Brand mark */}
        <div className="auth-centered-brand">
          <svg width="36" height="36" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="30" fill="#c75d2c"/>
            <circle cx="32" cy="32" r="22" fill="none" stroke="#f6f1e8" strokeWidth="1.5" opacity="0.4"/>
            <g fill="#f6f1e8">
              <rect x="18" y="20" width="28" height="4" rx="1"/>
              <path d="M 30 24 L 28 46 L 34 46 L 36 24 Z"/>
              <circle cx="22" cy="14" r="1.5" opacity="0.6"/>
              <circle cx="32" cy="12" r="1.8" opacity="0.85"/>
              <circle cx="42" cy="14" r="1.5" opacity="0.6"/>
            </g>
          </svg>
          <span className="auth-centered-brandname">talabna<span style={{ color: 'var(--accent)' }}>.</span></span>
        </div>

        <div className="auth-centered-eyebrow">
          <span className="dash"></span>
          <span>Join the table</span>
          <span className="dash"></span>
        </div>

        <h1 className="auth-centered-headline auth-centered-headline-sm">
          Become <span className="italic-display">part of it<span className="period">.</span></span>
        </h1>

        {/* Register card */}
        <div className="auth-card auth-card-wide">
          <div className="auth-card-eyebrow">New member</div>
          <h2 className="auth-card-title">Create account.</h2>

          {error   && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>I am a…</label>
              <select value={form.role} onChange={update('role')}>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor / restaurant</option>
                <option value="driver">Delivery driver</option>
              </select>
            </div>
            <div className="row">
              <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                <label>Username</label>
                <input value={form.username} onChange={update('username')} placeholder="6–20 chars" required />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                <label>Phone</label>
                <input value={form.phone} onChange={update('phone')} placeholder="+961…" required />
              </div>
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" required />
            </div>
            <div className="row">
              <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                <label>Password</label>
                <input type="password" value={form.password} onChange={update('password')} placeholder="letters + numbers" required />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                <label>Confirm</label>
                <input type="password" value={form.confirmPassword} onChange={update('confirmPassword')} required />
              </div>
            </div>
            {form.role === 'vendor' && (
              <>
                <div className="form-group">
                  <label>Business name</label>
                  <input value={form.businessName} onChange={update('businessName')} required />
                </div>
                <div className="row">
                  <div className="form-group" style={{ flex: 2, minWidth: 180 }}>
                    <label>Address</label>
                    <input value={form.address} onChange={update('address')} required />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                    <label>Category</label>
                    <input value={form.category} onChange={update('category')} placeholder="Italian, Grocery…" required />
                  </div>
                </div>
              </>
            )}
            <button className="auth-card-submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Create account →'}
            </button>
          </form>

          <p className="auth-card-footer">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>

      {/* Bottom marquee */}
      <div className="auth-centered-marquee">
        <span>· Pizza · Sushi · Lebanese · Bakery · Grocery · Coffee · Desserts · Salads · Burgers · Asian fusion ·</span>
        <span>· Pizza · Sushi · Lebanese · Bakery · Grocery · Coffee · Desserts · Salads · Burgers · Asian fusion ·</span>
      </div>
    </div>
  );
}
