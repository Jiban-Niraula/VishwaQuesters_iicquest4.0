import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../../shared/layout/PublicLayout.jsx';
import { publicApi } from '../../shared/api/public.js';
import { money } from '../../shared/utils/format.js';

const features = [
  {
    icon: 'fa-solid fa-video',
    title: 'Multi-camera studio',
    text: 'Connect phones and cameras to one live event and switch angles from a clean browser studio.',
  },
  {
    icon: 'fa-solid fa-layer-group',
    title: 'Saved overlays',
    text: 'Create reusable text, image, video, timer, scoreboard, and sponsored ad overlays.',
  },
  {
    icon: 'fa-solid fa-microphone',
    title: 'Live commentary',
    text: 'Add microphone commentary, manage audio, and keep your production simple during live sessions.',
  },
  {
    icon: 'fa-solid fa-tower-broadcast',
    title: 'RTMP output',
    text: 'Send the final stream to YouTube, Facebook, Twitch, or any custom RTMP destination.',
  },
];

export default function HomePage() {
  const [pricing, setPricing] = useState({
    currency: 'NRS',
    proSubscriptionPrice: 999,
    freeCameraLimit: 4,
    billingPeriod: 'month',
  });

  useEffect(() => {
    let mounted = true;

    publicApi.pricing()
      .then((data) => {
        if (!mounted) return;
        setPricing({
          currency: data.currency || 'NRS',
          proSubscriptionPrice: Number(data.proSubscriptionPrice ?? 999),
          freeCameraLimit: Number(data.freeCameraLimit ?? 4),
          billingPeriod: data.billingPeriod || 'month',
        });
      })
      .catch(() => {
        // Keep fallback pricing if public pricing API is unavailable.
      });

    return () => {
      mounted = false;
    };
  }, []);

  const proPriceText = useMemo(() => {
    return `${money(pricing.proSubscriptionPrice, pricing.currency)} / ${pricing.billingPeriod}`;
  }, [pricing]);

  return (
    <PublicLayout>
      <div className="vc-landing">
        <section className="vc-hero">
          <div className="vc-hero-content">
            <div className="vc-pill">
              <i className="fa-solid fa-circle-dot" />
              Multi-angle live production
            </div>

            <h1>
              Build cleaner live streams with <span>Vision Cast.</span>
            </h1>

            <p>
              A professional live production platform for creators to connect
              cameras, manage overlays, stream to RTMP platforms, and earn from
              sponsored ad placements.
            </p>

            <div className="vc-hero-actions">
              <Link className="btn btn-primary" to="/register">
                Get Started
                <i className="fa-solid fa-arrow-right" />
              </Link>

              <Link className="btn btn-secondary" to="/login">
                Sign In
              </Link>
            </div>
          </div>

          <div className="vc-studio-card">
            <div className="vc-studio-head">
              <div>
                <span className="vc-live-dot" />
                Production Studio
              </div>
              <small>Ready</small>
            </div>

            <div className="vc-monitor">
              <div className="vc-monitor-main">
                <i className="fa-solid fa-clapperboard" />
                Program Preview
              </div>

              <div className="vc-monitor-side">
                <div>
                  <i className="fa-solid fa-mobile-screen-button" />
                  Camera
                </div>
                <div>
                  <i className="fa-solid fa-layer-group" />
                  Overlay
                </div>
              </div>
            </div>

            <div className="vc-studio-footer">
              <span>
                <i className="fa-solid fa-microphone" />
                Mic
              </span>
              <span>
                <i className="fa-solid fa-display" />
                Screen
              </span>
              <span>
                <i className="fa-solid fa-rectangle-ad" />
                Ads
              </span>
            </div>
          </div>
        </section>

        <section className="vc-stats">
          <div>
            <strong>{pricing.freeCameraLimit}+</strong>
            <span>Free cameras</span>
          </div>
          <div>
            <strong>RTMP</strong>
            <span>Live publishing</span>
          </div>
          <div>
            <strong>{pricing.currency}</strong>
            <span>Wallet earnings</span>
          </div>
        </section>

        <section id="features" className="vc-section">
          <div className="vc-section-head">
            <span>Features</span>
            <h2>Everything needed for a creator-led live show.</h2>
            <p>
              Vision Cast keeps production tools organized so creators can focus
              on the live event, not the complexity behind it.
            </p>
          </div>

          <div className="vc-feature-grid">
            {features.map((item) => (
              <article className="vc-feature-card" key={item.title}>
                <i className={item.icon} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vc-split-section">
          <div>
            <span className="vc-section-label">Marketplace</span>
            <h2>Creators stream. Companies promote. Admin controls the platform.</h2>
          </div>

          <div className="vc-split-grid">
            <article>
              <i className="fa-solid fa-user" />
              <h3>Creators</h3>
              <p>
                Create events, connect cameras, run the studio, play sponsored
                ads, and receive wallet earnings.
              </p>
            </article>

            <article>
              <i className="fa-solid fa-building" />
              <h3>Companies</h3>
              <p>
                Upload campaigns, set play limits, pay from wallet, and get
                approved ads shown inside creator streams.
              </p>
            </article>

            <article>
              <i className="fa-solid fa-shield-halved" />
              <h3>Admin</h3>
              <p>
                Manage pricing, commissions, approvals, users, wallet actions,
                and platform-level settings.
              </p>
            </article>
          </div>
        </section>

        <section className="vc-section">
          <div className="vc-section-head center">
            <span>Plans</span>
            <h2>Start simple. Upgrade when production grows.</h2>
            <p>
              Start with the free plan, then buy Pro directly when you need
              unlimited cameras and full creator tools.
            </p>
          </div>

          <div className="vc-plan-grid">
            <article className="vc-plan-card">
              <h3>Free</h3>
              <p>For creators starting with simple multi-camera streams.</p>
              <strong>NRS 0 / forever</strong>

              <ul>
                <li>
                  <i className="fa-solid fa-check" />
                  Up to {pricing.freeCameraLimit} cameras
                </li>
                <li>
                  <i className="fa-solid fa-check" />
                  Sponsored ad earnings
                </li>
                <li>
                  <i className="fa-solid fa-check" />
                  Basic studio tools
                </li>
              </ul>

              <Link className="btn btn-secondary" to="/register">
                Start Free
              </Link>
            </article>

            <article className="vc-plan-card featured">
              <h3>Pro</h3>
              <p>For creators who need unlimited cameras and own ad uploads.</p>
              <strong>{proPriceText}</strong>

              <ul>
                <li>
                  <i className="fa-solid fa-check" />
                  Unlimited cameras
                </li>
                <li>
                  <i className="fa-solid fa-check" />
                  Upload own ads
                </li>
                <li>
                  <i className="fa-solid fa-check" />
                  Higher sponsored ad payout
                </li>
                <li>
                  <i className="fa-solid fa-check" />
                  Direct monthly subscription payment
                </li>
              </ul>

              <Link className="btn btn-primary" to="/register">
                Create account to buy Pro
                <i className="fa-solid fa-arrow-right" />
              </Link>
            </article>
          </div>
        </section>

        <section className="vc-faq-section">
          <div className="vc-section-head center">
            <span>FAQ</span>
            <h2>Common questions</h2>
          </div>

          <div className="vc-faq-list">
            <details>
              <summary>Can I connect mobile phones as cameras?</summary>
              <p>
                Yes. Creators can share the event camera link or session code
                and use phones as remote camera angles.
              </p>
            </details>

            <details>
              <summary>Can creators earn from sponsored ads?</summary>
              <p>
                Yes. Approved company ads appear in the creator marketplace, and
                earnings are credited after completed ad placements.
              </p>
            </details>

            <details>
              <summary>Can I stream to YouTube or Facebook?</summary>
              <p>
                Yes. Vision Cast supports RTMP destinations including YouTube,
                Facebook, Twitch, and custom RTMP servers.
              </p>
            </details>

            <details>
              <summary>Can I buy Pro without depositing to wallet?</summary>
              <p>
                Yes. Pro can be purchased directly through the subscription page.
                Wallet deposit is optional and mainly used for ad campaigns,
                payouts, and wallet-based actions.
              </p>
            </details>
          </div>
        </section>

        <section className="vc-final-cta">
          <h2>Ready to produce cleaner live streams?</h2>
          <p>
            Create your account, set up your first event, and bring your live
            production into one organized studio.
          </p>

          <Link className="btn btn-primary" to="/register">
            Start Free
            <i className="fa-solid fa-arrow-right" />
          </Link>
        </section>
      </div>
    </PublicLayout>
  );
}