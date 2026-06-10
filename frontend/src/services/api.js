const RAW_API_BASE = import.meta.env.VITE_API_URL || '';
const API_BASE = RAW_API_BASE.replace(/\/api\/?$/, '');

function getToken() {
  return localStorage.getItem('streamangle_token') || '';
}

function getAuthHeaders(extra = {}) {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function readJson(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) throw new Error(data?.error || data?.message || 'Request failed');
  return data;
}

function normalizeEvent(event) {
  if (!event) return event;
  return {
    ...event,
    name: event.name || event.title,
    title: event.title || event.name,
    unique_code: event.unique_code || event.code,
    code: event.code || event.unique_code,
    is_live: typeof event.is_live === 'boolean' ? event.is_live : !!event.isLive,
    status: event.status || (event.isLive || event.is_live ? 'live' : 'draft'),
  };
}

function normalizeDestination(dest) {
  if (!dest) return dest;
  return {
    ...dest,
    server_url: dest.server_url || dest.serverUrl,
    is_active: typeof dest.is_active === 'boolean' ? dest.is_active : !!dest.isActive,
    isActive: typeof dest.isActive === 'boolean' ? dest.isActive : !!dest.is_active,
  };
}

function normalizeOverlay(row) {
  if (!row) return row;
  let parsed = null;
  if (typeof row.content === 'string') {
    try { parsed = JSON.parse(row.content); } catch { parsed = null; }
  }
  if (parsed && typeof parsed === 'object') {
    return {
      ...parsed,
      id: row.id,
      name: row.name || parsed.name || parsed.title,
      title: parsed.title || row.name,
      type: parsed.type || row.type,
      content: parsed.content || '',
      position: parsed.position || 'top-right',
      duration: parsed.duration || 0,
      rawContent: row.content,
    };
  }
  return {
    ...row,
    title: row.title || row.name,
    position: row.position || 'top-right',
    duration: row.duration || 0,
  };
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return readJson(res);
}

export async function register(email, password, name = '', role = 'creator') {
  const res = await fetch(`${API_BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: name || email.split('@')[0], role }),
  });
  return readJson(res);
}

export async function createEvent(name, description = '') {
  const res = await fetch(`${API_BASE}/api/events`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title: name, description }),
  });
  return normalizeEvent(await readJson(res));
}

export async function getEvents() {
  const res = await fetch(`${API_BASE}/api/events`, { headers: getAuthHeaders() });
  const data = await readJson(res);
  return Array.isArray(data) ? data.map(normalizeEvent) : [];
}

export async function updateEvent(id, updates) {
  const payload = { ...updates };
  if ('name' in payload && !('title' in payload)) {
    payload.title = payload.name;
    delete payload.name;
  }
  if ('status' in payload) {
    payload.is_live = payload.status === 'live';
    delete payload.status;
  }
  const res = await fetch(`${API_BASE}/api/events/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return normalizeEvent(await readJson(res));
}

export async function deleteEvent(id) {
  const res = await fetch(`${API_BASE}/api/events/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return readJson(res);
}

export async function createOverlay(_eventId, overlay) {
  const stored = {
    ...overlay,
    name: overlay.name || overlay.title || overlay.type,
  };
  const res = await fetch(`${API_BASE}/api/overlays`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: stored.title || stored.name || 'Overlay',
      type: stored.type,
      content: JSON.stringify(stored),
    }),
  });
  return normalizeOverlay(await readJson(res));
}

export async function getOverlays(_eventId) {
  const res = await fetch(`${API_BASE}/api/overlays`, { headers: getAuthHeaders() });
  const data = await readJson(res);
  return Array.isArray(data) ? data.map(normalizeOverlay) : [];
}

export async function updateOverlay(id, updates) {
  const existing = normalizeOverlay((await getOverlays()).find((o) => String(o.id) === String(id)) || {});
  const merged = { ...existing, ...updates };
  const res = await fetch(`${API_BASE}/api/overlays/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: merged.title || merged.name || 'Overlay',
      type: merged.type || 'text',
      content: JSON.stringify(merged),
    }),
  });
  return normalizeOverlay(await readJson(res));
}

