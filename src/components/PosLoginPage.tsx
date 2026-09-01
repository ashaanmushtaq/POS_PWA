import { useState, type FormEvent } from 'react';
import { signIn } from '../lib/auth';
import './PosLoginPage.css';

interface PosLoginPageProps {
  onSuccess: () => void;
}

export function PosLoginPage({ onSuccess }: PosLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(
        msg === 'Invalid login credentials'
          ? 'Incorrect email or password. Please try again.'
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pos-login-root">
      {/* Ambient orbs */}
      <div className="pos-login-orb pos-login-orb--1" />
      <div className="pos-login-orb pos-login-orb--2" />
      <div className="pos-login-orb pos-login-orb--3" />

      <div className="pos-login-card" role="main">
        {/* Brand */}
        <div className="pos-login-brand">
          <div className="pos-login-logo" aria-hidden="true">👑</div>
          <div>
            <h1 className="pos-login-brand-name">UB Collection POS</h1>
            <p className="pos-login-brand-tagline">Wholesale Counter · Garments ERP</p>
          </div>
        </div>

        <div className="pos-login-divider" />

        {/* Form */}
        <form id="pos-login-form" onSubmit={handleSubmit} noValidate>
          <h2 className="pos-login-heading">Staff Sign In</h2>
          <p className="pos-login-subheading">
            Sign in to open the POS counter and process wholesale orders.
          </p>

          {error && (
            <div className="pos-login-error" role="alert" id="pos-login-error-msg">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="#f87171" strokeWidth="1.5" />
                <path d="M8 5v4M8 11v0.5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {error}
            </div>
          )}

          {/* Email field */}
          <div className="pos-login-field">
            <label htmlFor="pos-login-email" className="pos-login-label">Email Address</label>
            <div className="pos-login-input-wrap">
              <span className="pos-login-input-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M1.5 5.5L8 9.5L14.5 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              </span>
              <input
                id="pos-login-email"
                type="email"
                className="pos-login-input"
                placeholder="staff@ubcollection.pk"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
                aria-describedby={error ? 'pos-login-error-msg' : undefined}
              />
            </div>
          </div>

          {/* Password field */}
          <div className="pos-login-field">
            <label htmlFor="pos-login-password" className="pos-login-label">Password</label>
            <div className="pos-login-input-wrap">
              <span className="pos-login-input-icon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M5 7V5a3 3 0 116 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
              </span>
              <input
                id="pos-login-password"
                type={showPassword ? 'text' : 'password'}
                className="pos-login-input pos-login-input--with-action"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
              <button
                type="button"
                id="pos-login-toggle-pw"
                className="pos-login-input-action"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.25" />
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.25" />
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            id="pos-login-submit"
            type="submit"
            className="pos-login-btn"
            disabled={loading || !email || !password}
          >
            {loading ? (
              <>
                <span className="pos-login-spinner" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              '🔐 Open POS Counter'
            )}
          </button>
        </form>

        <div className="pos-login-counter-badge">
          🏪 Wholesale Bulk Order Counter — Gents Suits Business
        </div>

        <p className="pos-login-footer">
          UB Collection Wholesale ERP · Multi-Tenant Garments Management
        </p>
      </div>
    </div>
  );
}
