import { useEffect, useState } from 'react';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { adminApi } from '../../shared/api/admin.js';
import { apiError } from '../../shared/api/http.js';

const EMPTY = { currency: 'NRS', image_ad_charge: 50, video_ad_per_second: 10, admin_commission_percent: 30, free_creator_payout_percent: 50, pro_subscription_price: 999, free_camera_limit: 4 };

function fromApi(s) {
  return {
    currency:                   s.currency                 || 'NRS',
    image_ad_charge:            s.imageAdCharge            ?? 50,
    video_ad_per_second:        s.videoAdPerSecond         ?? 10,
    admin_commission_percent:   s.adminCommissionPercent   ?? 30,
    free_creator_payout_percent: s.freeCreatorPayoutPercent ?? s.freeCreatorPayoutPct ?? 50,
    pro_subscription_price:     s.proSubscriptionPrice     ?? 999,
    free_camera_limit:          s.freeCameraLimit          ?? 4,
  };
}

function Field({ label, hint, children }) {
  return (
    <label>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default function AdminSettings() {
  const [form, setForm]     = useState(EMPTY);
  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminApi.settings()
      .then((data) => setForm(fromApi(data.settings || {})))
      .catch((err) => setError(apiError(err)));
  }, []);

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError(''); setNotice('');
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, k === 'currency' ? v : Number(v)]));
      const data = await adminApi.updateSettings(payload);
      setForm(fromApi(data.settings || {}));
      setNotice('Settings saved successfully.');
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }

  return (
    <DashboardLayout title="Platform Settings" subtitle="Control NRS pricing, commission rates, and creator limits.">
      {error  && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <form onSubmit={submit}>
        <div className="grid-2 align-start">
          <Card title="Ad Pricing" icon="fa-solid fa-rectangle-ad">
            <div className="form-grid">
              <Field label="Currency" hint="Platform-wide currency code">
                <input value={form.currency} onChange={(e) => set('currency', e.target.value)} />
              </Field>
              <Field label="Image ad charge (per placement)" hint="Fixed NRS charge per image ad upload">
                <input type="number" min="0" value={form.image_ad_charge} onChange={(e) => set('image_ad_charge', e.target.value)} />
              </Field>
              <Field label="Video ad charge per second" hint="NRS charged per second of video ad duration">
                <input type="number" min="0" value={form.video_ad_per_second} onChange={(e) => set('video_ad_per_second', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Commission & Payouts" icon="fa-solid fa-percent">
            <div className="form-grid">
              <Field label="Admin commission %" hint="Percentage kept from each ad placement">
                <input type="number" min="0" max="100" value={form.admin_commission_percent} onChange={(e) => set('admin_commission_percent', e.target.value)} />
              </Field>
              <Field label="Free creator payout %" hint="Percentage of pool paid to free plan creators">
                <input type="number" min="0" max="100" value={form.free_creator_payout_percent} onChange={(e) => set('free_creator_payout_percent', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Subscription & Cameras" icon="fa-solid fa-crown">
            <div className="form-grid">
              <Field label="Pro subscription price (NRS)" hint="Amount deducted from creator wallet to upgrade">
                <input type="number" min="0" value={form.pro_subscription_price} onChange={(e) => set('pro_subscription_price', e.target.value)} />
              </Field>
              <Field label="Free plan camera limit" hint="Max cameras allowed for free creators">
                <input type="number" min="1" value={form.free_camera_limit} onChange={(e) => set('free_camera_limit', e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="Save Changes" icon="fa-solid fa-floppy-disk">
            <div className="rule-list" style={{ marginBottom: '18px' }}>
              <p><i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--warning)' }} /> Changes apply immediately to all new transactions.</p>
              <p><i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--warning)' }} /> Existing ad charges are not retroactively updated.</p>
            </div>
            <Button loading={loading} icon="fa-solid fa-floppy-disk">Save all settings</Button>
          </Card>
        </div>
      </form>
    </DashboardLayout>
  );
}
