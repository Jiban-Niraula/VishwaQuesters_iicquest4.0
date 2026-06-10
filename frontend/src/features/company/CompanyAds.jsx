import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../../shared/layout/DashboardLayout.jsx";
import Card from "../../shared/components/Card.jsx";
import Badge from "../../shared/components/Badge.jsx";
import EmptyState from "../../shared/components/EmptyState.jsx";
import StatCard from "../../shared/components/StatCard.jsx";
import { adsApi } from "../../shared/api/ads.js";
import { money, dateTime } from "../../shared/utils/format.js";

function statusTone(status) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "completed") return "neutral";
  return "warning";
}

export default function CompanyAds() {
  const [ads, setAds] = useState([]);

  useEffect(() => {
    adsApi
      .mine()
      .then((data) => setAds(data.ads || []))
      .catch(() => {});
  }, []);

  const totals = useMemo(() => {
    return ads.reduce(
      (acc, ad) => {
        acc.budget += Number(ad.campaignBudget ?? ad.chargeAmount ?? 0);
        acc.spent += Number(ad.spentAmount ?? 0);
        acc.remaining += Number(ad.remainingBudget ?? 0);
        acc.platformViews += Number(ad.platformViews ?? 0);
        acc.youtubeViews += Number(ad.youtubeViews ?? 0);
        acc.facebookViews += Number(ad.facebookViews ?? 0);
        return acc;
      },
      {
        budget: 0,
        spent: 0,
        remaining: 0,
        platformViews: 0,
        youtubeViews: 0,
        facebookViews: 0,
      },
    );
  }, [ads]);

  return (
    <DashboardLayout
      title="Company Ads"
      subtitle="Track campaign budget, consumed spend, platform views, and external views."
      actions={
        <Link className="btn btn-primary" to="/company/ads/create">
          <i className="fa-solid fa-plus" /> Create ad
        </Link>
      }
    >
      <div className="stats-grid">
        <StatCard
          icon="fa-solid fa-wallet"
          label="Total budget"
          value={money(totals.budget)}
          note="Reserved from wallet"
        />

        <StatCard
          icon="fa-solid fa-money-bill-wave"
          label="Consumed spend"
          value={money(totals.spent)}
          note="Billable platform views"
        />

        <StatCard
          icon="fa-solid fa-eye"
          label="Platform views"
          value={totals.platformViews}
          note="Vision Cast verified views"
        />

        <StatCard
          icon="fa-brands fa-youtube"
          label="External views"
          value={totals.youtubeViews + totals.facebookViews}
          note="Report-only for now"
        />
      </div>

      <Card title="Campaigns" icon="fa-solid fa-rectangle-ad">
        {ads.length === 0 ? (
          <EmptyState
            title="No campaigns"
            text="Create a campaign to start promoting inside creator streams."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Status</th>
                  <th>Budget</th>
                  <th>Spent</th>
                  <th>Remaining</th>
                  <th>Platform views</th>
                  <th>YouTube</th>
                  <th>Facebook</th>
                  <th>Plays</th>
                  <th>CPV</th>
                  <th>Created</th>
                </tr>
              </thead>

              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id}>
                    <td>
                      <strong>{ad.title}</strong>
                      <small>
                        {ad.type}
                        {ad.durationSeconds ? ` • ${ad.durationSeconds}s` : ""}
                      </small>
                    </td>

                    <td>
                      <Badge tone={statusTone(ad.status)}>{ad.status}</Badge>
                    </td>

                    <td>{money(ad.campaignBudget ?? ad.chargeAmount)}</td>
                    <td>{money(ad.spentAmount)}</td>
                    <td>{money(ad.remainingBudget)}</td>
                    <td>{ad.platformViews || 0}</td>
                    <td>{ad.youtubeViews || 0}</td>
                    <td>{ad.facebookViews || 0}</td>
                    <td>
                      {ad.completedPlays || 0}/{ad.maxPlays || "∞"}
                    </td>
                    <td>{money(ad.costPerView ?? ad.baseChargePerPlay)}</td>
                    <td>
                      <small>{dateTime(ad.createdAt)}</small>
                    </td>
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
