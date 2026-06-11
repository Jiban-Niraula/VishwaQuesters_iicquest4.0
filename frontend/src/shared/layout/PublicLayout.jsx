import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { config } from '../../app/config.js';
import { useAuth } from '../../features/auth/AuthContext.jsx';

export default function PublicLayout({ children }) {
  const { user, logout } = useAuth();
  const dashboardPath = user?.role ? `/${user.role}/dashboard` : '/login';
  const appName = config.appName === 'StreamAngle' ? 'Vision Cast' : config.appName;
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="public-shell">
      <header className={`public-nav-header relative${scrolled ? ' public-nav--sticky' : ''}`}>
        <nav className="public-nav">
          <Link className="brand" to="/" aria-label={`${appName} home`} onClick={closeMenu}>
            <span>
              <i className="fa-solid fa-tower-broadcast" />
            </span>
            {appName}
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex gap-2 items-center public-nav-links">
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

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden flex items-center justify-center text-white p-2 w-10 h-10 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            <i className={`fa-solid ${isMenuOpen ? 'fa-xmark' : 'fa-bars'} text-xl`} />
          </button>
        </nav>

        {/* Mobile Drawer */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-[#050505]/95 backdrop-blur-xl border-b border-white/10 shadow-2xl flex flex-col gap-2 p-6 z-40">
            <NavLink 
              to="/" 
              onClick={closeMenu} 
              className={({ isActive }) => `text-[15px] font-semibold py-3 px-4 rounded-xl transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-[#d6d6db] hover:bg-white/5 hover:text-white'}`}
            >
              Home
            </NavLink>
            
            <a 
              href="/#features" 
              onClick={closeMenu} 
              className="text-[15px] font-semibold py-3 px-4 rounded-xl transition-colors text-[#d6d6db] hover:bg-white/5 hover:text-white"
            >
              Features
            </a>
            
            <NavLink 
              to="/camera" 
              onClick={closeMenu} 
              className={({ isActive }) => `text-[15px] font-semibold py-3 px-4 rounded-xl transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-[#d6d6db] hover:bg-white/5 hover:text-white'}`}
            >
              Camera
            </NavLink>

            {user ? (
              <NavLink 
                to={dashboardPath} 
                onClick={closeMenu} 
                className={({ isActive }) => `text-[15px] font-semibold py-3 px-4 rounded-xl transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-[#d6d6db] hover:bg-white/5 hover:text-white'}`}
              >
                Dashboard
              </NavLink>
            ) : (
              <NavLink 
                to="/login" 
                onClick={closeMenu} 
                className={({ isActive }) => `text-[15px] font-semibold py-3 px-4 rounded-xl transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-[#d6d6db] hover:bg-white/5 hover:text-white'}`}
              >
                Login
              </NavLink>
            )}

            <div className="h-px bg-white/10 my-2" />

            {user ? (
              <button onClick={() => { logout(); closeMenu(); }} className="btn btn-ghost btn-md w-full justify-center" type="button">Logout</button>
            ) : (
              <Link className="btn btn-primary btn-md w-full justify-center text-center" to="/register" onClick={closeMenu}>Get Started</Link>
            )}
          </div>
        )}
      </header>

      <main>{children}</main>
    </div>
  );
}