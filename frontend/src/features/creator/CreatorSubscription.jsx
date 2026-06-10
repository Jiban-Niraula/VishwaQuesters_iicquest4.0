import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../shared/layout/DashboardLayout.jsx";
import Button from "../../shared/components/Button.jsx";
import Alert from "../../shared/components/Toast.jsx";
import Badge from "../../shared/components/Badge.jsx";
import { subscriptionApi } from "../../shared/api/subscription.js";
import { apiError } from "../../shared/api/http.js";
import { compactDate, money } from "../../shared/utils/format.js";

const FREE_FEATURES = [
  "Up to 4 cameras per event",
  "Play sponsored ads",
  "Earn from ad placements",
  "Reduced payout rate",
];

const PRO_FEATURES = [
  "Unlimited cameras",
  "Full sponsored ad payout",
  "Upload your own ads",
  "Priority marketplace placement",
];

function submitEsewaForm(data) {
  if (!data?.formUrl || !data?.fields) {
    throw new Error(
      "Payment initiation response did not include eSewa form details.",
    );
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = data.formUrl;

  Object.entries(data.fields).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}

export default function CreatorSubscription() {
  const [sub, setSub] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [esewaLoading, setEsewaLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  async function load() {
    setError("");
    try {
      setSub(await subscriptionApi.get());
    } catch (err) {
      setError(apiError(err));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function buyWithEsewa() {
    setEsewaLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await subscriptionApi.checkoutEsewa();
      submitEsewaForm(data);
    } catch (err) {
      setError(apiError(err));
      setEsewaLoading(false);
    }
  }

  async function upgradeWithWallet() {
    setWalletLoading(true);
    setError("");
    setSuccess("");

    try {
      const data = await subscriptionApi.upgradeWithWallet();
      setSuccess(data.message || "Subscription upgraded");
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setWalletLoading(false);
    }
  }

  const isPro = sub?.plan === "pro";
  const currency = sub?.currency || "NRS";
  const proPrice = Number(sub?.proPrice ?? sub?.price ?? 999);
  const billingPeriod = sub?.billingPeriod || "month";

  const proPriceText = useMemo(() => {
    return `${money(proPrice, currency)} / ${billingPeriod}`;
  }, [proPrice, currency, billingPeriod]);

  return (
    <DashboardLayout
      title="Subscription"
      subtitle="Manage your plan and unlock more production features."
    >
      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {pageLoading ? (
        <div className="loading-line">
          <i className="fa-solid fa-spinner fa-spin" /> Loading subscription...
        </div>
      ) : (
        <>
          <div className="vc-plan-grid">
            <article className={`vc-sub-card${!isPro ? " current" : ""}`}>
              <div className="vc-sub-card-head">
                <div className="vc-sub-icon">
                  <i className="fa-solid fa-seedling" />
                </div>
                <Badge tone={!isPro ? "success" : "neutral"}>
                  {!isPro ? "Current plan" : "Available"}
                </Badge>
              </div>

              <h3>Free</h3>
              <div className="vc-sub-price">
                NRS 0 <span>/ forever</span>
              </div>
              <p>For creators starting out with simple multi-camera streams.</p>

              <ul className="vc-sub-features">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature}>
                    <i className="fa-solid fa-check" />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>

            <article
              className={`vc-sub-card${isPro ? " current" : " highlight"}`}
            >
              <div className="vc-sub-card-head">
                <div className="vc-sub-icon pro">
                  <i className="fa-solid fa-crown" />
                </div>
                <Badge tone={isPro ? "success" : "warning"}>
                  {isPro ? "Current plan" : "Recommended"}
                </Badge>
              </div>

              <h3>Pro</h3>
              <div className="vc-sub-price">{proPriceText}</div>
              <p>
                For serious creators who need unlimited cameras and full ad
                control.
              </p>

              <ul className="vc-sub-features">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature}>
                    <i className="fa-solid fa-check" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isPro && sub?.expiresAt && (
                <p className="vc-sub-expires">
                  <i className="fa-regular fa-clock" /> Active until{" "}
                  {compactDate(sub.expiresAt)}
                </p>
              )}

              {!isPro && (
                <div className="form-grid" style={{ marginTop: 18 }}>
                  <Button
                    loading={esewaLoading}
                    onClick={buyWithEsewa}
                    icon="fa-solid fa-credit-card"
                    className="vc-sub-btn"
                  >
                    Buy Pro for {money(proPrice, currency)}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    loading={walletLoading}
                    onClick={upgradeWithWallet}
                    icon="fa-solid fa-wallet"
                  >
                    Use wallet balance instead
                  </Button>

                  <small style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                    Direct payment activates Pro after backend eSewa
                    verification. Wallet balance is optional.
                  </small>
                </div>
              )}
            </article>
          </div>

          <div className="vc-sub-note" style={{ marginTop: 18 }}>
            <i className="fa-solid fa-circle-info" />
            <span>
              Pro is billed monthly. After expiry, the creator automatically
              returns to the Free plan unless renewed.
            </span>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
