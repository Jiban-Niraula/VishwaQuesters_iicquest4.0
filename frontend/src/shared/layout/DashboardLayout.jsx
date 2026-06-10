import { NavLink } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext.jsx';
import { config } from '../../app/config.js';

const menus = {
  creator: [
    ['Dashboard', '/creator/dashboard', 'fa-solid fa-gauge-high'],
    ['Events', '/creator/events', 'fa-solid fa-calendar-days'],
    ['Wallet', '/creator/wallet', 'fa-solid fa-wallet'],
    ['Subscription', '/creator/subscription', 'fa-solid fa-crown']
  ],
  company: [
    ['Dashboard', '/company/dashboard', 'fa-solid fa-chart-line'],
    ['Ads', '/company/ads', 'fa-solid fa-rectangle-ad'],
    ['Wallet', '/company/wallet', 'fa-solid fa-wallet']
  ],
  admin: [
    ['Dashboard', '/admin/dashboard', 'fa-solid fa-gauge'],
    ['Users', '/admin/users', 'fa-solid fa-users'],
    ['Ads', '/admin/ads', 'fa-solid fa-rectangle-ad'],
    ['Revenue', '/admin/revenue', 'fa-solid fa-sack-dollar'],
    ['Settings', '/admin/settings', 'fa-solid fa-sliders'],
    ['Wallet Actions', '/admin/wallet-actions', 'fa-solid fa-money-bill-transfer']
  ]
};

export default function DashboardLayout({ title, subtitle, actions, children }) {
  const { user, logout } = useAuth();
  const items = menus[user?.role] || [];

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><i className="fa-solid fa-video" /> <span>{config.appName}</span></div>
        <nav>
          {items.map(([label, to, icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
              <i className={icon} /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="sidebar-logout" onClick={logout}><i className="fa-solid fa-arrow-right-from-bracket" /> Logout</button>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="topbar-actions">
            {actions}
            <div className="user-pill"><i className="fa-regular fa-user" /> <span>{user?.name}</span><small>{user?.role}</small></div>
          </div>
        </header>
        <div className="dashboard-content">{children}</div>
      </section>
    </div>
  );
}
