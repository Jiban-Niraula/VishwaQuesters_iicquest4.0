import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../../shared/layout/DashboardLayout.jsx";
import Card from "../../shared/components/Card.jsx";
import Button from "../../shared/components/Button.jsx";
import Alert from "../../shared/components/Toast.jsx";
import { adsApi } from "../../shared/api/ads.js";
import { apiError } from "../../shared/api/http.js";
import { money } from "../../shared/utils/format.js";

export default function CompanyCreateAd() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("upload");
  const [form, setForm] = useState({
    title: "",
    type: "image",
    media_url: "",
    duration_seconds: 0,
    campaign_budget: 1000,
    max_plays: 1000000,
  });

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const estimate = useMemo(() => {
    const ratePer100Views =
      form.type === "video" ? Number(form.duration_seconds || 0) * 10 : 50;

    const costPerView = ratePer100Views / 100;
    const budget = Number(form.campaign_budget || 0);
    const estimatedViews =
      costPerView > 0 ? Math.floor(budget / costPerView) : 0;
    const adminCommission = budget * 0.3;
    const creatorPool = budget - adminCommission;

    return {
      costPerView,
      budget,
      estimatedViews,
      adminCommission,
      creatorPool,
    };
  }, [form]);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      if (mode === "upload") {
        if (!file) {
          throw new Error("Please select a media file.");
        }

        const fd = new FormData();
        fd.append("title", form.title);
        fd.append("type", form.type);
        fd.append("duration_seconds", form.duration_seconds);
        fd.append("campaign_budget", form.campaign_budget);
        fd.append("max_plays", form.max_plays);
        fd.append("file", file);

        await adsApi.upload(fd);
      } else {
        await adsApi.create({
          title: form.title,
          type: form.type,
          media_url: form.media_url,
          duration_seconds: Number(form.duration_seconds),
          campaign_budget: Number(form.campaign_budget),
          max_plays: Number(form.max_plays),
        });
      }

      navigate("/company/ads");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout
      title="Create Ad Campaign"
      subtitle="Upload your campaign. AI moderation auto-approves safe ads and flags risky ads for admin review."
      actions={
        <Link className="btn btn-secondary" to="/company/ads">
          <i className="fa-solid fa-arrow-left" /> Ads
        </Link>
      }
    >
      {error && <Alert type="error">{error}</Alert>}

      <div className="grid-2 align-start">
        <Card title="Campaign details" icon="fa-solid fa-rectangle-ad">
          <div className="segmented">
            <button
              type="button"
              className={mode === "upload" ? "active" : ""}
              onClick={() => setMode("upload")}
            >
              Upload file
            </button>

            <button
              type="button"
              className={mode === "url" ? "active" : ""}
              onClick={() => setMode("url")}
            >
              Use media URL
            </button>
          </div>

          <form onSubmit={submit} className="form-grid">
            <label>
              Campaign title
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Dashain offer campaign"
                required
              />
            </label>

            <label>
              Ad type
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    type: e.target.value,
                    duration_seconds:
                      e.target.value === "image" ? 0 : prev.duration_seconds,
                  }))
                }
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </label>

            {form.type === "video" && (
              <label>
                Video duration seconds
                <input
                  type="number"
                  min="1"
                  value={form.duration_seconds}
                  onChange={(e) => set("duration_seconds", e.target.value)}
                  required
                />
              </label>
            )}

            <label>
              Campaign budget
              <input
                type="number"
                min="10"
                step="1"
                value={form.campaign_budget}
                onChange={(e) => set("campaign_budget", e.target.value)}
                required
              />
              <small>
                Full amount is reserved from company wallet. Only real platform
                views consume the budget.
              </small>
            </label>

            <label>
              Max ad plays safety limit
              <input
                type="number"
                min="1"
                value={form.max_plays}
                onChange={(e) => set("max_plays", e.target.value)}
                required
              />
              <small>
                This is only a safety cap. Billing is based on platform views,
                not only plays.
              </small>
            </label>

            {mode === "upload" ? (
              <label>
                Media file
                <input
                  type="file"
                  accept={form.type === "image" ? "image/*" : "video/*"}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  required
                />
              </label>
            ) : (
              <label>
                Media URL
                <input
                  value={form.media_url}
                  onChange={(e) => set("media_url", e.target.value)}
                  placeholder="https://example.com/ad.mp4"
                  required
                />
              </label>
            )}

            <Button loading={loading} icon="fa-solid fa-paper-plane">
              Submit for approval
            </Button>
          </form>
        </Card>

        <Card title="Budget estimate" icon="fa-solid fa-chart-line">
          <div className="estimate-box">
            <strong>{money(estimate.budget)}</strong>
            <p>Total campaign budget reserved from company wallet.</p>
          </div>

          <div className="metric-list">
            <p>
              <span>Estimated cost per platform view</span>
              <strong>{money(estimate.costPerView)}</strong>
            </p>

            <p>
              <span>Estimated platform reach</span>
              <strong>{estimate.estimatedViews}</strong>
            </p>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
