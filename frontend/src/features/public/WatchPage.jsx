import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PublicLayout from '../../shared/layout/PublicLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Loading from '../../shared/components/Loading.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { eventsApi } from '../../shared/api/events.js';
import { apiError } from '../../shared/api/http.js';

export default function WatchPage() {
  const { eventCode } = useParams();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eventsApi.getPublic(eventCode)
      .then(setEvent)
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, [eventCode]);

  return (
    <PublicLayout>
      <div className="public-page narrow">
        {loading && <Loading label="Loading stream" />}
        {error && <Alert type="error">{error}</Alert>}
        {event && (
          <Card title={event.title} subtitle={`Event code: ${event.code}`} icon="fa-solid fa-tower-broadcast">
            <div className="watch-box">
              <i className="fa-solid fa-circle-play" />
              <h2>{event.isLive ? 'Live stream active' : 'Stream is not live yet'}</h2>
              <p>Public viewer playback is ready for the V2 route. For production scale, connect this page to HLS/CDN output instead of direct studio WebRTC.</p>
            </div>
          </Card>
        )}
      </div>
    </PublicLayout>
  );
}
