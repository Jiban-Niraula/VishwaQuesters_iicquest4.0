import { useEffect, useState } from 'react';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import StatCard from '../../shared/components/StatCard.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import { adminApi } from '../../shared/api/admin.js';
import { money } from '../../shared/utils/format.js';

export default function AdminRevenue() {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.revenue().then(setData).catch(() => {}); }, []);

  const totals  = data?.totals || {};
  const monthly = data?.monthlyRevenue || [];

  return (
    <DashboardLayout title="Revenue" subtitle="Commission, subscriptions, deposits, and creator payout tracking.">
      <div className="stats-grid">
        <StatCard icon="fa-solid fa-sack-dollar"          label="Total revenue"    value={money(totals.totalRevenue)}          note="All income streams" />
        <StatCard icon="fa-solid fa-percent"               label="Commission"       value={money(totals.adminCommission)}        note="From ad placements" />
        <StatCard icon="fa-solid fa-crown"                 label="Subscriptions"    value={money(totals.subscriptionRevenue)}    note="Pro plan payments" />
        <StatCard icon="fa-solid fa-hand-holding-dollar"   label="Creator payouts"  value={money(totals.totalCreatorPayouts)}    note="Paid out to creators" />
      </div>

      <div className="grid-2 align-start">
        <Card title="Revenue Summary" icon="fa-solid fa-chart-pie">
          <div className="metric-list">
            <p><span>Admin commission</span>      <strong>{money(totals.adminCommission)}</strong></p>
            <p><span>Subscription revenue</span>  <strong>{money(totals.subscriptionRevenue)}</strong></p>
            <p><span>Total deposited</span>        <strong>{money(totals.totalDeposited)}</strong></p>
            <p><span>Creator payouts</span>        <strong>{money(totals.totalCreatorPayouts)}</strong></p>
            <p><span>Net platform revenue</span>   <strong>{money(totals.totalRevenue)}</strong></p>
          </div>
        </Card>

        <Card title="Monthly Breakdown" icon="fa-solid fa-chart-simple">
          {monthly.length === 0
            ? <EmptyState title="No monthly data" />
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Commission</th>
                      <th>Subscriptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((row) => (
                      <tr key={row.month}>
                        <td><strong>{row.month}</strong></td>
                        <td>{money(row.commission)}</td>
                        <td>{money(row.subscriptions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
