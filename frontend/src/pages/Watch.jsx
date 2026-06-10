import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import useWebSocket from "../hooks/useWebSocket";

export default function Watch() {
  const { eventCode } = useParams();
  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const clientIdRef = useRef(null);

  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [liveStartTime, setLiveStartTime] = useState(null);

  const { isConnected, clientID, send, on, off } = useWebSocket(
    eventCode,
    "viewer",
  );

  // Store client ID
  useEffect(() => {
    if (clientID) {
      clientIdRef.current = clientID;
    }
  }, [clientID]);

  // Send viewer_ready on connect
  useEffect(() => {
    if (isConnected) {
      send("viewer_ready", {});
      // Retry every 4 seconds until we get a stream
      const interval = setInterval(() => {
        if (!videoRef.current?.srcObject && isConnected) {
          send("viewer_ready", {});
        }
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [isConnected, send]);

  // Handle offer from studio
  useEffect(() => {
    const handleOffer = async (msg) => {
      // Check if this offer is for this viewer
      if (msg.data.target && msg.data.target !== clientIdRef.current) return;
      if (!msg.data.offer) return;

      console.log("Received offer from studio");

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      });

      pc.ontrack = (event) => {
        console.log("Got track from studio:", event.track.kind);
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setIsLive(true);
          setLiveStartTime(Date.now());
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send("candidate", { candidate: event.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
      };

      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === "connected") {
          console.log("Successfully connected to studio stream");
        } else if (pc.connectionState === "failed") {
          console.error("Failed to connect to studio stream");
        }
      };

      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(msg.data.offer),
        );
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        send("answer", { answer });
        peerConnectionRef.current = pc;
        console.log("Sent answer to studio");
      } catch (err) {
        console.error("Error handling offer:", err);
      }
    };

    const handleCandidate = (msg) => {
      if (msg.data.candidate && peerConnectionRef.current) {
        peerConnectionRef.current
          .addIceCandidate(new RTCIceCandidate(msg.data.candidate))
          .catch((err) => console.error("Failed to add ICE candidate:", err));
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

  // Live timer
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

  // Fullscreen
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Video Player */}
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

        {/* Live Badge */}
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

        {/* Connecting overlay */}
        {!isLive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400">
                {isConnected
                  ? "Waiting for stream to start..."
                  : "Connecting to stream..."}
              </p>
              <p className="text-gray-600 text-sm mt-2">Session: {eventCode}</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              if (videoRef.current) videoRef.current.muted = !isMuted;
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
        <span className="text-sm text-gray-400">👁 {viewerCount} watching</span>
      </div>
    </div>
  );
}
