import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { apiError } from '../../shared/api/http.js';
import { useAuth } from './AuthContext.jsx';
import AuthShell from './AuthShell.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(form);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Login to manage your streams">
      {error && <Alert type="error">{error}</Alert>}
      <form onSubmit={submit} className="form-grid">
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <Button loading={loading} icon="fa-solid fa-right-to-bracket">Login</Button>
      </form>
      <p className="auth-foot">Need an account? <Link to="/register">Register as Creator or Company</Link></p>
    </AuthShell>
  );
}
