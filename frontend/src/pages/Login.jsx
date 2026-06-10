import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const redirectPath = location.state?.from || "/dashboard";

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Please enter email and password.");
      return;
    }

    login({ email: form.email });
    navigate(redirectPath, { replace: true });
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-32">
      <div className="app-container grid items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
        <section>
          <p className="section-kicker">Organizer Login</p>
          <h1 className="section-title mt-4 text-5xl md:text-6xl">
            Control your live broadcast studio.
          </h1>
          <p className="section-desc mt-6 max-w-xl text-lg">
            Login to create tournaments, connect mobile cameras, manage overlays,
            and start streaming to your audience.
          </p>

          <div className="mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-2xl font-black text-app-orange">Mobile</p>
              <p className="mt-2 text-sm text-white/55">Use phones as camera devices.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-2xl font-black text-app-orange">Live</p>
              <p className="mt-2 text-sm text-white/55">Manage stream from studio.</p>
            </div>
          </div>
        </section>

        <section className="glass-card orange-glow rounded-[32px] p-6 md:p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-black">Welcome back</h2>
            <p className="section-desc mt-2">Enter your organizer account details.</p>
          </div>

          {error && (
            <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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
                placeholder="Enter your password"
                className="form-input"
              />
            </div>

            <button type="submit" className="btn-primary w-full">
              Login →
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/55">
            New organizer?{" "}
            <Link to="/register" className="font-bold text-app-orange">
              Create account
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
