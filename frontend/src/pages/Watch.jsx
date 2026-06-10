import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import useWebSocket from "../hooks/useWebSocket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

export default function Watch() {
  const { eventCode } = useParams();

  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const clientIdRef = useRef(null);
  const studioIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [liveStartTime, setLiveStartTime] = useState(null);
  const [connectionText, setConnectionText] = useState(
    "Connecting to stream...",
  );

  const { isConnected, clientID, send, on, off } = useWebSocket(
    eventCode,
    "viewer",
  );

  useEffect(() => {
    if (clientID) {
      clientIdRef.current = clientID;
    }
  }, [clientID]);

  useEffect(() => {
    if (!isConnected) {
      setConnectionText("Connecting to stream...");
      return;
    }

    setConnectionText("Waiting for Studio to go live...");
    send("viewer_ready", {});

    const interval = setInterval(() => {
      if (!videoRef.current?.srcObject && isConnected) {
        send("viewer_ready", {});
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isConnected, send]);

  useEffect(() => {
    const handleOffer = async (msg) => {
      // target is top-level, not inside data.
      if (msg.target && msg.target !== clientIdRef.current) return;
      if (!msg.data?.offer) return;

      console.log("[Watch] Received offer from Studio:", msg.from);
      setConnectionText("Receiving live signal...");

      studioIdRef.current = msg.from;

      if (peerConnectionRef.current) {
        try {
          peerConnectionRef.current.close();
        } catch {}
        peerConnectionRef.current = null;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;

      pc.ontrack = async (event) => {
        console.log("[Watch] Got track from Studio:", event.track.kind);

        if (videoRef.current && event.streams && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];

          try {
            await videoRef.current.play();
          } catch (err) {
            console.warn(
              "[Watch] Autoplay blocked until user interaction:",
              err,
            );
          }

          setIsLive(true);
          setConnectionText("");
          setLiveStartTime((prev) => prev || Date.now());
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && studioIdRef.current) {
          send(
            "candidate",
            { candidate: event.candidate },
            studioIdRef.current,
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[Watch] ICE state:", pc.iceConnectionState);

        if (
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected"
        ) {
          setConnectionText("Stream connection interrupted. Reconnecting...");
          setIsLive(false);
          send("viewer_ready", {});
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("[Watch] Peer state:", pc.connectionState);

        if (pc.connectionState === "connected") {
          setConnectionText("");
          setIsLive(true);
        }

        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed" ||
          pc.connectionState === "disconnected"
        ) {
          setIsLive(false);
        }
      };

      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(msg.data.offer),
        );

        for (const candidate of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (err) {
            console.warn("[Watch] Failed to add queued ICE candidate:", err);
          }
        }

        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // IMPORTANT:
        // Send answer directly back to Studio.
        send("answer", { answer }, msg.from);

        console.log("[Watch] Sent answer to Studio:", msg.from);
      } catch (err) {
        console.error("[Watch] Error handling offer:", err);
        setConnectionText("Could not connect to live stream.");
      }
    };

    const handleCandidate = async (msg) => {
      if (msg.target && msg.target !== clientIdRef.current) return;
      if (!msg.data?.candidate) return;

      // Only accept candidates from the Studio that sent the offer.
      if (studioIdRef.current && msg.from !== studioIdRef.current) return;

      const candidate = new RTCIceCandidate(msg.data.candidate);
      const pc = peerConnectionRef.current;

      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error("[Watch] Failed to add ICE candidate:", err);
      }
    };

    const handleClientJoined = (msg) => {
      if (msg.data?.role === "viewer") {
        setViewerCount((prev) => prev + 1);
      }
    };

    const handleClientLeft = (msg) => {
      if (msg.data?.role === "viewer") {
        setViewerCount((prev) => Math.max(0, prev - 1));
      }
    };

    on("offer", handleOffer);
    on("candidate", handleCandidate);
    on("client_joined", handleClientJoined);
    on("client_left", handleClientLeft);

    return () => {
      off("offer", handleOffer);
      off("candidate", handleCandidate);
      off("client_joined", handleClientJoined);
      off("client_left", handleClientLeft);
    };
  }, [on, off, send]);

  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!liveStartTime) return;

    const interval = setInterval(() => {
      const diff = Date.now() - liveStartTime;

      const h = Math.floor(diff / 3600000)
        .toString()
        .padStart(2, "0");

      const m = Math.floor((diff % 3600000) / 60000)
        .toString()
        .padStart(2, "0");

      const s = Math.floor((diff % 60000) / 1000)
        .toString()
        .padStart(2, "0");

      setElapsed(`${h}:${m}:${s}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [liveStartTime]);

  const toggleFullscreen = () => {
    const videoContainer = videoRef.current?.parentElement;

    if (!document.fullscreenElement) {
      (videoContainer || document.documentElement).requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-black relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
          controls={false}
          className="max-w-full max-h-full"
          style={{ aspectRatio: "16/9" }}
        />

        {isLive && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="bg-red-600 px-3 py-1 rounded text-sm font-bold flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </span>
            <span className="bg-black/60 px-3 py-1 rounded text-sm font-mono">
              {elapsed}
            </span>
          </div>
        )}

        {!isLive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center px-6">
              <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-300">{connectionText}</p>
              <p className="text-gray-600 text-sm mt-2">Session: {eventCode}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const nextMuted = !isMuted;
              setIsMuted(nextMuted);
              if (videoRef.current) videoRef.current.muted = nextMuted;
            }}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            {isMuted ? "🔇 Unmute" : "🔊 Mute"}
          </button>

          <button
            onClick={toggleFullscreen}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            {isFullscreen ? "⬜ Exit Fullscreen" : "⬛ Fullscreen"}
          </button>
        </div>

        <span className="text-sm text-gray-400">👁️ {viewerCount} watching</span>
      </div>
    </div>
  );
}
