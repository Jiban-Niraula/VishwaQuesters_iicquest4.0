import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Loading from '../../shared/components/Loading.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { eventsApi } from '../../shared/api/events.js';
import { apiError } from '../../shared/api/http.js';

export default function CreatorStudioRedirect() {
  const { eventId } = useParams();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await eventsApi.get(eventId);
        const event = data.event || data;
        if (mounted) setCode(event.code || event.unique_code || String(event.id));
      } catch (err) {
        if (mounted) setError(apiError(err));
      }
    }
    load();
    return () => { mounted = false; };
  }, [eventId]);

  if (error) return <div style={{ padding: 24 }}><Alert type="error">{error}</Alert></div>;
  if (!code) return <Loading label="Opening full production studio..." />;
  return <Navigate to={`/creator/studio/${code}`} replace />;
}
