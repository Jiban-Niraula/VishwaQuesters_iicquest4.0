import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { adsApi } from '../../shared/api/ads.js';
import { apiError } from '../../shared/api/http.js';
import { money } from '../../shared/utils/format.js';

export default function CompanyCreateAd() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('upload');
  const [form, setForm] = useState({ title: '', type: 'image', media_url: '', duration_seconds: 0, max_plays: 1 });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const estimated = useMemo(() => {
    const perPlay = form.type === 'video' ? Number(form.duration_seconds || 0) * 10 : 50;
    return perPlay * Number(form.max_plays || 1);
  }, [form]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (mode === 'upload') {
        const fd = new FormData();
        fd.append('title', form.title);
        fd.append('type', form.type);
        fd.append('duration_seconds', form.duration_seconds);
        fd.append('max_plays', form.max_plays);
        fd.append('file', file);
        await adsApi.upload(fd);
      } else {
        await adsApi.create({ ...form, duration_seconds: Number(form.duration_seconds), max_plays: Number(form.max_plays) });
      }
      navigate('/company/ads');
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }

  return (
    <DashboardLayout title="Create Ad" subtitle="Company is charged from wallet based on admin pricing and max plays." actions={<Link className="btn btn-secondary" to="/company/ads"><i className="fa-solid fa-arrow-left" /> Ads</Link>}>
      {error && <Alert type="error">{error}</Alert>}
      <div className="grid-2 align-start">
        <Card title="Ad details" icon="fa-solid fa-rectangle-ad">
          <div className="segmented"><button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>Upload file</button><button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>Use media URL</button></div>
          <form onSubmit={submit} className="form-grid">
            <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
            <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, duration_seconds: e.target.value === 'image' ? 0 : form.duration_seconds })}><option value="image">Image</option><option value="video">Video</option></select></label>
            {form.type === 'video' && <label>Duration seconds<input type="number" min="1" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })} required /></label>}
            <label>Max plays<input type="number" min="1" value={form.max_plays} onChange={(e) => setForm({ ...form, max_plays: e.target.value })} required /></label>
            {mode === 'upload' ? <label>Media file<input type="file" accept={form.type === 'image' ? 'image/*' : 'video/*'} onChange={(e) => setFile(e.target.files?.[0])} required /></label> : <label>Media URL<input value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} required /></label>}
            <Button loading={loading} icon="fa-solid fa-paper-plane">Submit for approval</Button>
          </form>
        </Card>
        <Card title="Estimated charge" icon="fa-solid fa-calculator">
          <div className="estimate-box"><strong>{money(estimated)}</strong><p>This uses frontend default estimate: image NRS 50, video NRS 10/sec. Final pricing is calculated by backend admin settings.</p></div>
          <div className="rule-list"><p><i className="fa-solid fa-check" /> Amount is deducted from company wallet.</p><p><i className="fa-solid fa-check" /> Admin commission is credited immediately.</p><p><i className="fa-solid fa-check" /> Creator payout pool is reserved by max plays.</p><p><i className="fa-solid fa-check" /> Creators earn only after ad completion.</p></div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
