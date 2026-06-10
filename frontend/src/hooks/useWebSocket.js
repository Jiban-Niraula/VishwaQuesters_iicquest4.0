import { useRef, useEffect, useState, useCallback } from "react";

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const WS_BASE = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;

export default function useWebSocket(
  sessionCode,
  role = "camera",
  cameraType = "phone",
) {
  const wsRef = useRef(null);
  const listenersRef = useRef({});
  const [isConnected, setIsConnected] = useState(false);
  const [clientID, setClientID] = useState("");
  const messageQueueRef = useRef([]);
  const reconnectTimeoutRef = useRef(null);

  const generateID = () => {
    return `${role}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const send = useCallback(
    (type, data = {}, target = null) => {
      const message = {
        type,
        from: clientID,
        data: data,
      };

      // top-level target so the server can route to a specific client
      if (target) {
        message.target = target;
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      } else {
        messageQueueRef.current.push(message);
      }
    },
    [clientID],
  );

  const on = useCallback((type, callback) => {
    if (!listenersRef.current[type]) {
      listenersRef.current[type] = [];
    }
    listenersRef.current[type].push(callback);
  }, []);

  const off = useCallback((type, callback) => {
    if (listenersRef.current[type]) {
      listenersRef.current[type] = listenersRef.current[type].filter(
        (cb) => cb !== callback,
      );
    }
  }, []);

  useEffect(() => {
    if (!sessionCode) return;

    const id = generateID();
    setClientID(id);

    const connect = () => {
      // Include session code as query parameter
      const ws = new WebSocket(`${WS_BASE}/ws?code=${sessionCode}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS] Connected as ${role} to room ${sessionCode}`);
        setIsConnected(true);

        // Send join message
        ws.send(
          JSON.stringify({
            type: "join",
            from: id,
            data: {
              room_code: sessionCode,
              role: role,
              camera_type: cameraType,
            },
          }),
        );

        // Send queued messages
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift();
          ws.send(JSON.stringify(msg));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const listeners = listenersRef.current[msg.type] || [];
          listeners.forEach((cb) => cb(msg));
          // Also fire wildcard listeners
          const wildcards = listenersRef.current["*"] || [];
          wildcards.forEach((cb) => cb(msg));
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected, reconnecting in 3s...");
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionCode, role, cameraType]);

  return { isConnected, clientID, send, on, off };
}
