import { Link } from 'react-router-dom';
import PublicLayout from '../../shared/layout/PublicLayout.jsx';

export default function NotFound() {
  return (
    <PublicLayout>
      <div className="center-section">
        <i className="fa-regular fa-compass big-icon" />
        <h1>Page not found</h1>
        <p>The page you opened does not exist in StreamAngle V2.</p>
        <Link className="btn btn-primary" to="/">Go home</Link>
      </div>
    </PublicLayout>
  );
}
