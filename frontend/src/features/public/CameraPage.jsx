import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PublicLayout from '../../shared/layout/PublicLayout.jsx';
import Button from '../../shared/components/Button.jsx';
import Alert from '../../shared/components/Toast.jsx';
import { useSignalSocket } from '../../studio/useSignalSocket.js';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

export default function CameraPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('session') || '');
  const [joined, setJoined] = useState(false);
  const [cameraType, setCameraType] = useState('phone');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const { connected, send, on, joinError } = useSignalSocket(joined ? code : '', 'camera', cameraType);

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      setError(err.message || 'Camera access failed');
      return null;
    }
  }

  async function createOffer(target) {
    const stream = streamRef.current || await startCamera();
    if (!stream) return;
    const pc = new RTCPeerConnection(ICE);
    peerRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (event) => {
      if (event.candidate) send('candidate', { candidate: event.candidate }, target);
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send('offer', { offer }, target);
  }

  useEffect(() => {
    if (!joined) return undefined;
    const offRequest = on('request_offer', (msg) => createOffer(msg.from));
    const offAnswer = on('answer', async (msg) => {
      if (peerRef.current && msg.data?.answer) await peerRef.current.setRemoteDescription(new RTCSessionDescription(msg.data.answer));
    });
    const offCandidate = on('candidate', async (msg) => {
      if (peerRef.current && msg.data?.candidate) await peerRef.current.addIceCandidate(new RTCIceCandidate(msg.data.candidate));
    });
    return () => { offRequest(); offAnswer(); offCandidate(); };
  }, [joined, on, send]);

  async function join() {
    if (!code.trim()) {
      setError('Enter event/session code');
      return;
    }
    const stream = await startCamera();
    if (stream) setJoined(true);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
  }

  return (
    <PublicLayout>
      <div className="camera-page">
        <div className="camera-card">
          <div className="section-title"><h1>Camera Join</h1><p>Use your phone or browser camera as a live source in creator studio.</p></div>
          {error && <Alert type="error">{error}</Alert>}
          {joinError && <Alert type="error">{joinError}</Alert>}
          {!joined && (
            <div className="form-grid">
              <label>Event code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="AB-CDE" /></label>
              <label>Camera type<select value={cameraType} onChange={(e) => setCameraType(e.target.value)}><option value="phone">Phone</option><option value="dslr">DSLR / Capture Card</option><option value="usb">USB Camera</option></select></label>
              <Button onClick={join} icon="fa-solid fa-camera">Start camera and join</Button>
            </div>
          )}
          <div className="camera-preview-wrap"><video ref={videoRef} autoPlay playsInline muted className="camera-preview" /></div>
          {joined && <div className="studio-toolbar"><span className={`connection-dot ${connected ? 'ok' : ''}`} /> {connected ? 'Connected to studio' : 'Connecting'}<Button variant="secondary" onClick={toggleMute} icon={muted ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone'}>{muted ? 'Unmute' : 'Mute'}</Button></div>}
        </div>
      </div>
    </PublicLayout>
  );
}
