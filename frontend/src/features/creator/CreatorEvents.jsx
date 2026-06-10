import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Button from '../../shared/components/Button.jsx';
import Badge from '../../shared/components/Badge.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { eventsApi } from '../../shared/api/events.js';
import { apiError } from '../../shared/api/http.js';

export default function CreatorEvents() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ title: '', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    try { setEvents(await eventsApi.list()); } catch (err) { setError(apiError(err)); }
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await eventsApi.create(form);
      setForm({ title: '', description: '' });
      await load();
    } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }

  async function remove(id) {
    if (!confirm('Delete this event?')) return;
    await eventsApi.remove(id);
    await load();
  }

  return (
    <DashboardLayout title="My Events" subtitle="Create events, connect cameras, and open your production studio.">
      {error && <Alert type="error">{error}</Alert>}

      <div className="grid-2 align-start">
        <Card title="Create New Event" icon="fa-solid fa-calendar-plus">
          <form onSubmit={create} className="form-grid">
            <label>
              Event title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="e.g. Football Final, School Concert"
              />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows="3"
                placeholder="Optional short description"
              />
            </label>
            <Button loading={loading} icon="fa-solid fa-calendar-plus">Create event</Button>
          </form>
        </Card>

        <Card title="All Events" icon="fa-solid fa-calendar-days">
          {events.length === 0
            ? <EmptyState title="No events yet" text="Create an event to open studio and connect cameras." />
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Code</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <strong>{ev.title}</strong>
                          {ev.description && <small>{ev.description}</small>}
                        </td>
                        <td><code>{ev.code}</code></td>
                        <td><Badge tone={ev.isLive ? 'success' : 'neutral'}>{ev.isLive ? 'Live' : 'Draft'}</Badge></td>
                        <td>
                          <div className="table-actions">
                            <Link className="btn btn-primary btn-sm" to={`/creator/studio/${ev.code || ev.unique_code || ev.id}`}>
                              <i className="fa-solid fa-clapperboard" /> Studio
                            </Link>
                            <Button size="sm" variant="danger" onClick={() => remove(ev.id)}>
                              <i className="fa-solid fa-trash" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
