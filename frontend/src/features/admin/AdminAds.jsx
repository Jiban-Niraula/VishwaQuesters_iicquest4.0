import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../../shared/layout/DashboardLayout.jsx";
import Card from "../../shared/components/Card.jsx";
import Badge from "../../shared/components/Badge.jsx";
import Button from "../../shared/components/Button.jsx";
import EmptyState from "../../shared/components/EmptyState.jsx";
import Alert from "../../shared/components/Toast.jsx";
import { adminApi } from "../../shared/api/admin.js";
import { apiError } from "../../shared/api/http.js";
import { money, dateTime } from "../../shared/utils/format.js";

const STATUS_TONE = {
  approved: "success",
  rejected: "danger",
  completed: "neutral",
  pending: "warning",
};

function aiTone(status) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function shortReason(text) {
  if (!text) return "No reason recorded";
  if (text.length <= 90) return text;
  return `${text.slice(0, 90)}...`;
}

export default function AdminAds() {
  const [status, setStatus] = useState("");
  const [ads, setAds] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(s = status) {
    try {
      const data = await adminApi.ads(s || undefined);
      setAds(data.ads || []);
    } catch (err) {
      setError(apiError(err));
    }
  }

  useEffect(() => {
    load("");
  }, []);

  async function update(id, next) {
    setError("");
    setNotice("");

    try {
      const data = await adminApi.updateAdStatus(id, next);
      setNotice(data.message || "Updated");
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  const summary = useMemo(() => {
    return ads.reduce(
      (acc, ad) => {
        acc.total += 1;
        if (ad.status === "approved") acc.approved += 1;
        if (ad.status === "pending") acc.pending += 1;
        if (ad.status === "rejected") acc.rejected += 1;
        if (ad.aiModerationStatus === "approved") acc.aiApproved += 1;
        if (ad.aiModerationStatus === "pending") acc.aiFlagged += 1;
        return acc;
      },
      {
        total: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        aiApproved: 0,
        aiFlagged: 0,
      },
    );
  }, [ads]);

  return (
    <DashboardLayout
      title="Ad Moderation History"
      subtitle="AI auto-approves safe campaigns. Flagged campaigns remain available for admin review."
    >
      {error && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="stats-grid">
        <div className="stat-card">
          <i className="fa-solid fa-rectangle-ad" />
          <div>
            <span>Total ads</span>
            <strong>{summary.total}</strong>
            <small>All campaigns</small>
          </div>
        </div>

        <div className="stat-card">
          <i className="fa-solid fa-robot" />
          <div>
            <span>AI approved</span>
            <strong>{summary.aiApproved}</strong>
            <small>Auto-approved safe ads</small>
          </div>
        </div>

        <div className="stat-card">
          <i className="fa-solid fa-triangle-exclamation" />
          <div>
            <span>AI flagged</span>
            <strong>{summary.aiFlagged}</strong>
            <small>Needs admin review</small>
          </div>
        </div>

        <div className="stat-card">
          <i className="fa-solid fa-hourglass-half" />
          <div>
            <span>Pending</span>
            <strong>{summary.pending}</strong>
            <small>Waiting decision</small>
          </div>
        </div>
      </div>

      <Card
        title="Campaigns"
        icon="fa-solid fa-shield-halved"
        action={
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              load(e.target.value);
            }}
            style={{ width: "auto" }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
          </select>
        }
      >
        {ads.length === 0 ? (
          <EmptyState
            title="No ads found"
            text="Campaigns will appear here once companies submit them."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>AI decision</th>
                  <th>Risk</th>
                  <th>AI reason</th>
                  <th>Budget</th>
                  <th>Spent</th>
                  <th>Views</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id}>
                    <td>
                      <strong>{ad.title}</strong>
                      <small>
                        {ad.type}
                        {ad.durationSeconds ? ` · ${ad.durationSeconds}s` : ""}
                      </small>
                    </td>

                    <td>{ad.company?.name || ad.companyId}</td>

                    <td>
                      <Badge tone={STATUS_TONE[ad.status] || "neutral"}>
                        {ad.status}
                      </Badge>
                    </td>

                    <td>
                      <Badge tone={aiTone(ad.aiModerationStatus)}>
                        {ad.aiModerationStatus || "pending"}
                      </Badge>
                      <small>{ad.aiModerationBy || "local-ai-moderator"}</small>
                    </td>

                    <td>
                      <strong>{Number(ad.aiRiskScore || 0).toFixed(0)}%</strong>
                    </td>

                    <td style={{ minWidth: 220 }}>
                      <small title={ad.aiModerationReason}>
                        {shortReason(ad.aiModerationReason)}
                      </small>
                    </td>

                    <td>{money(ad.campaignBudget ?? ad.chargeAmount)}</td>
                    <td>{money(ad.spentAmount)}</td>

                    <td>
                      <small>
                        Platform: {ad.platformViews || 0}
                        <br />
                        External:{" "}
                        {(ad.youtubeViews || 0) + (ad.facebookViews || 0)}
                      </small>
                    </td>

                    <td>
                      <small>{dateTime(ad.createdAt)}</small>
                    </td>

                    <td>
                      {ad.status === "pending" ? (
                        <div className="table-actions">
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => update(ad.id, "approved")}
                          >
                            Approve
                          </Button>

                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => update(ad.id, "rejected")}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
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
