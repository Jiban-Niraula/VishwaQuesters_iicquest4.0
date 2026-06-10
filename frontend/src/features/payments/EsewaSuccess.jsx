import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PublicLayout from "../../shared/layout/PublicLayout.jsx";
import Card from "../../shared/components/Card.jsx";
import Button from "../../shared/components/Button.jsx";
import Alert from "../../shared/components/Toast.jsx";
import { paymentsApi } from "../../shared/api/payments.js";
import { apiError } from "../../shared/api/http.js";
import { authStorage } from "../../shared/utils/storage.js";
import { money } from "../../shared/utils/format.js";

export default function EsewaSuccess() {
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState(null);
  const [message, setMessage] = useState("");

  const token = authStorage.getToken();
  const data = params.get("data");

  useEffect(() => {
    let mounted = true;

    async function verify() {
      if (!token) {
        setError(
          "Login token not found. Please login again and check your payment status.",
        );
        setLoading(false);
        return;
      }

      if (!data) {
        setError(
          "eSewa did not return verification data. Please check payment status from your dashboard.",
        );
        setLoading(false);
        return;
      }

      try {
        const result = await paymentsApi.verifyEsewa({ data });
        if (!mounted) return;
        setPayment(result.payment || null);
        setMessage(result.message || "Payment verified successfully");
      } catch (err) {
        if (!mounted) return;
        setError(apiError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    verify();
    return () => {
      mounted = false;
    };
  }, [data, token]);

  const role = authStorage.getUser()?.role || "creator";
  const isSubscription = payment?.purpose === "subscription_pro";

  const nextPath = useMemo(() => {
    if (isSubscription) return "/creator/subscription";
    if (role === "company") return "/company/wallet";
    if (role === "admin") return "/admin/dashboard";
    return "/creator/wallet";
  }, [isSubscription, role]);

  const nextLabel = isSubscription ? "Go to subscription" : "Go to wallet";
  const nextIcon = isSubscription ? "fa-solid fa-crown" : "fa-solid fa-wallet";

  return (
    <PublicLayout>
      <div className="public-page narrow">
        <Card
          title={
            isSubscription
              ? "Pro subscription verification"
              : "eSewa payment verification"
          }
          subtitle={
            isSubscription
              ? "Pro activates only after backend verification."
              : "Wallet balance updates only after backend verification."
          }
          icon="fa-solid fa-circle-check"
        >
          {loading && (
            <div className="loading-line">
              <i className="fa-solid fa-spinner fa-spin" /> Verifying payment
              with backend...
            </div>
          )}

          {!loading && error && <Alert type="error">{error}</Alert>}

          {!loading && payment && (
            <div className="rule-list">
              <p>
                <i className="fa-solid fa-check" /> {message}
              </p>
              <p>
                <i className="fa-solid fa-signal" /> Status:{" "}
                <strong>{payment.status}</strong>
              </p>
              <p>
                <i className="fa-solid fa-receipt" /> Reference:{" "}
                {payment.paymentRef}
              </p>
              <p>
                <i className="fa-solid fa-money-bill" /> Amount:{" "}
                {money(payment.amount, payment.currency)}
              </p>
              {isSubscription && (
                <p>
                  <i className="fa-solid fa-crown" /> Plan:{" "}
                  <strong>Pro / month</strong>
                </p>
              )}
            </div>
          )}

          <div className="button-row">
            <Link className="btn btn-primary" to={nextPath}>
              <i className={nextIcon} /> {nextLabel}
            </Link>
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
              icon="fa-solid fa-rotate"
            >
              Re-check
            </Button>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}
