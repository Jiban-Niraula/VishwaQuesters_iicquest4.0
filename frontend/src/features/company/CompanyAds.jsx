import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Badge from '../../shared/components/Badge.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import { adsApi } from '../../shared/api/ads.js';
import { money, dateTime } from '../../shared/utils/format.js';

export default function CompanyAds() {
  const [ads, setAds] = useState([]);
  useEffect(() => { adsApi.mine().then((data) => setAds(data.ads || [])).catch(() => {}); }, []);

  return (
    <DashboardLayout title="Company Ads" subtitle="Review campaign charge, remaining budget, and approval status." actions={<Link className="btn btn-primary" to="/company/ads/create"><i className="fa-solid fa-plus" /> Create ad</Link>}>
      <Card title="Campaigns" icon="fa-solid fa-rectangle-ad">
        {ads.length === 0 ? <EmptyState title="No campaigns" /> : <div className="table-wrap"><table><thead><tr><th>Ad</th><th>Status</th><th>Charge</th><th>Remaining pool</th><th>Plays</th><th>Created</th></tr></thead><tbody>{ads.map((ad) => <tr key={ad.id}><td><strong>{ad.title}</strong><small>{ad.type} {ad.durationSeconds ? `• ${ad.durationSeconds}s` : ''}</small></td><td><Badge tone={ad.status === 'approved' ? 'success' : ad.status === 'rejected' ? 'danger' : ad.status === 'completed' ? 'neutral' : 'warning'}>{ad.status}</Badge></td><td>{money(ad.chargeAmount)}</td><td>{money(ad.remainingBudget)}</td><td>{ad.completedPlays}/{ad.maxPlays}</td><td>{dateTime(ad.createdAt)}</td></tr>)}</tbody></table></div>}
      </Card>
    </DashboardLayout>
  );
}
