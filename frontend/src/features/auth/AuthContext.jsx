import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../shared/api/auth.js';
import { authStorage } from '../../shared/utils/storage.js';

const AuthContext = createContext(null);

function roleHome(role) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'company') return '/company/dashboard';
  return '/creator/dashboard';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStorage.getUser());
  const [token, setToken] = useState(() => authStorage.getToken());
  const [booting, setBooting] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    async function boot() {
      const storedToken = authStorage.getToken();
      if (!storedToken) {
        setBooting(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (!mounted) return;
        setUser(me);
        authStorage.setUser(me);
      } catch {
        authStorage.clearAll();
        setUser(null);
        setToken(null);
      } finally {
        if (mounted) setBooting(false);
      }
    }
    boot();
    return () => { mounted = false; };
  }, []);

  async function login(payload) {
    const data = await authApi.login(payload);
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    setToken(data.token);
    setUser(data.user);
    navigate(roleHome(data.user.role), { replace: true });
  }

  async function register(payload) {
    const data = await authApi.register(payload);
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    setToken(data.token);
    setUser(data.user);
    navigate(roleHome(data.user.role), { replace: true });
  }

  function logout() {
    authStorage.clearAll();
    setToken(null);
    setUser(null);
    navigate('/login', { replace: true });
  }

  const value = useMemo(() => ({ user, token, booting, isAuthed: !!token, login, register, logout, refreshMe: async () => {
    const me = await authApi.me();
    setUser(me);
    authStorage.setUser(me);
    return me;
  } }), [user, token, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
