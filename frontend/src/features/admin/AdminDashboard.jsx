import { useEffect, useState } from 'react';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import StatCard from '../../shared/components/StatCard.jsx';
import { adminApi } from '../../shared/api/admin.js';
import { money } from '../../shared/utils/format.js';

export default function AdminDashboard() {
  const [revenue, setRevenue] = useState(null);
  const totals = revenue?.totals || {};
  const counts = revenue?.counts || {};

  useEffect(() => { adminApi.revenue().then(setRevenue).catch(() => {}); }, []);

  return (
    <DashboardLayout title="Dashboard" subtitle="Platform overview — revenue, users, ads, and subscriptions.">
      <div className="stats-grid">
        <StatCard icon="fa-solid fa-sack-dollar"   label="Total revenue"    value={money(totals.totalRevenue)}       note="Commission + subscriptions" />
        <StatCard icon="fa-solid fa-users"          label="Total users"      value={counts.totalUsers || 0}           note={`${counts.totalCreators || 0} creators · ${counts.totalCompanies || 0} companies`} />
        <StatCard icon="fa-solid fa-rectangle-ad"  label="Total ads"        value={counts.totalAds || 0}             note={`${counts.totalAdPlacements || 0} placements`} />
        <StatCard icon="fa-solid fa-crown"         label="Active pro plans" value={counts.activeSubscriptions || 0}  note="Paid creator subscriptions" />
      </div>

      <div className="grid-2 align-start">
        <Card title="Revenue Breakdown" icon="fa-solid fa-chart-line">
          <div className="metric-list">
            <p><span>Admin commission</span>     <strong>{money(totals.adminCommission)}</strong></p>
            <p><span>Subscription revenue</span> <strong>{money(totals.subscriptionRevenue)}</strong></p>
            <p><span>Total deposits</span>        <strong>{money(totals.totalDeposited)}</strong></p>
            <p><span>Creator payouts</span>       <strong>{money(totals.totalCreatorPayouts)}</strong></p>
          </div>
        </Card>

        <Card title="Platform Rules" icon="fa-solid fa-shield-halved">
          <div className="rule-list">
            <p><i className="fa-solid fa-check" /> Public users cannot self-register as admin.</p>
            <p><i className="fa-solid fa-check" /> Company campaigns are charged before approval.</p>
            <p><i className="fa-solid fa-check" /> Rejected campaigns are automatically refunded.</p>
            <p><i className="fa-solid fa-check" /> All NRS pricing is controlled from Settings.</p>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
