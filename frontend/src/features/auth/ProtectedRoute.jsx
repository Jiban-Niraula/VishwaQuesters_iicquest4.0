import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Loading from '../../shared/components/Loading.jsx';
import { useAuth } from './AuthContext.jsx';

export default function ProtectedRoute() {
  const { isAuthed, booting } = useAuth();
  const location = useLocation();

  if (booting) return <div className="center-screen"><Loading label="Checking session" /></div>;
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
