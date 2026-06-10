import { Link } from 'react-router-dom';
import { config } from '../../app/config.js';

const appName = config.appName === 'StreamAngle' ? 'Vision Cast' : config.appName;

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <Link className="brand auth-brand" to="/">
        <span><i className="fa-solid fa-tower-broadcast" /></span>
        {appName}
      </Link>
      <div className="auth-right">
        <div className="auth-card">
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
