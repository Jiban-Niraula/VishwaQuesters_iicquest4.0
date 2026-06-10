import { Link } from 'react-router-dom';
import PublicLayout from '../../shared/layout/PublicLayout.jsx';
import Card from '../../shared/components/Card.jsx';

export default function EsewaFailure() {
  return (
    <PublicLayout>
      <div className="public-page narrow">
        <Card title="Payment failed or cancelled" subtitle="Your wallet has not been credited." icon="fa-solid fa-circle-xmark">
          <p>Please try again after confirming the merchant configuration and backend verification endpoints.</p>
          <Link className="btn btn-primary" to="/wallet/topup">Try again</Link>
        </Card>
      </div>
    </PublicLayout>
  );
}
