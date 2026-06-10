import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Badge from '../../shared/components/Badge.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import StatCard from '../../shared/components/StatCard.jsx';
import { walletApi } from '../../shared/api/wallet.js';
import { money, dateTime } from '../../shared/utils/format.js';

export default function CompanyWallet() {
  const [wallet, setWallet] = useState(null);
  const [txs, setTxs] = useState([]);
  useEffect(() => { walletApi.balance().then(setWallet).catch(() => {}); walletApi.transactions().then((data) => setTxs(data.transactions || [])).catch(() => {}); }, []);
  return (
    <DashboardLayout title="Company Wallet" subtitle="Balance is used when creating ad campaigns." actions={<Link className="btn btn-secondary" to="/wallet/topup"><i className="fa-solid fa-plus" /> Top up</Link>}>
      <div className="stats-grid one"><StatCard icon="fa-solid fa-wallet" label="Available balance" value={money(wallet?.balance, wallet?.currency)} note="Use admin manual deposit until eSewa backend is complete" /></div>
      <Card title="Transactions" icon="fa-solid fa-list">
        {txs.length === 0 ? <EmptyState title="No transactions" /> : <div className="table-wrap"><table><thead><tr><th>Type</th><th>Description</th><th>Amount</th><th>Date</th></tr></thead><tbody>{txs.map((tx) => <tr key={tx.id}><td><Badge tone={tx.type === 'deposit' ? 'success' : 'warning'}>{tx.type}</Badge></td><td>{tx.description}</td><td>{money(tx.amount, wallet?.currency)}</td><td>{dateTime(tx.createdAt)}</td></tr>)}</tbody></table></div>}
      </Card>
    </DashboardLayout>
  );
}
