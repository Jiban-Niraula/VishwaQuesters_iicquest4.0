import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../app/config.js';

export function useSignalSocket(sessionCode, role, cameraType = 'browser') {
  const wsRef = useRef(null);
  const listenersRef = useRef({});
  const [clientId, setClientId] = useState('');
  const [connected, setConnected] = useState(false);
  const [joinError, setJoinError] = useState('');

  const on = useCallback((type, handler) => {
    listenersRef.current[type] = listenersRef.current[type] || [];
    listenersRef.current[type].push(handler);
    return () => {
      listenersRef.current[type] = (listenersRef.current[type] || []).filter((item) => item !== handler);
    };
  }, []);

  const send = useCallback((type, data = {}, target = '') => {
    const id = clientId || `${role}_${Date.now()}`;
    const payload = { type, from: id, data };
    if (target) payload.target = target;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, [clientId, role]);

  useEffect(() => {
    if (!sessionCode) return undefined;
    const id = `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setClientId(id);
    setJoinError('');
    const ws = new WebSocket(`${config.wsUrl}?code=${encodeURIComponent(sessionCode)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'join', from: id, data: { room_code: sessionCode, role, camera_type: cameraType } }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'join_rejected') setJoinError(msg.message || 'Join rejected');
        const handlers = listenersRef.current[msg.type] || [];
        handlers.forEach((handler) => handler(msg));
        const all = listenersRef.current['*'] || [];
        all.forEach((handler) => handler(msg));
      } catch (error) {
        console.error('Invalid websocket message', error);
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => ws.close();
  }, [sessionCode, role, cameraType]);

  return { connected, clientId, send, on, joinError };
}
