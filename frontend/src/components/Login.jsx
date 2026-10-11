import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

export default function Login({ onLogin, embedded, onShowRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`HTTP ${r.status}: ${txt}`);
      }
      const j = await r.json();
      const user = {
        username: j.username,
        role: j.role,
        token: j.access_token,
        fullName: j.full_name || null,
        email: j.email || null,
      };
      try {
        localStorage.setItem('recloser_user', JSON.stringify(user));
      } catch (_) {}
      onLogin(user);
    } catch (e) {
      setError(e?.message?.includes('HTTP 401') ? 'Username atau password salah.' : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/google/init`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.detail || data.message || 'Gagal memulai login Google');
      }
      // Redirect browser to Google OAuth URL
      window.location.href = data.url;
    } catch (e) {
      setGoogleError(String(e.message || e));
      setGoogleLoading(false);
    }
  };

  const inputStyle = (id) => ({
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 'var(--radius-md)',
    fontSize: 14,
    fontFamily: 'inherit',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    boxSizing: 'border-box',
    transition: 'border-color 120ms, box-shadow 120ms',
    outline: 'none',
  });
  const handleFocus = (e) => {
    e.target.style.borderColor = 'var(--color-blue-accent)';
    e.target.style.boxShadow = '0 0 0 3px var(--color-blue-pale)';
  };
  const handleBlur = (e) => {
    e.target.style.borderColor = 'var(--color-border-strong)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="error" style={{ marginBottom: 12 }}>{error}</div>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor="login-username">Username</label>
        <input
          id="login-username"
          type="text"
          required
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          style={inputStyle('username')}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={inputStyle('password')}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting}
        style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 15 }}
      >
        {submitting ? 'Memverifikasi…' : 'Login'}
      </button>

      {/* Divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        margin: 'var(--space-4) 0',
        color: 'var(--color-text-subtle)',
        fontSize: 12,
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        <span>atau</span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>

      {/* Google Sign-In */}
      <button
        type="button"
        className="btn btn-google"
        disabled={googleLoading}
        onClick={handleGoogleLogin}
        style={{
          width: '100%',
          justifyContent: 'center',
          padding: '10px 16px',
          fontSize: 14,
          background: '#ffffff',
          color: '#3C4043',
          border: '1px solid #dadce0',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: googleLoading ? 'not-allowed' : 'pointer',
          opacity: googleLoading ? 0.7 : 1,
          fontFamily: "'Google Sans', Roboto, sans-serif",
          fontWeight: 500,
        }}
      >
        <GoogleIcon />
        {googleLoading ? 'Menghubungi Google…' : 'Lanjutkan dengan Google'}
      </button>

      {googleError && (
        <div className="error" style={{ marginTop: 8, fontSize: 12 }}>{googleError}</div>
      )}

      {!embedded && (
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-subtle)', textAlign: 'center' }}>
          Default: <code>admin</code> / <code>admin123</code> (Admin)
        </p>
      )}

      {embedded && (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--color-text-subtle)', textAlign: 'center' }}>
          Belum punya akun?{' '}
          <button
            type="button"
            onClick={onShowRegister}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-blue-accent)',
              cursor: 'pointer',
              fontSize: 13,
              padding: 0,
              textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            Daftar akun baru
          </button>
        </p>
      )}
    </form>
  );
}
