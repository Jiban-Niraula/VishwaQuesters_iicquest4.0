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

    const id = generateID();
    clientIdRef.current = id;
    setClientID(id);

    const connect = () => {
      if (!shouldReconnect) return;

      const wsUrl = `${WS_BASE}/ws?code=${encodeURIComponent(sessionCode)}`;
      const ws = new WebSocket(wsUrl);

      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS] Connected as ${role} to room ${sessionCode}`);
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

      ws.onclose = () => {
        setIsConnected(false);

        if (!shouldReconnect) return;

        console.log("[WS] Disconnected, reconnecting in 3s...");
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      shouldReconnect = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
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
