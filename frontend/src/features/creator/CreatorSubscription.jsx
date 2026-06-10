import { useEffect, useState } from 'react';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import Badge from '../../shared/components/Badge.jsx';
import { subscriptionApi } from '../../shared/api/subscription.js';
import { apiError } from '../../shared/api/http.js';
import { compactDate } from '../../shared/utils/format.js';

const FREE_FEATURES  = ['Up to 4 cameras per event', 'Play sponsored ads', 'Earn from ad placements', 'Reduced payout rate'];
const PRO_FEATURES   = ['Unlimited cameras', 'Full sponsored ad payout', 'Upload your own ads', 'Priority marketplace placement'];

export default function CreatorSubscription() {
  const [sub, setSub] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    try { setSub(await subscriptionApi.get()); } catch (err) { setError(apiError(err)); }
  }

  useEffect(() => { load(); }, []);

  async function upgrade() {
    setLoading(true); setError(''); setSuccess('');
    try {
      const data = await subscriptionApi.upgrade();
      setSuccess(data.message || 'Subscription upgraded');
      await load();
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }

  const isPro = sub?.plan === 'pro';

  return (
    <DashboardLayout title="Subscription" subtitle="Manage your plan and unlock more production features.">
      {error   && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      <div className="vc-plan-grid">
        <article className={`vc-sub-card${!isPro ? ' current' : ''}`}>
          <div className="vc-sub-card-head">
            <div className="vc-sub-icon"><i className="fa-solid fa-seedling" /></div>
            <Badge tone={!isPro ? 'success' : 'neutral'}>{!isPro ? 'Current plan' : 'Available'}</Badge>
          </div>
          <h3>Free</h3>
          <div className="vc-sub-price">NRS 0 <span>/ forever</span></div>
          <p>For creators starting out with simple multi-camera streams.</p>
          <ul className="vc-sub-features">
            {FREE_FEATURES.map((f) => (
              <li key={f}><i className="fa-solid fa-check" />{f}</li>
            ))}
          </ul>
        </article>

        <article className={`vc-sub-card${isPro ? ' current' : ' highlight'}`}>
          <div className="vc-sub-card-head">
            <div className="vc-sub-icon pro"><i className="fa-solid fa-crown" /></div>
            <Badge tone={isPro ? 'success' : 'warning'}>{isPro ? 'Current plan' : 'Recommended'}</Badge>
          </div>
          <h3>Pro</h3>
          <div className="vc-sub-price">Admin priced <span>/ period</span></div>
          <p>For serious creators who need unlimited cameras and full ad control.</p>
          <ul className="vc-sub-features">
            {PRO_FEATURES.map((f) => (
              <li key={f}><i className="fa-solid fa-check" />{f}</li>
            ))}
          </ul>
          {isPro && sub?.expiresAt && (
            <p className="vc-sub-expires"><i className="fa-regular fa-clock" /> Expires {compactDate(sub.expiresAt)}</p>
          )}
          {!isPro && (
            <Button loading={loading} onClick={upgrade} icon="fa-solid fa-crown" className="vc-sub-btn">
              Upgrade with wallet
            </Button>
          )}
        </article>
      </div>
    </DashboardLayout>
  );
}
