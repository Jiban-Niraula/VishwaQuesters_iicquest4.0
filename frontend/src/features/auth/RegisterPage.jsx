import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { apiError } from '../../shared/api/http.js';
import { useAuth } from './AuthContext.jsx';
import AuthShell from './AuthShell.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'creator' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(form);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Choose Creator to stream, or Company to advertise on creator streams.">
      {error && <Alert type="error">{error}</Alert>}
      <form onSubmit={submit} className="form-grid">
        <div className="role-choice">
          <button type="button" className={form.role === 'creator' ? 'selected' : ''} onClick={() => setForm({ ...form, role: 'creator' })}>
            <i className="fa-solid fa-tower-broadcast" /> Creator
          </button>
          <button type="button" className={form.role === 'company' ? 'selected' : ''} onClick={() => setForm({ ...form, role: 'company' })}>
            <i className="fa-solid fa-building" /> Company
          </button>
        </div>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Password<input type="password" minLength="8" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <Button loading={loading} icon="fa-solid fa-user-plus">Create account</Button>
      </form>
      <p className="auth-foot">Already registered? <Link to="/login">Login</Link></p>
      <p className="muted small">Admin registration is disabled for security. Admin is created by backend seed.</p>
    </AuthShell>
  );
}
