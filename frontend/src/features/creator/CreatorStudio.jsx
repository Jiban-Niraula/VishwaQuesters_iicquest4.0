import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardLayout from '../../shared/layout/DashboardLayout.jsx';
import Card from '../../shared/components/Card.jsx';
import Button from '../../shared/components/Button.jsx';
import Badge from '../../shared/components/Badge.jsx';
import EmptyState from '../../shared/components/EmptyState.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { eventsApi } from '../../shared/api/events.js';
import { destinationsApi } from '../../shared/api/destinations.js';
import { adsApi } from '../../shared/api/ads.js';
import { apiError } from '../../shared/api/http.js';
import { config } from '../../app/config.js';
import { authStorage } from '../../shared/utils/storage.js';
import { mediaUrl, money } from '../../shared/utils/format.js';
import { useSignalSocket } from '../../studio/useSignalSocket.js';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

function RemoteVideo({ stream, active, onClick, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return <button className={`camera-tile ${active ? 'active' : ''}`} onClick={onClick}><video ref={ref} autoPlay playsInline muted={false} /><span>{label}</span></button>;
}

export default function CreatorStudio() {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [meta, setMeta] = useState({ cameraLimit: 4, creatorPlan: 'free' });
  const [destinations, setDestinations] = useState([]);
  const [ads, setAds] = useState([]);
  const [currentAd, setCurrentAd] = useState(null);
  const [cameras, setCameras] = useState({});
  const [selectedCamera, setSelectedCamera] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [destForm, setDestForm] = useState({ platform: 'youtube', stream_key: '', server_url: '' });
  const peers = useRef({});
  const recorderRef = useRef(null);
  const streamWsRef = useRef(null);
  const selectedStream = cameras[selectedCamera]?.stream;
  const { connected, send, on } = useSignalSocket(event?.code || '', 'studio', 'studio');
  const cameraLink = event ? `${window.location.origin}/camera?session=${encodeURIComponent(event.code)}` : '';

  async function load() {
    const data = await eventsApi.get(eventId);
    setEvent(data.event);
    setMeta({ cameraLimit: data.cameraLimit, creatorPlan: data.creatorPlan });
    const dests = await destinationsApi.list(eventId).catch(() => []);
    setDestinations(Array.isArray(dests) ? dests : []);
    const market = await adsApi.marketplace().catch(() => ({ ads: [] }));
    setAds(market.ads || []);
  }

  useEffect(() => { load().catch((err) => setError(apiError(err))); }, [eventId]);

  useEffect(() => {
    if (!event) return undefined;
    const offJoined = on('client_joined', (msg) => {
      const role = msg.data?.role;
      if (role === 'camera') send('request_offer', { event_id: event.id }, msg.from);
    });
    const offOffer = on('offer', async (msg) => {
      try {
        const pc = new RTCPeerConnection(ICE);
        peers.current[msg.from] = pc;
        const remoteStream = new MediaStream();
        pc.ontrack = (ev) => {
          ev.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
          setCameras((prev) => {
            const next = { ...prev, [msg.from]: { id: msg.from, stream: remoteStream, type: 'camera' } };
            if (!selectedCamera) setSelectedCamera(msg.from);
            return next;
          });
        };
        pc.onicecandidate = (ev) => { if (ev.candidate) send('candidate', { candidate: ev.candidate }, msg.from); };
        await pc.setRemoteDescription(new RTCSessionDescription(msg.data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send('answer', { answer }, msg.from);
      } catch (err) {
        setError(err.message || 'Failed to receive camera offer');
      }
    });
    const offCandidate = on('candidate', async (msg) => {
      const pc = peers.current[msg.from];
      if (pc && msg.data?.candidate) await pc.addIceCandidate(new RTCIceCandidate(msg.data.candidate));
    });
    const offLeft = on('client_left', (msg) => {
      peers.current[msg.from]?.close?.();
      delete peers.current[msg.from];
      setCameras((prev) => {
        const next = { ...prev };
        delete next[msg.from];
        return next;
      });
      if (selectedCamera === msg.from) setSelectedCamera('');
    });
    return () => { offJoined(); offOffer(); offCandidate(); offLeft(); };
  }, [event, on, send, selectedCamera]);

  const cameraList = useMemo(() => Object.values(cameras), [cameras]);

  async function createDestination(e) {
    e.preventDefault();
    setError(''); setNotice('');
    try {
      await destinationsApi.create({ event_id: Number(eventId), ...destForm });
      setDestForm({ platform: 'youtube', stream_key: '', server_url: '' });
      const updated = await destinationsApi.list(eventId);
      setDestinations(Array.isArray(updated) ? updated : []);
      setNotice('Destination added');
    } catch (err) { setError(apiError(err)); }
  }

  async function startDestination(dest) {
    setError(''); setNotice('');
    if (!selectedStream) {
      setError('Select a camera before starting RTMP stream.');
      return;
    }
    try {
      await destinationsApi.start(dest.id);
      const ws = new WebSocket(`${config.streamWsUrl}?token=${encodeURIComponent(authStorage.getToken())}&dest_id=${dest.id}`);
      streamWsRef.current = ws;
      ws.onopen = () => {
        const recorder = new MediaRecorder(selectedStream, { mimeType: 'video/webm;codecs=vp8,opus' });
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(event.data);
        };
        recorder.start(1000);
        setNotice(`RTMP streaming started for ${dest.platform}.`);
        setDestinations((prev) => prev.map((item) => item.id === dest.id ? { ...item, isActive: true } : item));
      };
      ws.onerror = () => setError('RTMP WebSocket failed. Check backend/FFmpeg.');
    } catch (err) { setError(apiError(err)); }
  }

  async function stopDestination(dest) {
    recorderRef.current?.stop?.();
    streamWsRef.current?.close?.();
    recorderRef.current = null;
    streamWsRef.current = null;
    try { await destinationsApi.stop(dest.id); } catch {}
    setDestinations((prev) => prev.map((item) => item.id === dest.id ? { ...item, isActive: false } : item));
    setNotice('RTMP streaming stopped.');
  }

  async function playAd(item) {
    setError(''); setNotice('');
    try {
      const ad = item.ad || item;
      const data = await adsApi.play({ ad_id: ad.id, event_id: Number(eventId) });
      setCurrentAd({ ad, placement: data.placement, startedAt: Date.now(), payout: data.earnedAmount });
      setNotice('Sponsored ad started. Complete it after playback to receive payout.');
    } catch (err) { setError(apiError(err)); }
  }

  async function completeAd() {
    if (!currentAd) return;
    const watched = currentAd.ad.type === 'video' ? currentAd.ad.durationSeconds : Math.max(1, Math.round((Date.now() - currentAd.startedAt) / 1000));
    try {
      await adsApi.completePlacement(currentAd.placement.id, { watched_seconds: watched });
      setCurrentAd(null);
      setNotice('Ad completed. Payout credited to wallet.');
      const market = await adsApi.marketplace();
      setAds(market.ads || []);
    } catch (err) { setError(apiError(err)); }
  }

  return (
    <DashboardLayout title="Production Studio" subtitle={event ? `${event.title} • ${event.code}` : 'Loading studio'} actions={<Link className="btn btn-secondary" to="/creator/events"><i className="fa-solid fa-arrow-left" /> Events</Link>}>
      {error && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}
      <div className="studio-grid">
        <section className="studio-preview card">
          <div className="studio-preview-top"><span><span className={`connection-dot ${connected ? 'ok' : ''}`} /> {connected ? 'Signaling connected' : 'Connecting studio'}</span><Badge tone={meta.creatorPlan === 'pro' ? 'success' : 'warning'}>{meta.creatorPlan} plan</Badge></div>
          <div className="program-monitor">
            {selectedStream ? <RemoteVideo stream={selectedStream} active label="Program" /> : <div className="program-empty"><i className="fa-solid fa-video-slash" /><h3>No camera selected</h3><p>Open the camera link on a phone or browser.</p></div>}
            {currentAd && <div className="ad-overlay"><strong>{currentAd.ad.title}</strong><span>{money(currentAd.payout)} payout after completion</span>{currentAd.ad.type === 'image' ? <img src={mediaUrl(currentAd.ad.mediaUrl, config.uploadBase)} /> : <video src={mediaUrl(currentAd.ad.mediaUrl, config.uploadBase)} autoPlay muted />}</div>}
          </div>
          <div className="studio-toolbar"><Button variant="secondary" onClick={() => navigator.clipboard.writeText(cameraLink)} icon="fa-solid fa-link">Copy camera link</Button><code>{cameraLink}</code></div>
        </section>
        <aside className="studio-side">
          <Card title="Cameras" icon="fa-solid fa-camera">
            {cameraList.length === 0 ? <EmptyState title="No cameras connected" text={`Free camera limit: ${meta.cameraLimit === -1 ? 'Unlimited' : meta.cameraLimit}`} /> : <div className="camera-list">{cameraList.map((cam) => <RemoteVideo key={cam.id} stream={cam.stream} label={cam.id} active={selectedCamera === cam.id} onClick={() => setSelectedCamera(cam.id)} />)}</div>}
          </Card>
          <Card title="RTMP Destinations" icon="fa-solid fa-satellite-dish">
            <form onSubmit={createDestination} className="form-grid compact">
              <select value={destForm.platform} onChange={(e) => setDestForm({ ...destForm, platform: e.target.value })}><option value="youtube">YouTube</option><option value="facebook">Facebook</option><option value="twitch">Twitch</option><option value="custom">Custom</option></select>
              {destForm.platform === 'custom' && <input placeholder="Server URL" value={destForm.server_url} onChange={(e) => setDestForm({ ...destForm, server_url: e.target.value })} />}
              <input placeholder="Stream key" value={destForm.stream_key} onChange={(e) => setDestForm({ ...destForm, stream_key: e.target.value })} required />
              <Button size="sm" icon="fa-solid fa-plus">Add destination</Button>
            </form>
            <div className="list-stack mini">{destinations.map((dest) => <div className="list-row" key={dest.id}><span><strong>{dest.platform}</strong><small>{dest.serverUrl}</small></span>{dest.isActive ? <Button size="sm" variant="danger" onClick={() => stopDestination(dest)}>Stop</Button> : <Button size="sm" variant="primary" onClick={() => startDestination(dest)}>Go live</Button>}</div>)}</div>
          </Card>
          <Card title="Sponsored Ads" icon="fa-solid fa-rectangle-ad">
            {currentAd && <Button variant="success" onClick={completeAd} icon="fa-solid fa-check">Complete current ad</Button>}
            {ads.length === 0 ? <EmptyState title="No approved ads" /> : <div className="list-stack mini">{ads.slice(0, 8).map((item) => { const ad = item.ad || item; return <div className="list-row" key={ad.id}><span><strong>{ad.title}</strong><small>{ad.type} • payout {money(item.yourPayout)}</small></span><Button size="sm" onClick={() => playAd(item)}>Play</Button></div>; })}</div>}
          </Card>
        </aside>
      </div>
    </DashboardLayout>
  );
}
