import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export default function Register({ onLogin, onCancel }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Nama lengkap minimal 2 karakter');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Format email tidak valid');
      return;
    }
    if (!username.trim() || username.trim().length < 3) {
      setError('Username minimal 3 karakter');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username.trim())) {
      setError('Username hanya boleh huruf, angka, titik, underscore, dan strip');
      return;
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak cocok');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', username.trim());
      formData.append('password', password);
      formData.append('confirm_password', confirmPassword);
      formData.append('full_name', fullName.trim());
      formData.append('email', email.trim().toLowerCase());

      const r = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const txt = await r.text();
      let data;
      try { data = JSON.parse(txt); } catch { data = {}; }

      if (!r.ok) {
        const msg = data.detail || data.message || txt || 'Registrasi gagal';
        setError(msg);
        return;
      }

      const user = {
        username: data.username,
        role: data.role,
        token: data.access_token,
        fullName: data.full_name || fullName.trim(),
        email: data.email || email.trim().toLowerCase(),
      };
      try {
        localStorage.setItem('recloser_user', JSON.stringify(user));
      } catch (_) {}
      onLogin(user);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSubmitting(false);
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
        <label className="form-label" htmlFor="reg-name">Nama Lengkap</label>
        <input
          id="reg-name"
          type="text"
          required
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          style={inputStyle('name')}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="reg-email">Email</label>
        <input
          id="reg-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          style={inputStyle('email')}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="reg-username">Username</label>
        <input
          id="reg-username"
          type="text"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          style={inputStyle('username')}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="reg-password">Password</label>
        <input
          id="reg-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          style={inputStyle('password')}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="reg-confirm">Konfirmasi Password</label>
        <input
          id="reg-confirm"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          style={inputStyle('confirm')}
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
        {submitting ? 'Mendaftar…' : 'Daftar Akun'}
      </button>

      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--color-text-subtle)' }}>
        Sudah punya akun?{' '}
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-blue-accent)',
            cursor: 'pointer',
            fontSize: 13,
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          Login
        </button>
      </div>
    </form>
  );
}
