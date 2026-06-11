import { useRef, useEffect, useState, useCallback } from "react";

function getWsBase() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  let base =
    import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;

  base = String(base).trim().replace(/\/+$/, "");

  // If someone accidentally sets VITE_WS_URL=ws://localhost:8080/ws,
  // remove the /ws because this hook already appends /ws below.
  if (base.endsWith("/ws")) {
    base = base.slice(0, -3);
  }

  return base;
}

const WS_BASE = getWsBase();

export default function useWebSocket(
  sessionCode,
  role = "camera",
  cameraType = "phone",
) {
  const wsRef = useRef(null);
  const listenersRef = useRef({});
  const messageQueueRef = useRef([]);
  const reconnectTimeoutRef = useRef(null);
  const clientIdRef = useRef("");
  const mountedRef = useRef(false); // ✅ FIX: Track real mount state to prevent StrictMode double-close

  const [isConnected, setIsConnected] = useState(false);
  const [clientID, setClientID] = useState("");

  const generateID = () => {
    return `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  };

  const send = useCallback((type, data = {}, target = null) => {
    const from = clientIdRef.current;

    const message = {
      type,
      from,
      data,
    };

    // IMPORTANT:
    // target must stay top-level, not inside data.
    // Studio and Watch both depend on this for direct WebRTC routing.
    if (target) {
      message.target = target;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      messageQueueRef.current.push(message);
    }
  }, []);

  const on = useCallback((type, callback) => {
    if (!listenersRef.current[type]) {
      listenersRef.current[type] = [];
    }

    listenersRef.current[type].push(callback);
  }, []);

  const off = useCallback((type, callback) => {
    if (!listenersRef.current[type]) return;

    listenersRef.current[type] = listenersRef.current[type].filter(
      (cb) => cb !== callback,
    );
  }, []);

  useEffect(() => {
    if (!sessionCode) return;

    let shouldReconnect = true;
    mountedRef.current = true; // ✅ Mark as truly mounted

    const id = generateID();
    clientIdRef.current = id;
    setClientID(id);

    let reconnectAttempt = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;

    const connect = () => {
      if (!shouldReconnect || !mountedRef.current) return; // ✅ Check mount state

      const wsUrl = `${WS_BASE}/ws?code=${encodeURIComponent(sessionCode)}`;
      const ws = new WebSocket(wsUrl);

      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          // ✅ Guard: don't act if unmounted
          ws.close();
          return;
        }
        console.log(`[WS] Connected as ${role} to room ${sessionCode}`);
        reconnectAttempt = 0; // ✅ Reset reconnect counter on success
        setIsConnected(true);

        ws.send(
          JSON.stringify({
            type: "join",
            from: id,
            data: {
              room_code: sessionCode,
              role,
              camera_type: cameraType,
            },
          }),
        );

        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift();
          ws.send(JSON.stringify(msg));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Direct target protection.
          // If message is targeted to another client, ignore it here.
          if (msg.target && msg.target !== clientIdRef.current) {
            return;
          }

          const listeners = listenersRef.current[msg.type] || [];
          listeners.forEach((cb) => cb(msg));

          const wildcards = listenersRef.current["*"] || [];
          wildcards.forEach((cb) => cb(msg));
        } catch (err) {
          console.error("[WS] Message parse error:", err);
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return; // ✅ Don't reconnect if unmounted
        setIsConnected(false);

        if (!shouldReconnect) return;

        reconnectAttempt++;
        if (reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
          console.error(
            `[WS] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping.`,
          );
          return;
        }

        // ✅ Exponential backoff: 2s, 4s, 8s, 16s, capped at 16s
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempt - 1), 16000);
        console.log(
          `[WS] Disconnected (code=${event.code}), reconnecting in ${delay}ms... (attempt ${reconnectAttempt})`,
        );
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        // ✅ Don't call ws.close() here - let onclose handle reconnection naturally
      };
    };

    // ✅ Delay initial connection slightly to survive StrictMode's double-mount/unmount cycle
    const initialTimeout = setTimeout(() => {
      if (mountedRef.current && shouldReconnect) {
        connect();
      }
    }, 100);

    return () => {
      shouldReconnect = false;
      mountedRef.current = false; // ✅ Mark as unmounted
      clearTimeout(initialTimeout);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        // ✅ Only close if the WebSocket is not already closing/closed
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close();
        }
      }

      setIsConnected(false);
    };
  }, [sessionCode, role, cameraType]);

  return {
    isConnected,
    clientID,
    send,
    on,
    off,
  };
}
