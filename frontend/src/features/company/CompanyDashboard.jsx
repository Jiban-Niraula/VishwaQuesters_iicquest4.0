import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import StatCard from '../../shared/components/StatCard.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import Badge from '../../shared/components/Badge.jsx';
import { walletApi } from '../../shared/api/wallet.js';
import { adsApi } from '../../shared/api/ads.js';
import { money } from '../../shared/utils/format.js';

export default function CompanyDashboard() {
  const [wallet, setWallet] = useState(null);
  const [ads, setAds] = useState([]);

  useEffect(() => {
    walletApi.balance().then(setWallet).catch(() => {});
    adsApi.mine().then((data) => setAds(data.ads || [])).catch(() => {});
  }, []);

  const approved = ads.filter((ad) => ad.status === 'approved').length;
  const pending = ads.filter((ad) => ad.status === 'pending').length;

  return (
    <DashboardLayout title="Company Dashboard" subtitle="Fund wallet, upload ads, and reach creators." actions={<Link className="btn btn-primary" to="/company/ads/create"><i className="fa-solid fa-plus" /> New ad</Link>}>
      <div className="stats-grid">
        <StatCard icon="fa-solid fa-wallet" label="Wallet balance" value={money(wallet?.balance, wallet?.currency)} note="Used for ad campaigns" />
        <StatCard icon="fa-solid fa-rectangle-ad" label="Total ads" value={ads.length} note="All campaigns" />
        <StatCard icon="fa-solid fa-check-circle" label="Approved" value={approved} note="Available to creators" />
        <StatCard icon="fa-solid fa-hourglass-half" label="Pending" value={pending} note="Waiting admin review" />
      </div>
      <Card title="Recent Ads" icon="fa-solid fa-rectangle-ad" action={<Link to="/company/ads">View all</Link>}>
        {ads.length === 0 ? <EmptyState title="No ads yet" text="Create an image or video campaign to appear in creator studio." /> : <div className="table-wrap"><table><thead><tr><th>Ad</th><th>Status</th><th>Budget</th><th>Plays</th></tr></thead><tbody>{ads.slice(0, 6).map((ad) => <tr key={ad.id}><td><strong>{ad.title}</strong><small>{ad.type}</small></td><td><Badge tone={ad.status === 'approved' ? 'success' : ad.status === 'rejected' ? 'danger' : 'warning'}>{ad.status}</Badge></td><td>{money(ad.remainingBudget)}</td><td>{ad.completedPlays}/{ad.maxPlays}</td></tr>)}</tbody></table></div>}
      </Card>
    </DashboardLayout>
  );
}
