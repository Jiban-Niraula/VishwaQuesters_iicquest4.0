import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useWebSocket from "../hooks/useWebSocket";
import PublicLayout from "../shared/layout/PublicLayout.jsx";

const CAMERA_TYPES = [
  {
    id: "phone",
    label: "Phone Camera",
    icon: "fa-solid fa-mobile-screen-button",
  },
  { id: "dslr", label: "DSLR / Mirrorless", icon: "fa-solid fa-camera" },
  { id: "usb", label: "USB / Capture Card", icon: "fa-solid fa-plug" },
];

function buildIceServers() {
  const iceServers = [
    // ✅ FIX: Add multiple STUN servers for redundancy
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // ✅ FIX: Add free STUN from Twilio/Coturn as fallback
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  const turnUrlsRaw =
    import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL;

  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrlsRaw && turnUsername && turnCredential) {
    const turnUrls = String(turnUrlsRaw)
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);

    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  const forceTurn = import.meta.env.VITE_FORCE_TURN === "true";

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    // ✅ FIX: Use 'all' by default for better connectivity,
    // only force 'relay' if explicitly set (relay is slower but more reliable)
    iceTransportPolicy: forceTurn ? "relay" : "all",
    // ✅ FIX: Add bundlePolicy and rtcpMuxPolicy for better compatibility
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

const ICE_SERVERS = buildIceServers();

console.log("ICE_SERVERS:", ICE_SERVERS);

export default function Camera() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [sessionCode, setSessionCode] = useState(
    searchParams.get("session") || "",
  );
  const [joined, setJoined] = useState(false);
  const [cameraType, setCameraType] = useState("phone");
  const [facingMode, setFacingMode] = useState("user");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [zoom, setZoom] = useState(1);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const iceCandidateQueue = useRef([]);
  const reconnectAttemptsRef = useRef(0); // ✅ FIX: Track reconnection attempts
  const maxReconnectAttempts = 5;
  const isCreatingOfferRef = useRef(false); // ✅ FIX: Prevent duplicate offer creation

  const { isConnected, send, on, off } = useWebSocket(
    joined ? sessionCode : null,
    "camera",
    cameraType,
  );

  const startCamera = async () => {
    setCameraError("");
    setIsRequesting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera not supported in this browser.");
      const stream = await navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: { exact: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, min: 24 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
        })
        .catch(() =>
          navigator.mediaDevices.getUserMedia({ video: true, audio: true }),
        );
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
      setIsRequesting(false);
      return stream;
    } catch (err) {
      const msg =
        err.name === "NotAllowedError"
          ? "Camera access denied. Allow permissions and try again."
          : err.name === "NotFoundError"
            ? "No camera found on this device."
            : err.message || "Camera access failed.";
      setCameraError(msg);
      setIsRequesting(false);
      return null;
    }
  };

  const createOffer = useCallback(
    async (stream, target = null) => {
      if (!stream || isCreatingOfferRef.current) return; // ✅ Prevent duplicate offers

      isCreatingOfferRef.current = true;

      try {
        // Close existing peer connection if any
        if (peerRef.current) {
          try {
            peerRef.current.close();
          } catch {}
          peerRef.current = null;
        }

        const pc = new RTCPeerConnection(ICE_SERVERS);

        // ✅ FIX: ICE candidate error handling
        pc.onicecandidateerror = (event) => {
          // Only log real errors, not IPv6 STUN lookup failures which are expected
          const errorCode = event.errorCode;
          // Error 701 = STUN host lookup received error (expected on IPv6)
          if (errorCode !== 701) {
            console.error("[ICE ERROR]", {
              url: event.url,
              errorCode,
              errorText: event.errorText,
              address: event.address,
              port: event.port,
            });
          }
        };

        peerRef.current = pc;

        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const raw = event.candidate.candidate || "";
            const type = raw.match(/ typ ([a-z]+)/)?.[1];
            const protocol = raw.match(/ udp | tcp /)?.[0]?.trim();

            console.log("[CAMERA ICE CANDIDATE]", {
              type,
              protocol,
              target,
              candidate: raw,
            });

            send("candidate", { candidate: event.candidate }, target || null);
          }
        };

        // ✅ FIX: Much better connection state handling with ICE restart
        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          console.log("Camera peer connection:", state);

          if (state === "connected") {
            // Connection established — reset reconnection counter
            reconnectAttemptsRef.current = 0;
            setCameraError("");
            return;
          }

          if (state === "disconnected") {
            // ✅ FIX: Try ICE restart instead of full reconnection
            console.warn(
              "Camera disconnected. Will attempt ICE restart in 3s...",
            );
            setTimeout(() => {
              if (
                peerRef.current === pc &&
                pc.connectionState === "disconnected"
              ) {
                try {
                  console.log("[Camera] Attempting ICE restart...");
                  pc.restartIce();
                } catch (err) {
                  console.warn("[Camera] ICE restart failed, will retry:", err);
                }
              }
            }, 3000);
            return;
          }

          if (state === "failed") {
            reconnectAttemptsRef.current++;

            if (reconnectAttemptsRef.current <= maxReconnectAttempts) {
              // ✅ FIX: Try ICE restart first before full reconnection
              console.warn(
                `Camera connection failed (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}). Trying ICE restart...`,
              );
              try {
                pc.restartIce();
              } catch (err) {
                console.warn(
                  "[Camera] ICE restart failed on failed state:",
                  err,
                );
              }

              // If ICE restart doesn't help after a delay, request new offer from studio
              setTimeout(() => {
                if (
                  peerRef.current === pc &&
                  (pc.connectionState === "failed" ||
                    pc.connectionState === "disconnected")
                ) {
                  console.warn(
                    "[Camera] ICE restart didn't help. Closing and requesting new offer.",
                  );
                  pc.close();
                  peerRef.current = null;
                  // Studio will send request_offer, or we can proactively send one
                }
              }, 10000);
            } else {
              setCameraError(
                "Connection to studio failed after multiple attempts. Please reconnect camera.",
              );
            }
          }
        };

        // ✅ FIX: Also handle ICE connection state changes
        pc.oniceconnectionstatechange = () => {
          const iceState = pc.iceConnectionState;
          console.log("Camera ICE connection state:", iceState);

          if (iceState === "failed") {
            // ICE restart is the standard way to recover from ICE failures
            try {
              console.log("[Camera] ICE failed, attempting restartIce()...");
              pc.restartIce();
            } catch (err) {
              console.warn("[Camera] restartIce() failed:", err);
            }
          }
        };

        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
          // ✅ FIX: Enable ICE restart support
          iceRestart: true,
        });

        await pc.setLocalDescription(offer);

        pc.getSenders().forEach((sender) => {
          const params = sender.getParameters();

          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }

          if (sender.track?.kind === "video") {
            // ✅ FIX: Lower bitrate for better stability on mobile networks
            params.encodings[0].maxBitrate = 2_000_000;
            params.encodings[0].maxFramerate = 24;
          }

          if (sender.track?.kind === "audio") {
            params.encodings[0].maxBitrate = 128_000;
          }

          sender.setParameters(params).catch(() => {});
        });

        const deviceName =
          stream.getVideoTracks()[0]?.label ||
          streamRef.current?.getVideoTracks()[0]?.label ||
          cameraType;

        send(
          "offer",
          {
            offer,
            camera_type: cameraType,
            device_name: deviceName,
          },
          target,
        );

        console.log(
          "✅ Camera offer sent to Studio",
          target ? `(target ${target})` : "",
        );
      } catch (err) {
        console.error("Camera createOffer failed:", err);
        setCameraError("Failed to establish connection with studio.");
      } finally {
        isCreatingOfferRef.current = false;
      }
    },
    [send, cameraType],
  );

  useEffect(() => {
    const handleAnswer = async (msg) => {
      if (msg.data?.answer && peerRef.current) {
        try {
          // ✅ FIX: Check if we already have a remote description set
          if (peerRef.current.signalingState === "have-local-offer") {
            await peerRef.current.setRemoteDescription(
              new RTCSessionDescription(msg.data.answer),
            );

            for (const c of iceCandidateQueue.current) {
              peerRef.current.addIceCandidate(c).catch(() => {});
            }

            iceCandidateQueue.current = [];
          } else {
            console.warn(
              "[Camera] Received answer but signaling state is:",
              peerRef.current.signalingState,
            );
          }
        } catch (err) {
          console.error("[Camera] Failed to set remote description:", err);
        }
      }
    };

    const handleCandidate = (msg) => {
      if (msg.data?.candidate && peerRef.current) {
        const c = new RTCIceCandidate(msg.data.candidate);

        // ✅ FIX: Check signaling state properly
        if (
          peerRef.current.remoteDescription?.type &&
          peerRef.current.signalingState === "stable"
        ) {
          peerRef.current.addIceCandidate(c).catch((err) => {
            console.warn("[Camera] Failed to add ICE candidate:", err);
          });
        } else {
          iceCandidateQueue.current.push(c);
        }
      }
    };

    const handleRequestOffer = async (msg) => {
      console.log("📩 Studio requested camera offer:", msg.from);
      reconnectAttemptsRef.current = 0; // Reset on studio request

      const stream = streamRef.current || (await startCamera());

      if (stream) {
        await createOffer(stream, msg.from);
      }
    };

    const handleAudioControl = (msg) => {
      if (msg.data?.muted !== undefined && streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = !msg.data.muted;
        });

        setIsMuted(msg.data.muted);
      }
    };

    on("answer", handleAnswer);
    on("candidate", handleCandidate);
    on("request_offer", handleRequestOffer);
    on("audio_control", handleAudioControl);

    return () => {
      off("answer", handleAnswer);
      off("candidate", handleCandidate);
      off("request_offer", handleRequestOffer);
      off("audio_control", handleAudioControl);
    };
  }, [on, off, send, cameraType, createOffer]);

  // ✅ Auto-send offer when WebSocket connects and we have a stream
  useEffect(() => {
    if (!isConnected || !streamRef.current) return;

    const timer = setTimeout(() => {
      if (streamRef.current && !peerRef.current) {
        console.log("[Camera] Auto-sending offer to studio...");
        createOffer(streamRef.current);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ Periodic check: if connected but no peer, retry offer every 5s
  useEffect(() => {
    if (!isConnected || !streamRef.current) return;

    const interval = setInterval(() => {
      if (streamRef.current && !peerRef.current) {
        console.log(
          "[Camera] Periodic retry — connected but no peer, sending offer...",
        );
        createOffer(streamRef.current);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      peerRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const handleJoin = async () => {
    if (!sessionCode.trim()) {
      setCameraError("Enter a session code.");
      return;
    }
    const stream = await startCamera();
    if (stream) setJoined(true);
  };

  const toggleMute = () => {
    const next = !isMuted;
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsMuted(next);
  };

  const toggleVideo = () => {
    const next = !isVideoOff;
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsVideoOff(next);
  };

  const switchCamera = async () => {
    const newFacing = facingMode === "user" ? "environment" : "user";
    setFacingMode(newFacing);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 24 },
        },
        audio: true,
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
      const videoSender = peerRef.current
        ?.getSenders()
        .find((s) => s.track?.kind === "video");
      if (videoSender && stream.getVideoTracks()[0])
        videoSender.replaceTrack(stream.getVideoTracks()[0]);
    } catch {
      setCameraError("Failed to switch camera.");
    }
  };

  const handleDisconnect = () => {
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setJoined(false);
    setCameraError("");
  };

  if (!joined) {
    return (
      <PublicLayout>
        <div className="vc-camera-join">
          <div className="vc-camera-join-card">
            {cameraError && (
              <div className="alert alert-error">
                <i className="fa-solid fa-triangle-exclamation" /> {cameraError}
              </div>
            )}

            <div className="vc-camera-form">
              <label>
                Session Code
                <input
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                  placeholder="e.g. X9-KL2P"
                  className="vc-code-input"
                />
              </label>

              <div className="vc-camera-type-group">
                <span className="vc-camera-type-label">Camera Type</span>
                <div className="vc-camera-type-list">
                  {CAMERA_TYPES.map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => setCameraType(ct.id)}
                      className={`vc-camera-type-btn${cameraType === ct.id ? " active" : ""}`}
                    >
                      <i className={ct.icon} />
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleJoin}
                disabled={!sessionCode.trim() || isRequesting}
                type="button"
              >
                {isRequesting ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" /> Requesting
                    camera…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-tower-broadcast" /> Connect to
                    Studio
                  </>
                )}
              </button>

              <button
                type="button"
                className="vc-camera-back"
                onClick={() => navigate("/")}
              >
                <i className="fa-solid fa-arrow-left" /> Back to Home
              </button>
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="vc-camera-live">
        <div className="vc-camera-status-bar">
          <div className="vc-camera-status-left">
            <span className={`connection-dot${isConnected ? " ok" : ""}`} />
            <span>{isConnected ? "Connected to Studio" : "Connecting…"}</span>
            <span className="vc-camera-type-pill">
              {CAMERA_TYPES.find((c) => c.id === cameraType)?.label}
            </span>
          </div>
          <span className="vc-camera-session">
            Session: <strong>{sessionCode}</strong>
          </span>
        </div>

        <div className="vc-camera-viewport">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="vc-camera-video"
            style={{
              transform: `${facingMode === "user" ? "scaleX(-1) " : ""}scale(${zoom})`,
              transformOrigin: "center",
            }}
          />
          {!isConnected && (
            <div className="vc-camera-connecting-overlay">
              <i className="fa-solid fa-spinner fa-spin" />
              <span>Connecting to studio…</span>
            </div>
          )}
        </div>

        <div className="vc-camera-zoom-bar">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="4"
            step="0.1"
            value={zoom}
            onChange={(e) => {
              const z = parseFloat(e.target.value);
              setZoom(z);
              send("camera_zoom", { zoom: z });
            }}
          />
          <span className="vc-zoom-val">{zoom.toFixed(1)}×</span>
        </div>

        <div className="vc-camera-controls">
          <button
            type="button"
            className={`vc-ctrl-btn${isMuted ? " danger" : ""}`}
            onClick={toggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            <i
              className={`fa-solid ${isMuted ? "fa-microphone-slash" : "fa-microphone"}`}
            />
            <span>{isMuted ? "Unmuted" : "Mute"}</span>
          </button>

          <button
            type="button"
            className={`vc-ctrl-btn${isVideoOff ? " danger" : ""}`}
            onClick={toggleVideo}
            title={isVideoOff ? "Show video" : "Hide video"}
          >
            <i
              className={`fa-solid ${isVideoOff ? "fa-video-slash" : "fa-video"}`}
            />
            <span>{isVideoOff ? "Show" : "Hide"}</span>
          </button>

          <button
            type="button"
            className="vc-ctrl-btn"
            onClick={switchCamera}
            title="Switch camera"
          >
            <i className="fa-solid fa-rotate" />
            <span>Flip</span>
          </button>

          <button
            type="button"
            className="vc-ctrl-btn danger"
            onClick={handleDisconnect}
            title="Disconnect"
          >
            <i className="fa-solid fa-xmark" />
            <span>End</span>
          </button>
        </div>
      </div>
    </PublicLayout>
  );
}