export async function deleteOverlay(id) {
  const res = await fetch(`${API_BASE}/api/overlays/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return readJson(res);
}

export async function addDestination(eventId, destination) {
  const res = await fetch(`${API_BASE}/api/destinations`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      event_id: eventId,
      platform: destination.platform,
      stream_key: destination.stream_key || destination.streamKey,
      server_url: destination.server_url || destination.serverUrl || '',
    }),
  });
  return normalizeDestination(await readJson(res));
}

export async function getDestinations(eventId) {
  const res = await fetch(`${API_BASE}/api/destinations?event_id=${encodeURIComponent(eventId)}`, {
    headers: getAuthHeaders(),
  });
  const data = await readJson(res);
  return Array.isArray(data) ? data.map(normalizeDestination) : [];
}

export async function updateDestination(id, updates) {
  const payload = { ...updates };
  if ('is_active' in payload) payload.is_active = !!payload.is_active;
  if ('serverUrl' in payload && !('server_url' in payload)) payload.server_url = payload.serverUrl;
  if ('streamKey' in payload && !('stream_key' in payload)) payload.stream_key = payload.streamKey;
  const res = await fetch(`${API_BASE}/api/destinations/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return normalizeDestination(await readJson(res));
}

export async function deleteDestination(id) {
  const res = await fetch(`${API_BASE}/api/destinations/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return readJson(res);
}

export async function startRTMPStream(eventIdOrDestinationId) {
  // V1 Studio passes event ID. The fixed V2 backend starts streams per destination.
  const destinations = await getDestinations(eventIdOrDestinationId).catch(() => []);
  const active = destinations.filter((d) => d.is_active || d.isActive);
  if (active.length === 0) return { message: 'No active RTMP destination selected' };
  const started = [];
  for (const dest of active) {
    const res = await fetch(`${API_BASE}/api/stream/start`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ destination_id: dest.id }),
    });
    started.push(await readJson(res));
  }
  return { started };
}

export async function stopRTMPStream(eventIdOrDestinationId) {
  const destinations = await getDestinations(eventIdOrDestinationId).catch(() => []);
  const active = destinations.filter((d) => d.is_active || d.isActive);
  const stopped = [];
  for (const dest of active) {
    const res = await fetch(`${API_BASE}/api/stream/stop`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ destination_id: dest.id }),
    });
    stopped.push(await readJson(res));
  }
  return { stopped };
}

export async function sendStreamChunk(_chunk) {
  return true;
}

export async function getSponsoredAds() {
  const res = await fetch(`${API_BASE}/api/ads/marketplace`, { headers: getAuthHeaders() });
  const data = await readJson(res);
  return data.ads || data || [];
}

export async function playSponsoredAd(adId, eventId) {
  const res = await fetch(`${API_BASE}/api/ads/play`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ad_id: adId, event_id: eventId }),
  });
  return readJson(res);
}

export async function completeSponsoredAdPlacement(placementId, watchedSeconds) {
  const res = await fetch(`${API_BASE}/api/ads/placement/${placementId}/complete`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ watched_seconds: watchedSeconds }),
  });
  return readJson(res);
}

export function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path;
  const uploadBase = import.meta.env.VITE_PUBLIC_UPLOAD_BASE || import.meta.env.VITE_UPLOAD_BASE || API_BASE || '';
  const base = uploadBase.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const api = {
  login,
  register,
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  createOverlay,
  getOverlays,
  updateOverlay,
  deleteOverlay,
  addDestination,
  getDestinations,
  updateDestination,
  deleteDestination,
  startRTMPStream,
  sendStreamChunk,
  stopRTMPStream,
  getSponsoredAds,
  playSponsoredAd,
  completeSponsoredAdPlacement,
  resolveMediaUrl,
};
