import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Badge from '../../shared/components/Badge.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import StatCard from '../../shared/components/StatCard.jsx';
import { walletApi } from '../../shared/api/wallet.js';
import { money, dateTime } from '../../shared/utils/format.js';

export default function CreatorWallet() {
  const [wallet, setWallet] = useState(null);
  const [txs, setTxs] = useState([]);

  useEffect(() => {
    walletApi.balance().then(setWallet).catch(() => {});
    walletApi.transactions().then((data) => setTxs(data.transactions || [])).catch(() => {});
  }, []);

  const credits = txs.filter((t) => t.type === 'credit' || t.type === 'deposit').reduce((s, t) => s + Number(t.amount), 0);
  const debits  = txs.filter((t) => t.type !== 'credit' && t.type !== 'deposit').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <DashboardLayout
      title="Wallet"
      subtitle="Track ad earnings, deposits, and transaction history."
      actions={<Link className="btn btn-primary btn-sm" to="/wallet/topup"><i className="fa-solid fa-plus" /> Top up</Link>}
    >
      <div className="stats-grid">
        <StatCard icon="fa-solid fa-wallet"      label="Available balance" value={money(wallet?.balance, wallet?.currency)} note="Ready to use" />
        <StatCard icon="fa-solid fa-arrow-down"  label="Total earned"      value={money(credits, wallet?.currency)}          note="Credits & deposits" />
        <StatCard icon="fa-solid fa-arrow-up"    label="Total spent"       value={money(debits, wallet?.currency)}           note="Payments & fees" />
        <StatCard icon="fa-solid fa-receipt"     label="Transactions"      value={txs.length}                                note="All time" />
      </div>

      <Card title="Transaction History" icon="fa-solid fa-list">
        {txs.length === 0
          ? <EmptyState title="No transactions yet" text="Your earnings and payments will appear here." />
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx) => (
                    <tr key={tx.id}>
                      <td><Badge tone={tx.type === 'credit' || tx.type === 'deposit' ? 'success' : 'warning'}>{tx.type}</Badge></td>
                      <td>{tx.description}</td>
                      <td><strong>{money(tx.amount, wallet?.currency)}</strong></td>
                      <td><small>{dateTime(tx.createdAt)}</small></td>
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
