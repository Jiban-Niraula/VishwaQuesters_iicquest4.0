import { useEffect, useState } from 'react';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Badge from '../../shared/components/Badge.jsx';
import Button from '../../shared/components/Button.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { adminApi } from '../../shared/api/admin.js';
import { apiError } from '../../shared/api/http.js';
import { money, dateTime } from '../../shared/utils/format.js';

const STATUS_TONE = { approved: 'success', rejected: 'danger', completed: 'neutral', pending: 'warning' };

export default function AdminAds() {
  const [status, setStatus] = useState('');
  const [ads, setAds] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(s = status) {
    try { const data = await adminApi.ads(s || undefined); setAds(data.ads || []); }
    catch (err) { setError(apiError(err)); }
  }

  useEffect(() => { load(''); }, []);

  async function update(id, next) {
    setError(''); setNotice('');
    try { const data = await adminApi.updateAdStatus(id, next); setNotice(data.message || 'Updated'); await load(); }
    catch (err) { setError(apiError(err)); }
  }

  return (
    <DashboardLayout title="Ad Approvals" subtitle="Review and approve or reject company campaigns.">
      {error  && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <Card
        title="Campaigns"
        icon="fa-solid fa-rectangle-ad"
        action={
          <select value={status} onChange={(e) => { setStatus(e.target.value); load(e.target.value); }} style={{ width: 'auto' }}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
          </select>
        }
      >
        {ads.length === 0
          ? <EmptyState title="No ads found" text="Campaigns will appear here once companies submit them." />
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Company</th>
                    <th>Status</th>
                    <th>Charge</th>
                    <th>Budget left</th>
                    <th>Plays</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <tr key={ad.id}>
                      <td>
                        <strong>{ad.title}</strong>
                        <small>{ad.type}{ad.durationSeconds ? ` · ${ad.durationSeconds}s` : ''}</small>
                      </td>
                      <td>{ad.company?.name || ad.companyId}</td>
                      <td><Badge tone={STATUS_TONE[ad.status] || 'neutral'}>{ad.status}</Badge></td>
                      <td>{money(ad.chargeAmount)}</td>
                      <td>{money(ad.remainingBudget)}</td>
                      <td><span style={{ color: 'var(--muted)' }}>{ad.completedPlays}</span> / {ad.maxPlays}</td>
                      <td><small>{dateTime(ad.createdAt)}</small></td>
                      <td>
                        {ad.status === 'pending' && (
                          <div className="table-actions">
                            <Button size="sm" variant="success" onClick={() => update(ad.id, 'approved')}>Approve</Button>
                            <Button size="sm" variant="danger"  onClick={() => update(ad.id, 'rejected')}>Reject</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </DashboardLayout>
  );
}
