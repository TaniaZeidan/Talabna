import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { handleImgError } from '../components/Layout.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  // Add body class so we can hide the navbar via CSS, then clean up on unmount
  useEffect(() => {
    document.body.classList.add('on-auth-page');
    return () => document.body.classList.remove('on-auth-page');
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const u = await login(username, password);
      const dest =
        u.role === 'admin'    ? '/admin'    :
        u.role === 'vendor'   ? '/vendor'   :
        u.role === 'driver'   ? '/driver'   : '/customer';
      navigate(dest);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-centered">
      {/* Floating food images scattered around */}
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

      {/* Content stack */}
      <div className="auth-centered-content">
        {/* Top: brand mark */}
        <div className="auth-centered-brand">
          <svg width="40" height="40" viewBox="0 0 64 64">
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

        {/* Headline */}
        <div className="auth-centered-eyebrow">
          <span className="dash"></span>
          <span>Talabna · طلبنا · est. 2026</span>
          <span className="dash"></span>
        </div>

        <h1 className="auth-centered-headline">
          Food on its <span className="italic-display">way<span className="period">.</span></span>
        </h1>

        <p className="auth-centered-tagline">
          A Lebanese-built delivery platform connecting <em>local kitchens</em>, <em>independent grocers</em>, and the <em>hungry humans</em> they serve.
        </p>

        {/* Login card */}
        <div className="auth-card">
          <div className="auth-card-eyebrow">Returning member</div>
          <h2 className="auth-card-title">Welcome back.</h2>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="your username" required autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <button className="auth-card-submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <p className="auth-card-footer" style={{ marginBottom: 8 }}>
            <Link to="/forgot-password" style={{ color: 'rgba(246, 241, 232, .55)' }}>Forgot password?</Link>
          </p>
          <p className="auth-card-footer">
            New here? <Link to="/register">Create an account</Link>
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
