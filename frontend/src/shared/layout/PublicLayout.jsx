import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { config } from '../../app/config.js';
import { useAuth } from '../../features/auth/AuthContext.jsx';

export default function PublicLayout({ children }) {
  const { user, logout } = useAuth();
  const dashboardPath = user?.role ? `/${user.role}/dashboard` : '/login';
  const appName = config.appName === 'StreamAngle' ? 'Vision Cast' : config.appName;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="public-shell">
      <header className={`public-nav-header${scrolled ? ' public-nav--sticky' : ''}`}>
      <nav className="public-nav">
        <Link className="brand" to="/" aria-label={`${appName} home`}>
          <span>
            <i className="fa-solid fa-tower-broadcast" />
          </span>
          {appName}
        </Link>

        <div className="public-nav-links">
          <NavLink to="/">Home</NavLink>

          <a href="/#features">Features</a>

          <NavLink to="/camera">Camera</NavLink>

          {user ? (
            <NavLink to={dashboardPath}>Dashboard</NavLink>
          ) : (
            <NavLink to="/login">Login</NavLink>
          )}

          {user ? (
            <button onClick={logout} className="btn btn-ghost btn-sm" type="button">Logout</button>
          ) : (
            <Link className="btn btn-primary btn-sm" to="/register">Get Started</Link>
          )}
        </div>
      </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}