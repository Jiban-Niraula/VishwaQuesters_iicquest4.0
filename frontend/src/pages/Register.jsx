import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    organization: "",
    password: "",
  });
  const [error, setError] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.name || !form.email || !form.organization || !form.password) {
      setError("Please fill all required fields.");
      return;
    }

    register({ name: form.name, email: form.email, organization: form.organization });
    navigate("/dashboard", { replace: true });
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-32">
      <div className="app-container grid items-center gap-10 lg:grid-cols-[0.9fr_1fr]">
        <section className="glass-card orange-glow rounded-[32px] p-6 md:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-black">Create organizer account</h1>
            <p className="section-desc mt-2">
              Start your broadcasting workspace for tournaments and events.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="form-label" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Your name"
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="organization">
                Organization / tournament name
              </label>
              <input
                id="organization"
                name="organization"
                value={form.organization}
                onChange={handleChange}
                placeholder="Example: Ramchok Cricket Cup"
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="organizer@example.com"
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Create password"
                className="form-input"
              />
            </div>

            <button type="submit" className="btn-primary w-full">
              Create Account →
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/55">
            Already have an account?{" "}
            <Link to="/login" className="font-bold text-app-orange">
              Login
            </Link>
          </p>
        </section>

        <section>
          <p className="section-kicker">Broadcast Faster</p>
          <h2 className="section-title mt-4 text-5xl md:text-6xl">
            Turn any local event into a live production.
          </h2>
          <p className="section-desc mt-6 max-w-xl text-lg">
            Your organizers can invite camera users, control live scenes, update
            scoreboards, and stream to social platforms from a single dashboard.
          </p>

          <div className="mt-8 space-y-4">
            {["Mobile camera access", "Live studio control", "Scoreboard overlays"].map(
              (item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 font-semibold"
                >
                  <span className="mr-3 text-app-orange">✦</span>
                  {item}
                </div>
              )
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
