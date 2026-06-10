import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import StatCard from '../../shared/components/StatCard.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import Badge from '../../shared/components/Badge.jsx';
import { walletApi } from '../../shared/api/wallet.js';
import { eventsApi } from '../../shared/api/events.js';
import { subscriptionApi } from '../../shared/api/subscription.js';
import { adsApi } from '../../shared/api/ads.js';
import { money } from '../../shared/utils/format.js';

export default function CreatorDashboard() {
  const [wallet, setWallet] = useState(null);
  const [events, setEvents] = useState([]);
  const [sub, setSub] = useState(null);
  const [market, setMarket] = useState([]);

  useEffect(() => {
    walletApi.balance().then(setWallet).catch(() => {});
    eventsApi.list().then(setEvents).catch(() => {});
    subscriptionApi.get().then(setSub).catch(() => {});
    adsApi.marketplace().then((data) => setMarket(data.ads || [])).catch(() => {});
  }, []);

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Create live events, run studio, and earn from sponsored ads."
      actions={<Link className="btn btn-primary btn-sm" to="/creator/events"><i className="fa-solid fa-plus" /> New Event</Link>}
    >
      <div className="stats-grid">
        <StatCard icon="fa-solid fa-wallet"        label="Wallet balance"  value={money(wallet?.balance, wallet?.currency)} note="Creator earnings" />
        <StatCard icon="fa-solid fa-calendar-days" label="Total events"    value={events.length}     note="Created by you" />
        <StatCard icon="fa-solid fa-crown"         label="Current plan"    value={sub?.plan || 'Free'} note={sub?.maxCameras === -1 ? 'Unlimited cameras' : `${sub?.maxCameras || 4} camera limit`} />
        <StatCard icon="fa-solid fa-rectangle-ad"  label="Sponsored ads"   value={market.length}     note="Available in marketplace" />
      </div>

      <div className="grid-2 align-start">
        <Card title="Recent Events" icon="fa-solid fa-tower-broadcast" action={<Link className="card-link" to="/creator/events">View all</Link>}>
          {events.length === 0
            ? <EmptyState title="No events yet" text="Create your first stream event." />
            : (
              <div className="list-stack">
                {events.slice(0, 5).map((ev) => (
                  <Link className="list-row" to={`/creator/events/${ev.id}/studio`} key={ev.id}>
                    <div className="list-row-icon"><i className="fa-solid fa-circle-play" /></div>
                    <div className="list-row-body">
                      <strong>{ev.title}</strong>
                      <small>{ev.code}</small>
                    </div>
                    <Badge tone={ev.isLive ? 'success' : 'neutral'}>{ev.isLive ? 'Live' : 'Draft'}</Badge>
                  </Link>
                ))}
              </div>
            )}
        </Card>

        <Card title="Plan & Limits" icon="fa-solid fa-circle-info">
          <div className="rule-list">
            <p><i className="fa-solid fa-check" /> Free plan supports up to 4 cameras per event.</p>
            <p><i className="fa-solid fa-check" /> Pro plan unlocks unlimited cameras and own ad uploads.</p>
            <p><i className="fa-solid fa-check" /> Sponsored ad earnings are credited after ad completion.</p>
            <p><i className="fa-solid fa-check" /> Free creator payout is reduced per admin commission rate.</p>
          </div>
          <div style={{ marginTop: '18px' }}>
            <Link className="btn btn-secondary btn-sm" to="/creator/subscription">
              <i className="fa-solid fa-crown" /> Manage subscription
            </Link>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
