import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { handleImgError } from '../components/Layout.jsx';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('on-auth-page');
    return () => document.body.classList.remove('on-auth-page');
  }, []);

  const [step, setStep] = useState(1); // 1 = request code, 2 = confirm
  const [form, setForm] = useState({
    username: '', email: '',
    code: '', newPassword: '', confirmPassword: '',
  });
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [busy,    setBusy]    = useState(false);

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function requestCode(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setBusy(true);
    try {
      const data = await api.post('/auth/reset-password/request', {
        username: form.username,
        email: form.email,
      });
      setSuccess(data.message);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function confirmReset(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setBusy(true);
    try {
      const data = await api.post('/auth/reset-password/confirm', form);
      setSuccess(data.message);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function resendCode() {
    setError(''); setSuccess(''); setBusy(true);
    try {
      await api.post('/auth/reset-password/request', {
        username: form.username,
        email: form.email,
      });
      setSuccess('A new code has been sent to your email.');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-centered">
      <img className="float-img fc1" src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc2" src="https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc3" src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc4" src="https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc5" src="https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80" onError={handleImgError} alt="" />
      <img className="float-img fc6" src="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80" onError={handleImgError} alt="" />

      <svg className="auth-centered-ornament" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="100" cy="100" r="40" fill="none" stroke="currentColor" strokeWidth="0.5"/>
      </svg>

      <div className="auth-centered-content">
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
          <span>Account recovery · Step {step} of 2</span>
          <span className="dash"></span>
        </div>

        <h1 className="auth-centered-headline auth-centered-headline-sm">
          Reset <span className="italic-display">password<span className="period">.</span></span>
        </h1>

        <div className="auth-card">
          {step === 1 && (
            <>
              <div className="auth-card-eyebrow">Step 1 · Verify identity</div>
              <h2 className="auth-card-title">Forgot password</h2>
              <p style={{ color: 'rgba(246, 241, 232, .55)', fontSize: 13, textAlign: 'center', margin: '0 0 18px' }}>
                Enter your username and email. We'll send a 6-digit verification code to your inbox.
              </p>

              {error   && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}

              <form onSubmit={requestCode}>
                <div className="form-group">
                  <label>Username</label>
                  <input value={form.username} onChange={update('username')} required autoFocus />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={update('email')} required />
                </div>
                <button className="auth-card-submit" disabled={busy}>
                  {busy ? 'Sending code…' : 'Send verification code →'}
                </button>
              </form>

              <p className="auth-card-footer">
                Remembered? <Link to="/login">Sign in</Link>
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="auth-card-eyebrow">Step 2 · Set new password</div>
              <h2 className="auth-card-title">Check your email</h2>
              <p style={{ color: 'rgba(246, 241, 232, .55)', fontSize: 13, textAlign: 'center', margin: '0 0 18px' }}>
                We sent a 6-digit code to <strong style={{ color: 'var(--accent-soft)' }}>{form.email}</strong>.
                It expires in 15 minutes.
              </p>

              {error   && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}

              <form onSubmit={confirmReset}>
                <div className="form-group">
                  <label>Verification code</label>
                  <input
                    value={form.code}
                    onChange={update('code')}
                    placeholder="6-digit code"
                    maxLength={6}
                    pattern="\d{6}"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    autoFocus
                    style={{ letterSpacing: '0.4em', fontFamily: 'var(--font-mono)', fontSize: 18, textAlign: 'center' }}
                  />
                </div>
                <div className="form-group">
                  <label>New password (6–20, letters + numbers)</label>
                  <input type="password" value={form.newPassword} onChange={update('newPassword')} required />
                </div>
                <div className="form-group">
                  <label>Confirm new password</label>
                  <input type="password" value={form.confirmPassword} onChange={update('confirmPassword')} required />
                </div>
                <button className="auth-card-submit" disabled={busy}>
                  {busy ? 'Resetting…' : 'Reset password →'}
                </button>
              </form>

              <p className="auth-card-footer" style={{ marginBottom: 6 }}>
                Didn't get the email? <button type="button" onClick={resendCode} disabled={busy}
                  style={{ background: 'transparent', border: 0, color: 'var(--accent-soft)', cursor: 'pointer', fontWeight: 500, fontSize: 13, padding: 0, fontFamily: 'inherit' }}>
                  Resend code
                </button>
              </p>
              <p className="auth-card-footer">
                <button type="button" onClick={() => { setStep(1); setError(''); setSuccess(''); }}
                  style={{ background: 'transparent', border: 0, color: 'rgba(246, 241, 232, .55)', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>
                  ← Use a different account
                </button>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="auth-centered-marquee">
        <span>· Pizza · Sushi · Lebanese · Bakery · Grocery · Coffee · Desserts · Salads · Burgers · Asian fusion ·</span>
        <span>· Pizza · Sushi · Lebanese · Bakery · Grocery · Coffee · Desserts · Salads · Burgers · Asian fusion ·</span>
      </div>
    </div>
  );
}
