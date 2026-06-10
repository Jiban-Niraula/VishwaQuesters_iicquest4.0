import { Link } from "react-router-dom";

const features = [
  {
    title: "Mobile as Camera",
    desc: "Use any smartphone as a live camera for cricket, football, school events, or local programs.",
  },
  {
    title: "Multi-Platform Streaming",
    desc: "Broadcast your event to YouTube, Facebook, and other social platforms from one simple studio.",
  },
  {
    title: "Live Match Production",
    desc: "Manage camera switching, overlays, scoreboard, stream title, and event branding in real time.",
  },
  {
    title: "Organizer Dashboard",
    desc: "Create events, invite camera operators, manage broadcasts, and track live streaming activity.",
  },
];

const steps = [
  {
    title: "Create Event",
    desc: "Organizer creates a tournament or event from the dashboard.",
  },
  {
    title: "Connect Cameras",
    desc: "Camera users join using mobile phones or available camera devices.",
  },
  {
    title: "Control Studio",
    desc: "Switch cameras, manage overlays, and prepare the live stream.",
  },
  {
    title: "Go Live Everywhere",
    desc: "Broadcast to YouTube, Facebook, and other platforms at the same time.",
  },
];

const useCases = [
  "Local cricket tournaments",
  "Football matches",
  "School and college programs",
  "Community events",
  "Stage shows",
  "Training sessions",
];

const plans = [
  {
    name: "Starter",
    price: "$0",
    desc: "For testing small practice events.",
    features: ["1 event", "Mobile camera support", "Basic live preview"],
  },
  {
    name: "Tournament",
    price: "$19",
    desc: "For local cricket and sports tournaments.",
    features: [
      "Multiple events",
      "Multiple mobile cameras",
      "YouTube/Facebook streaming",
      "Live scoreboard overlay",
    ],
    highlighted: true,
  },
  {
    name: "Organizer Pro",
    price: "$49",
    desc: "For professional organizers and agencies.",
    features: [
      "Unlimited events",
      "Advanced studio control",
      "Team camera access",
      "Branding and overlays",
    ],
  },
];

const faqs = [
  {
    q: "Can I use mobile phones as cameras?",
    a: "Yes. Camera operators can join from mobile devices and send live video to the studio.",
  },
  {
    q: "Can I stream to YouTube and Facebook?",
    a: "Yes. The platform is designed to help organizers broadcast to multiple social platforms from one place.",
  },
  {
    q: "Is this only for cricket?",
    a: "No. Cricket is the main example, but it can also be used for football, school programs, community events, and stage shows.",
  },
  {
    q: "Who controls the live stream?",
    a: "The organizer or studio manager controls camera switching, stream settings, overlays, and scoreboard display.",
  },
];

