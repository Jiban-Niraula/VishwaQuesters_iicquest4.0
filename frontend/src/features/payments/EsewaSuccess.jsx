import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PublicLayout from '../../shared/layout/PublicLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { paymentsApi } from '../../shared/api/payments.js';
import { apiError } from '../../shared/api/http.js';
import { authStorage } from '../../shared/utils/storage.js';
import { money } from '../../shared/utils/format.js';

export default function EsewaSuccess() {
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState(null);
  const token = authStorage.getToken();
  const data = params.get('data');

  useEffect(() => {
    let mounted = true;
    async function verify() {
      if (!token) {
        setError('Login token not found. Please login again and check your wallet transactions.');
        setLoading(false);
        return;
      }
      if (!data) {
        setError('eSewa did not return verification data. Please check payment status from your wallet.');
        setLoading(false);
        return;
      }
      try {
        const result = await paymentsApi.verifyEsewa({ data });
        if (!mounted) return;
        setPayment(result.payment || null);
      } catch (err) {
        if (!mounted) return;
        setError(apiError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    verify();
    return () => { mounted = false; };
  }, [data, token]);

  const role = authStorage.getUser()?.role || 'creator';
  const walletPath = role === 'company' ? '/company/wallet' : role === 'admin' ? '/admin/dashboard' : '/creator/wallet';

  return (
    <PublicLayout>
      <div className="public-page narrow">
        <Card title="eSewa payment verification" subtitle="Wallet balance updates only after backend verification." icon="fa-solid fa-circle-check">
          {loading && <div className="loading-line"><i className="fa-solid fa-spinner fa-spin" /> Verifying payment with backend...</div>}
          {!loading && error && <Alert type="error">{error}</Alert>}
          {!loading && payment && (
            <div className="rule-list">
              <p><i className="fa-solid fa-check" /> Status: <strong>{payment.status}</strong></p>
              <p><i className="fa-solid fa-receipt" /> Reference: {payment.paymentRef}</p>
              <p><i className="fa-solid fa-wallet" /> Amount: {money(payment.amount, payment.currency)}</p>
            </div>
          )}
          <div className="button-row">
            <Link className="btn btn-primary" to={walletPath}><i className="fa-solid fa-wallet" /> Go to wallet</Link>
            <Button variant="secondary" onClick={() => window.location.reload()} icon="fa-solid fa-rotate">Re-check</Button>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
