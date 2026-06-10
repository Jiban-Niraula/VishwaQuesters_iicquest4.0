import { useEffect, useState } from 'react';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import StatCard from '../../shared/components/StatCard.jsx';
import { adminApi } from '../../shared/api/admin.js';
import { apiError } from '../../shared/api/http.js';
import { money } from '../../shared/utils/format.js';

export default function AdminWalletActions() {
  const [users, setUsers]   = useState([]);
  const [form, setForm]     = useState({ user_id: '', amount: '', reason: 'Test wallet deposit' });
  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => { adminApi.users().then((data) => setUsers(data.users || [])).catch(() => {}); }, []);

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError(''); setNotice('');
    try {
      const data = await adminApi.deposit({ user_id: Number(form.user_id), amount: Number(form.amount), reason: form.reason });
      setNotice(data.message || 'Deposit successful');
      setLastResult({ name: users.find((u) => u.id === Number(form.user_id))?.name, amount: form.amount, balance: data.newBalance });
      setForm({ user_id: '', amount: '', reason: 'Test wallet deposit' });
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }

  const nonAdmins = users.filter((u) => u.role !== 'admin');

  return (
    <DashboardLayout title="Wallet Actions" subtitle="Manually deposit balance into user wallets for testing or support.">
      {error  && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="grid-2 align-start">
        <Card title="Manual Deposit" icon="fa-solid fa-money-bill-transfer">
          <form onSubmit={submit} className="form-grid">
            <label>
              Select user
              <select value={form.user_id} onChange={(e) => set('user_id', e.target.value)} required>
                <option value="">Choose a user…</option>
                {nonAdmins.map((u) => (
                  <option value={u.id} key={u.id}>{u.name} ({u.role}) — {u.email}</option>
                ))}
              </select>
            </label>
            <label>
              Amount (NRS)
              <input type="number" min="1" value={form.amount} onChange={(e) => set('amount', e.target.value)} required placeholder="e.g. 500" />
            </label>
            <label>
              Reason
              <input value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Reason for deposit" />
            </label>
            <Button loading={loading} icon="fa-solid fa-plus">Deposit balance</Button>
          </form>
        </Card>

        <div className="dashboard-side-stack">
          {lastResult && (
            <Card title="Last Transaction" icon="fa-solid fa-check-circle">
              <div className="metric-list">
                <p><span>User</span>        <strong>{lastResult.name}</strong></p>
                <p><span>Deposited</span>   <strong>{money(lastResult.amount)}</strong></p>
                <p><span>New balance</span> <strong>{money(lastResult.balance)}</strong></p>
              </div>
            </Card>
          )}
          <Card title="About Wallet Actions" icon="fa-solid fa-circle-info">
            <div className="rule-list">
              <p><i className="fa-solid fa-check" /> Used for testing payment flows before gateway integration.</p>
              <p><i className="fa-solid fa-check" /> Deposits are credited instantly to the user's wallet.</p>
              <p><i className="fa-solid fa-check" /> Admin wallets are excluded from this action.</p>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