export default function Landing() {
  return (
    <main className="min-h-screen overflow-hidden bg-app-bg text-white">
      <section id="home" className="noise-bg relative px-4 pb-20 pt-32 md:pt-40">
        <div className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-app-cyan/20 blur-[120px]" />
        <div className="absolute -right-32 top-20 h-96 w-96 rounded-full bg-app-orange/25 blur-[120px]" />

        <div className="app-container relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="text-center lg:text-left">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 backdrop-blur">
              <span className="text-app-orange">● LIVE</span>
              <span>Broadcast local tournaments from mobile cameras</span>
            </div>

            <h1 className="section-title text-5xl md:text-7xl">
              Stream Local
              <span className="text-app-orange"> Cricket</span>
              <br />
              Like a Pro.
            </h1>

            <p className="section-desc mx-auto mt-6 max-w-2xl text-base md:text-lg lg:mx-0">
              A live broadcasting system for organizers to stream cricket
              tournaments, sports events, school programs, and local shows using
              mobile phones as cameras.
            </p>

            <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
              <Link to="/register" className="btn-primary">
                Start Broadcasting →
              </Link>
              <a href="#workflow" className="btn-secondary">
                How It Works
              </a>
            </div>
          </div>

          <div className="glass-card orange-glow relative rounded-[32px] p-4">
            <div className="rounded-[24px] border border-white/10 bg-black p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/45">Live Studio</p>
                  <h3 className="font-bold">Local Cricket Cup</h3>
                </div>
                <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold">
                  LIVE
                </span>
              </div>

              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-app-orange/30 via-black to-app-cyan/20 p-4">
                <div className="aspect-video rounded-xl border border-white/10 bg-black/60 p-4">
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex justify-between text-xs">
                      <span className="rounded-full bg-black/60 px-3 py-1">Camera 1</span>
                      <span className="rounded-full bg-app-orange px-3 py-1 font-bold">
                        On Air
                      </span>
                    </div>

                    <div>
                      <p className="text-sm text-white/60">Team A vs Team B</p>
                      <h2 className="mt-1 text-3xl font-black">
                        126/4 <span className="text-base text-white/50">14.2 overs</span>
                      </h2>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                {["Cam 1", "Cam 2", "Cam 3"].map((cam, index) => (
                  <div
                    key={cam}
                    className={`rounded-xl border p-3 text-center text-sm ${
                      index === 0
                        ? "border-app-orange bg-app-orange/15 text-white"
                        : "border-white/10 bg-white/5 text-white/50"
                    }`}
                  >
                    {cam}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-white/45">YouTube</p>
                  <p className="font-bold text-app-orange">Connected</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-white/45">Facebook</p>
                  <p className="font-bold text-app-orange">Connected</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="app-container grid gap-6 py-8 md:grid-cols-3">
          {[
            { label: "Camera Devices", value: "Mobile" },
            { label: "Streaming", value: "Multi" },
            { label: "Setup Time", value: "Fast" },
          ].map((item) => (
            <div
              key={item.label}
              className="text-center md:border-r md:border-white/10 last:border-r-0"
            >
              <p className="text-sm font-semibold text-app-orange">{item.label}</p>
              <h3 className="mt-2 text-3xl font-black">{item.value}</h3>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="app-container py-20">
        <div className="mb-12 max-w-2xl">
          <p className="section-kicker">Broadcasting Platform</p>
          <h2 className="section-title mt-4 text-4xl md:text-5xl">
            Everything an organizer needs to go live.
          </h2>
          <p className="section-desc mt-5">
            From mobile camera connection to live studio control, your system
            makes local event broadcasting simple and professional.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className={`glass-card rounded-3xl p-7 transition hover:-translate-y-1 ${
                index === 0 || index === 2 ? "orange-glow" : ""
              }`}
            >
              <div className="mb-8 flex justify-between">
                <span className="text-sm font-bold text-app-orange">0{index + 1}</span>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-app-orange font-bold">
                  ↗
                </span>
              </div>
              <h3 className="text-2xl font-bold">{feature.title}</h3>
              <p className="section-desc mt-4">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="relative py-20">
        <div className="absolute left-0 top-0 h-96 w-96 rounded-full bg-app-cyan/10 blur-[130px]" />
        <div className="app-container relative">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="section-kicker">How It Works</p>
            <h2 className="section-title mt-4 text-4xl md:text-5xl">
              From ground to global audience.
            </h2>
            <p className="section-desc mt-5">
              A local tournament can be set up, controlled, and streamed without
              expensive broadcasting equipment.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.title} className="glass-card rounded-3xl p-6">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-app-orange text-lg font-black">
                  {index + 1}
                </div>
                <h3 className="text-xl font-bold">{step.title}</h3>
                <p className="section-desc mt-3 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="app-container py-16">
        <div className="grid items-center gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="section-kicker">Use Cases</p>
            <h2 className="section-title mt-4 text-4xl md:text-5xl">
              Not only cricket. Any local event can go live.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {useCases.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 font-semibold"
              >
                <span className="mr-2 text-app-orange">✦</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="relative py-20">
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-app-orange/10 blur-[130px]" />
        <div className="app-container relative">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="section-kicker">Pricing</p>
            <h2 className="section-title mt-4 text-4xl md:text-5xl">
              Simple plans for every organizer.
            </h2>
            <p className="section-desc mt-5">
              Start with a small event and upgrade for complete tournament broadcasting.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`glass-card rounded-3xl p-7 ${
                  plan.highlighted ? "scale-[1.03] border-app-orange orange-glow" : ""
                }`}
              >
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="section-desc mt-3">{plan.desc}</p>

                <div className="mt-8 flex items-end gap-2">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="mb-1 text-white/50">/event</span>
                </div>

                <ul className="mt-8 space-y-4 text-sm text-white/70">
                  {plan.features.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-app-orange">✦</span>
                      {item}
                    </li>
                  ))}
                </ul>

                <Link to="/register" className="btn-primary mt-8 w-full">
                  Choose Plan →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="app-container py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="section-kicker">FAQ</p>
          <h2 className="section-title mt-4 text-4xl md:text-5xl">Common Questions</h2>
        </div>

        <div className="mx-auto max-w-3xl divide-y divide-white/10 rounded-3xl border border-white/10 bg-white/[0.03]">
          {faqs.map((faq) => (
            <details key={faq.q} className="group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-semibold">
                {faq.q}
                <span className="text-app-orange transition group-open:rotate-45">+</span>
              </summary>
              <p className="section-desc mt-4">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="app-container pb-20">
        <div className="glass-card orange-glow overflow-hidden rounded-[32px] p-10 text-center md:p-16">
          <h2 className="section-title text-4xl md:text-5xl">
            Ready to broadcast your next tournament?
          </h2>
          <p className="section-desc mx-auto mt-5 max-w-2xl">
            Create your event, connect mobile cameras, manage your live studio,
            and stream your match to your audience.
          </p>
          <Link to="/register" className="btn-primary mt-8">
            Start Now →
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-white/[0.03] py-10">
        <div className="app-container flex flex-col justify-between gap-6 md:flex-row">
          <div>
            <h3 className="text-xl font-black">
              Multi<span className="text-app-orange">Stream</span>
            </h3>
            <p className="section-desc mt-3 max-w-sm text-sm">
              A live broadcasting system for tournaments, events, and local organizers.
            </p>
          </div>
          <p className="text-sm text-white/45">© 2026 MultiStream. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
