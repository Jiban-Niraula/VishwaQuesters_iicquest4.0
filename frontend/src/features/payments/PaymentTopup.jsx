import { useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { paymentsApi } from '../../shared/api/payments.js';
import { apiError } from '../../shared/api/http.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function PaymentTopup() {
  const { user } = useAuth();
  const [amount, setAmount] = useState(1000);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function initiate() {
    setLoading(true); setError(''); setNotice('');
    try {
      const data = await paymentsApi.initiateEsewa({ amount: Number(amount), purpose: 'wallet_topup' });
      if (data.formUrl && data.fields) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.formUrl;
        Object.entries(data.fields).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden'; input.name = key; input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      } else if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setNotice('Payment initiation response received, but no redirect details were returned.');
      }
    } catch (err) {
      setError(`${apiError(err)}. Backend payment endpoint is probably not implemented yet. Use Admin > Wallet Actions for local testing.`);
    } finally { setLoading(false); }
  }

  return (
    <DashboardLayout title="Wallet Top-up" subtitle="eSewa-ready flow. Backend must verify payment before wallet credit." actions={<Link className="btn btn-secondary" to={`/${user?.role}/wallet`}><i className="fa-solid fa-arrow-left" /> Back to wallet</Link>}>
      {error && <Alert type="error">{error}</Alert>}{notice && <Alert type="success">{notice}</Alert>}
      <div className="grid-2 align-start">
        <Card title="Top up with eSewa" icon="fa-solid fa-wallet">
          <div className="form-grid medium-form">
            <label>Amount in NRS<input type="number" min="10" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <Button loading={loading} onClick={initiate} icon="fa-solid fa-credit-card">Continue to eSewa</Button>
          </div>
        </Card>
        <Card title="Security note" icon="fa-solid fa-shield-halved">
          <div className="rule-list"><p><i className="fa-solid fa-check" /> Frontend never credits wallet directly.</p><p><i className="fa-solid fa-check" /> Backend should create signed eSewa request.</p><p><i className="fa-solid fa-check" /> Backend should verify success/IPN before crediting.</p><p><i className="fa-solid fa-check" /> Until backend endpoint exists, use admin manual deposit.</p></div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
