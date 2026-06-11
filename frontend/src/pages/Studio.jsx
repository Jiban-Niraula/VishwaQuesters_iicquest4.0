import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useWebSocket from "../hooks/useWebSocket";
import Hls from "hls.js";
import StudioLayout from "./studio/StudioLayout";
import {
  getOverlays,
  createOverlay,
  updateOverlay,
  deleteOverlay,
  getDestinations,
  addDestination,
  updateDestination,
  deleteDestination,
  startRTMPStream,
  stopRTMPStream,
  updateEvent,
  getEvents,
  getSponsoredAds,
  playSponsoredAd,
  completeSponsoredAdPlacement,
  resolveMediaUrl,
} from "../services/api";
function buildIceServers() {
  const iceServers = [
    // ✅ FIX: Multiple STUN servers for redundancy
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // ✅ FIX: Additional fallback STUN
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

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy:
      import.meta.env.VITE_FORCE_TURN === "true" ? "relay" : "all",
    // ✅ FIX: Better policies for multi-peer connections
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

const ICE_SERVERS = buildIceServers();

console.log("ICE_SERVERS:", ICE_SERVERS);
const STREAM_WIDTH = 1280;
const STREAM_HEIGHT = 720;
const STREAM_FPS = 24;
const RECORDER_CHUNK_MS = 250;
const STREAM_VIDEO_BITRATE = 2_500_000;
const STREAM_AUDIO_BITRATE = 128_000;

// Browser-side AI Director assets. These are loaded only when Director mode is enabled.
// If the model/CDN cannot load, Studio safely falls back to audio + motion scoring.
const AI_DIRECTOR_TASKS_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";
const AI_DIRECTOR_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const AI_DIRECTOR_FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

const clamp01 = (value) => Math.max(0, Math.min(1, value || 0));

const getSupportedMimeType = () => {
  // For browser MediaRecorder → FFmpeg pipe, VP8 WebM is usually more stable.
  // Backend FFmpeg will convert this to H.264 for YouTube/Facebook.
  const types = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`✅ Using stable MediaRecorder MIME type: ${type}`);
      return type;
    }
  }

  console.warn(
    "⚠️ No preferred MediaRecorder type supported. Using browser default.",
  );
  return "";
};

export default function Studio() {
  const { eventCode } = useParams();
  const navigate = useNavigate();

  // Refs
  const canvasRef = useRef(null);
  const cameraVideosRef = useRef({});
  const peerConnectionsRef = useRef({});
  const viewerPeerConnectionsRef = useRef({});
  const iceCandidateQueuesRef = useRef({});
  const mediaRecorderRef = useRef(null);
  const commentaryStreamRef = useRef(null);
  const streamWSRef = useRef(null);
  const frameRequestRef = useRef(null);
  const clientIdRef = useRef(null);
  const isLiveRef = useRef(false);
  const finalStreamRef = useRef(null);
  const mediaElementsRef = useRef({}); // Stores dynamically created audio/video/img for overlays
  const cricketBallLogsRef = useRef({}); // Local-only undo history per overlay (not persisted to server)
  const audioContextRef = useRef(null);
  const mixerDestinationRef = useRef(null);
  const audioSourcesRef = useRef({}); // Stores Web Audio source nodes: { [id]: { sourceNode, gainNode, stream } }
  // Feature refs
  const timerWorkerRef = useRef(null); // Web Worker for background-safe render ticks
  const screenShareStreamRef = useRef(null); // Active screen share stream
  const cameraRecordersRef = useRef({}); // Per-camera { recorder, writable } for local clip downloads
  const cameraRecordersIntervalsRef = useRef({}); // Intervals to reset recorders every 10s
  const recordingDirHandleRef = useRef(null); // Directory handle from File System Access API
  const hlsInstancesRef = useRef({}); // hls.js instances keyed by overlay id

  // Auto-switch / AI Director refs
  const autoSwitchEnabledRef = useRef(false);
  const lastSwitchTimeRef = useRef(0);
  const analyserNodesRef = useRef({}); // { [cameraId]: AnalyserNode }
  const prevFrameDataRef = useRef({}); // { [cameraId]: Uint8ClampedArray }
  const autoSwitchIntervalRef = useRef(null);
  const autoSwitchBusyRef = useRef(false);
  const camerasRef = useRef({});
  const activeCameraIdRef = useRef(null);
  const autoSwitchModeRef = useRef("director");
  const faceDetectorRef = useRef(null);
  const faceDetectorLoadingRef = useRef(false);
  const aiDirectorStatusRef = useRef("idle");
  const faceScoresRef = useRef({}); // { [cameraId]: latest face/person presence score }
  const faceDetectionTimeRef = useRef({});
  const autoSwitchScoresRef = useRef({});

  // State
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(false);
  const [autoSwitchMode, setAutoSwitchMode] = useState("director"); // "director" | "audio" | "motion" | "both"
  const [aiDirectorStatus, setAiDirectorStatus] = useState("idle"); // idle | loading | ready | fallback
  const [aiDirectorScores, setAiDirectorScores] = useState({});

  // State
  const [cameras, setCameras] = useState({});
  const [activeCameraId, setActiveCameraId] = useState(null);
  const [activeLayout, setActiveLayout] = useState("single");
  const [slotAssignments, setSlotAssignments] = useState({
    slot1: "",
    slot2: "",
    slot3: "",
    slot4: "",
  });
  const [mutedCameras, setMutedCameras] = useState({});
  const [activeAudioSource, setActiveAudioSource] = useState(null);
  const [commentaryActive, setCommentaryActive] = useState(false);
  const [commentaryMuted, setCommentaryMuted] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [liveStartTime, setLiveStartTime] = useState(null);
  const [overlays, setOverlays] = useState([]);
  const [activeOverlays, setActiveOverlays] = useState({});
  const [newOverlay, setNewOverlay] = useState({
    type: "text",
    title: "",
    content: "",
    position: "top-right",
    duration: 0,
  });
  const [newOverlayMedia, setNewOverlayMedia] = useState(null);
  const [scorecardData, setScorecardData] = useState({});
  const [destinations, setDestinations] = useState([]);
  const [newDest, setNewDest] = useState({
    platform: "youtube",
    stream_key: "",
    server_url: "",
  });
  const [eventData, setEventData] = useState(null);
  const [activePanel, setActivePanel] = useState("cameras");
  const [elapsed, setElapsed] = useState("00:00:00");
  // Feature state
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [cameraZoom, setCameraZoom] = useState({}); // { [cameraId]: zoomLevel (1-4) }
  const [newOverlayVideoUrl, setNewOverlayVideoUrl] = useState("");
  const [sponsoredAds, setSponsoredAds] = useState([]);
  const [currentSponsoredAd, setCurrentSponsoredAd] = useState(null);
  const [sponsoredAdLoading, setSponsoredAdLoading] = useState(false);

  // WebSocket
  const { isConnected, clientID, send, on, off } = useWebSocket(
    eventCode,
    "studio",
    "",
  );

  useEffect(() => {
    if (clientID) {
      clientIdRef.current = clientID;
    }
  }, [clientID]);

  // Draw video maintaining aspect ratio (with optional digital zoom)
  const drawVideoFit = useCallback((ctx, video, x, y, w, h, zoom = 1) => {
    if (!video) {
      ctx.fillStyle = "#0D1318";
      ctx.fillRect(x, y, w, h);
      return;
    }

    // Try to force hidden video playback if stream is attached but not playing yet.
    if (video.srcObject && video.paused) {
      video.play().catch(() => {});
    }

    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      ctx.fillStyle = "#0D1318";
      ctx.fillRect(x, y, w, h);
      return;
    }

    const vW = video.videoWidth;
    const vH = video.videoHeight;

    const safeZoom = Math.max(1, Math.min(zoom, 4));
    const srcW = vW / safeZoom;
    const srcH = vH / safeZoom;
    const srcX = (vW - srcW) / 2;
    const srcY = (vH - srcH) / 2;

    const videoRatio = srcW / srcH;
    const boxRatio = w / h;

    let drawW;
    let drawH;
    let drawX;
    let drawY;

    if (videoRatio > boxRatio) {
      drawW = w;
      drawH = w / videoRatio;
      drawX = x;
      drawY = y + (h - drawH) / 2;
    } else {
      drawH = h;
      drawW = h * videoRatio;
      drawX = x + (w - drawW) / 2;
      drawY = y;
    }

    ctx.save();
    ctx.filter = "contrast(1.08) saturate(1.12) brightness(1.03)";
    ctx.drawImage(video, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);
    ctx.restore();
  }, []);

  // Draw camera feed with premium HUD labels and fallbacks
  const drawCameraFeed = useCallback(
    (ctx, camera, label, x, y, w, h) => {
      const video = camera?.videoElement;

      if (
        camera &&
        video &&
        video.srcObject &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        const zoom = cameraZoom[camera.id] || 1;
        drawVideoFit(ctx, video, x, y, w, h, zoom);
        return;
      }

      // If stream exists but video is still paused, keep trying.
      if (video?.srcObject && video.paused) {
        video.play().catch(() => {});
      }

      ctx.save();
      ctx.fillStyle = "#090D11";
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = "#1E293B";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);

      ctx.fillStyle = "#475569";
      ctx.font = "bold 15px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label || "Offline Feed", x + w / 2, y + h / 2 - 10);

      ctx.font = "11px 'DM Sans', sans-serif";
      ctx.fillStyle = "#334155";

      const trackInfo = camera?.stream
        ? `tracks: video=${camera.stream.getVideoTracks().length}, audio=${camera.stream.getAudioTracks().length}`
        : "Waiting for connection.";

      ctx.fillText(trackInfo, x + w / 2, y + h / 2 + 12);

      ctx.restore();
    },
    [drawVideoFit, cameraZoom],
  );

  // ── AI Director / Auto Camera Switching Engine ────────────────

  useEffect(() => {
    camerasRef.current = cameras;
  }, [cameras]);

  useEffect(() => {
    activeCameraIdRef.current = activeCameraId;
  }, [activeCameraId]);

  useEffect(() => {
    autoSwitchModeRef.current = autoSwitchMode;
  }, [autoSwitchMode]);

  useEffect(() => {
    aiDirectorStatusRef.current = aiDirectorStatus;
  }, [aiDirectorStatus]);

  // Remove stale auto-switch resources when a camera disappears.
  useEffect(() => {
    const activeIds = new Set(Object.keys(cameras));

    [
      analyserNodesRef,
      prevFrameDataRef,
      faceScoresRef,
      faceDetectionTimeRef,
      autoSwitchScoresRef,
    ].forEach((ref) => {
      Object.keys(ref.current).forEach((cameraId) => {
        if (!activeIds.has(cameraId)) {
          delete ref.current[cameraId];
        }
      });
    });
  }, [cameras]);

  const cleanupAutoSwitchForCamera = useCallback((cameraId) => {
    delete analyserNodesRef.current[cameraId];
    delete prevFrameDataRef.current[cameraId];
    delete faceScoresRef.current[cameraId];
    delete faceDetectionTimeRef.current[cameraId];
    delete autoSwitchScoresRef.current[cameraId];
  }, []);

  // Get audio level (0-1) for a camera using AnalyserNode
  const getAudioLevel = useCallback((cameraId) => {
    const analyser = analyserNodesRef.current[cameraId];
    if (!analyser) return 0;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }

    return clamp01(sum / (dataArray.length * 255));
  }, []);

  // Get motion score (0-1) for a camera by comparing current frame to previous
  const getMotionScore = useCallback((cameraId, videoElement) => {
    if (
      !videoElement ||
      videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !videoElement.videoWidth ||
      !videoElement.videoHeight
    ) {
      return 0;
    }

    const sampleW = 40;
    const sampleH = 30;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = sampleW;
    tempCanvas.height = sampleH;

    const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;

    try {
      ctx.drawImage(videoElement, 0, 0, sampleW, sampleH);
      const currentFrame = ctx.getImageData(0, 0, sampleW, sampleH).data;
      const prevFrame = prevFrameDataRef.current[cameraId];
      // Copy the frame so later canvas operations cannot mutate the stored data.
      prevFrameDataRef.current[cameraId] = new Uint8ClampedArray(currentFrame);

      if (!prevFrame) return 0;

      let diff = 0;
      let count = 0;
      for (let i = 0; i < currentFrame.length; i += 16) {
        const rDiff = Math.abs(currentFrame[i] - prevFrame[i]);
        const gDiff = Math.abs(currentFrame[i + 1] - prevFrame[i + 1]);
        const bDiff = Math.abs(currentFrame[i + 2] - prevFrame[i + 2]);
        diff += (rDiff + gDiff + bDiff) / 3;
        count++;
      }

      const avgDiff = count > 0 ? diff / count : 0;
      return clamp01(avgDiff / 40);
    } catch (err) {
      console.warn("AI Director motion scoring failed:", err);
      return 0;
    }
  }, []);

  // Wire up AnalyserNode for a camera's audio source
  const setupAnalyserForCamera = useCallback((cameraId) => {
    const audioSource = audioSourcesRef.current[cameraId];
    if (!audioSource?.sourceNode || !audioContextRef.current) return;

    if (analyserNodesRef.current[cameraId]) return;

    try {
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      // Connect in parallel: sourceNode → analyser, while existing gainNode remains connected.
      audioSource.sourceNode.connect(analyser);
      analyserNodesRef.current[cameraId] = analyser;

      console.log(`📊 AI Director analyser ready for camera ${cameraId}`);
    } catch (err) {
      console.warn(`AI Director could not attach analyser for ${cameraId}:`, err);
    }
  }, []);

  const initAiDirectorModel = useCallback(async () => {
    if (faceDetectorRef.current) return faceDetectorRef.current;
    if (faceDetectorLoadingRef.current) return null;

    faceDetectorLoadingRef.current = true;
    aiDirectorStatusRef.current = "loading";
    setAiDirectorStatus("loading");

    try {
      const { FaceDetector, FilesetResolver } = await import(
        /* @vite-ignore */ AI_DIRECTOR_TASKS_URL
      );

      const vision = await FilesetResolver.forVisionTasks(AI_DIRECTOR_WASM_URL);
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: AI_DIRECTOR_FACE_MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
        minSuppressionThreshold: 0.3,
      });

      faceDetectorRef.current = detector;
      aiDirectorStatusRef.current = "ready";
      setAiDirectorStatus("ready");
      console.log("🧠 AI Director face detector ready");
      return detector;
    } catch (err) {
      // Demo-safe fallback: audio + motion still works if CDN/model/GPU is blocked.
      console.warn("AI Director model unavailable. Falling back to audio + motion.", err);
      faceDetectorRef.current = null;
      aiDirectorStatusRef.current = "fallback";
      setAiDirectorStatus("fallback");
      return null;
    } finally {
      faceDetectorLoadingRef.current = false;
    }
  }, []);

  const getFacePresenceScore = useCallback(
    async (cameraId, videoElement) => {
      if (
        !videoElement ||
        videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !videoElement.videoWidth ||
        !videoElement.videoHeight
      ) {
        return 0;
      }

      const now = performance.now();
      const lastDetection = faceDetectionTimeRef.current[cameraId] || 0;

      // Face detection is heavier than audio/motion, so do it max once per second per camera.
      if (now - lastDetection < 1000) {
        return faceScoresRef.current[cameraId] || 0;
      }

      const detector = faceDetectorRef.current;
      if (!detector) return 0;

      try {
        const result = detector.detectForVideo(videoElement, now);
        const detections = result?.detections || [];
        let best = 0;

        detections.forEach((detection) => {
          const confidence = clamp01(detection?.categories?.[0]?.score || 0);
          const box = detection?.boundingBox;
          const faceArea = box
            ? clamp01((box.width * box.height) / (videoElement.videoWidth * videoElement.videoHeight))
            : 0;

          // Prefer confident and reasonably visible faces. This makes close-up/subject shots win.
          const score = clamp01(confidence * 0.75 + Math.min(faceArea * 6, 1) * 0.25);
          best = Math.max(best, score);
        });

        faceScoresRef.current[cameraId] = best;
        faceDetectionTimeRef.current[cameraId] = now;
        return best;
      } catch (err) {
        console.warn(`AI Director face scoring failed for ${cameraId}:`, err);
        faceScoresRef.current[cameraId] = 0;
        faceDetectionTimeRef.current[cameraId] = now;
        return 0;
      }
    },
    [],
  );

  const buildDirectorScore = useCallback(
    async (cam, mode) => {
      const audioLevel =
        mode === "audio" || mode === "both" || mode === "director"
          ? getAudioLevel(cam.id)
          : 0;
      const motionScore =
        mode === "motion" || mode === "both" || mode === "director"
          ? getMotionScore(cam.id, cam.videoElement)
          : 0;
      const faceScore =
        mode === "director" ? await getFacePresenceScore(cam.id, cam.videoElement) : 0;

      let total = 0;

      if (mode === "audio") {
        total = audioLevel;
      } else if (mode === "motion") {
        total = motionScore;
      } else if (mode === "both") {
        total = audioLevel * 0.65 + motionScore * 0.35;
      } else {
        // AI Director: voice + visible subject + scene movement.
        // Face model is optional; if unavailable, this naturally behaves like audio+motion.
        total = audioLevel * 0.45 + faceScore * 0.35 + motionScore * 0.2;
      }

      return {
        total: clamp01(total),
        audio: clamp01(audioLevel),
        motion: clamp01(motionScore),
        face: clamp01(faceScore),
      };
    },
    [getAudioLevel, getMotionScore, getFacePresenceScore],
  );

  // The main AI Director decision loop
  const runAutoSwitch = useCallback(async () => {
    if (!autoSwitchEnabledRef.current || autoSwitchBusyRef.current) return;

    autoSwitchBusyRef.current = true;

    try {
      const now = Date.now();
      const MIN_DWELL = 3000; // Stay on a camera for at least 3 seconds
      const cameraList = Object.values(camerasRef.current).filter(
        (cam) => cam?.videoElement || cam?.stream,
      );
      const mode = autoSwitchModeRef.current;
      const currentActiveId = activeCameraIdRef.current;

      if (now - lastSwitchTimeRef.current < MIN_DWELL) return;
      if (cameraList.length < 2) return;

      if (
        mode === "director" &&
        !faceDetectorRef.current &&
        aiDirectorStatusRef.current !== "fallback"
      ) {
        // Non-blocking: start loading if not already started.
        initAiDirectorModel();
      }

      let bestCameraId = null;
      let bestScore = -1;
      const nextScores = {};

      for (const cam of cameraList) {
        if (!analyserNodesRef.current[cam.id]) {
          setupAnalyserForCamera(cam.id);
        }

        const parts = await buildDirectorScore(cam, mode);
        let score = parts.total;

        // Avoid hyperactive switching by giving the current camera a small stability bonus.
        if (cam.id === currentActiveId) {
          score *= 1.08;
        }

        nextScores[cam.id] = {
          ...parts,
          total: clamp01(score),
          label: cam.deviceName || cam.id,
        };

        if (score > bestScore) {
          bestScore = score;
          bestCameraId = cam.id;
        }
      }

      autoSwitchScoresRef.current = nextScores;
      setAiDirectorScores(nextScores);

      const activeScore = currentActiveId ? nextScores[currentActiveId]?.total || 0 : 0;
      const margin = mode === "director" ? 0.08 : 0.06;
      const threshold = mode === "audio" ? 0.06 : 0.08;

      if (
        bestCameraId &&
        bestCameraId !== currentActiveId &&
        bestScore > threshold &&
        bestScore - activeScore > margin
      ) {
        console.log(
          `🧠 AI Director switch: ${currentActiveId} → ${bestCameraId} ` +
            `(score: ${bestScore.toFixed(3)}, mode: ${mode})`,
        );
        setActiveCameraId(bestCameraId);
        activeCameraIdRef.current = bestCameraId;
        lastSwitchTimeRef.current = now;
      }
    } finally {
      autoSwitchBusyRef.current = false;
    }
  }, [buildDirectorScore, initAiDirectorModel, setupAnalyserForCamera]);

  // Start/stop AI Director / auto-switch
  const toggleAutoSwitch = useCallback(() => {
    const next = !autoSwitchEnabledRef.current;
    autoSwitchEnabledRef.current = next;
    setAutoSwitchEnabled(next);

    if (next) {
      Object.keys(audioSourcesRef.current).forEach((camId) => {
        setupAnalyserForCamera(camId);
      });

      if (autoSwitchModeRef.current === "director") {
        initAiDirectorModel();
      }

      if (autoSwitchIntervalRef.current) {
        clearInterval(autoSwitchIntervalRef.current);
      }

      autoSwitchIntervalRef.current = setInterval(() => {
        runAutoSwitch();
      }, 650);
      lastSwitchTimeRef.current = Date.now();
      console.log("🧠 AI Director ENABLED");
    } else {
      if (autoSwitchIntervalRef.current) {
        clearInterval(autoSwitchIntervalRef.current);
        autoSwitchIntervalRef.current = null;
      }
      setAiDirectorScores({});
      console.log("🧠 AI Director DISABLED");
    }
  }, [initAiDirectorModel, runAutoSwitch, setupAnalyserForCamera]);

  useEffect(() => {
    if (autoSwitchEnabledRef.current && autoSwitchMode === "director") {
      initAiDirectorModel();
    }
  }, [autoSwitchMode, initAiDirectorModel]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoSwitchIntervalRef.current) {
        clearInterval(autoSwitchIntervalRef.current);
      }
      if (faceDetectorRef.current?.close) {
        try {
          faceDetectorRef.current.close();
        } catch {}
      }
    };
  }, []);

  // Set up analysers when new cameras connect
  useEffect(() => {
    if (autoSwitchEnabledRef.current) {
      Object.keys(audioSourcesRef.current).forEach((camId) => {
        setupAnalyserForCamera(camId);
      });
    }
  }, [cameras, autoSwitchEnabled, setupAnalyserForCamera]);

  // Helper to resolve camera slot assignments (respecting manual overrides and auto-filling unassigned slots)
  const getResolvedSlots = useCallback(() => {
    const sortedCams = Object.values(cameras).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const resolved = { slot1: null, slot2: null, slot3: null, slot4: null };
    const usedIds = new Set();

    const slots = ["slot1", "slot2", "slot3", "slot4"];

    // Step 1: Assign manual overrides
    slots.forEach((slot) => {
      const manualId = slotAssignments[slot];
      if (manualId && cameras[manualId]) {
        resolved[slot] = cameras[manualId];
        usedIds.add(manualId);
      }
    });

    // Step 2: If slot1 is still empty, assign activeCameraId as primary
    if (!resolved.slot1 && activeCameraId && cameras[activeCameraId]) {
      resolved.slot1 = cameras[activeCameraId];
      usedIds.add(activeCameraId);
    }

    // Step 3: Fill remaining empty slots with unused cameras
    slots.forEach((slot) => {
      if (!resolved[slot]) {
        const nextCam = sortedCams.find((c) => !usedIds.has(c.id));
        if (nextCam) {
          resolved[slot] = nextCam;
          usedIds.add(nextCam.id);
        }
      }
    });

    return resolved;
  }, [cameras, slotAssignments, activeCameraId]);

  // Render overlay
  const renderOverlay = useCallback((ctx, overlay) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let x, y, w, h;
    const padding = 24;

    ctx.save();

    // Default dynamic sizing based on text (if not media)
    const isTitleAndContent = overlay.title && overlay.content;
    const mainText = overlay.content || overlay.title || "Overlay";

    ctx.font = "bold 22px 'DM Sans', sans-serif";
    const contentWidth = ctx.measureText(mainText).width;
    ctx.font = "600 13px 'DM Sans', sans-serif";
    const titleWidth = overlay.title
      ? ctx.measureText(overlay.title.toUpperCase()).width
      : 0;

    let targetW = Math.max(contentWidth, titleWidth) + padding * 2 + 8;
    w = Math.min(Math.max(targetW, 200), 800);
    h = isTitleAndContent ? 84 : 64;

    // Adjust size for specific scorecards
    if (overlay.type === "football-scorecard") {
      w = 400;
      h = 70;
    } else if (overlay.type === "cricket-scorecard") {
      w = canvas.width;
      h = 70; // Full width bottom bar
    } else if (
      overlay.type === "ad" ||
      overlay.type === "replay" ||
      overlay.type === "image" ||
      overlay.type === "video-link"
    ) {
      // Full screen or specific pip size
      if (overlay.position === "full") {
        w = canvas.width;
        h = canvas.height;
      } else {
        w = 320;
        h = 180; // Default 16:9 box
      }
    }

    switch (overlay.position) {
      case "top-left":
        x = 32;
        y = 32;
        break;
      case "top-right":
        x = canvas.width - w - 32;
        y = 32;
        break;
      case "bottom-left":
        x = 32;
        y = canvas.height - h - 32;
        break;
      case "bottom-right":
        x = canvas.width - w - 32;
        y = canvas.height - h - 32;
        break;
      case "center":
        x = (canvas.width - w) / 2;
        y = (canvas.height - h) / 2;
        break;
      case "full":
        x = 0;
        y = 0;
        w = canvas.width;
        h = canvas.height;
        break;
      default:
        ctx.restore();
        return;
    }

    // Force full bottom for cricket
    if (overlay.type === "cricket-scorecard") {
      x = 0;
      y = canvas.height - h;
    }

    // Render Media (Video/Image)
    if (
      overlay.type === "ad" ||
      overlay.type === "replay" ||
      overlay.type === "image"
    ) {
      const mediaInfo = mediaElementsRef.current[overlay.id];
      if (mediaInfo && mediaInfo.element) {
        if (overlay.position !== "full") {
          // Draw border/shadow for PiP media
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 15;
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.shadowBlur = 0;
        }
        ctx.drawImage(mediaInfo.element, x, y, w, h);

        if (overlay.type === "replay") {
          // Add "REPLAY" watermark
          ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
          ctx.fillRect(x + 10, y + 10, 80, 24);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px 'DM Sans', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("REPLAY", x + 50, y + 22);
        }
      } else {
        // Placeholder if media is missing
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#fff";
        ctx.font = "14px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Media not loaded", x + w / 2, y + h / 2);
      }
      ctx.restore();
      return;
    }

    // Render External Video Link overlay
    if (overlay.type === "video-link") {
      const mediaInfo = mediaElementsRef.current[overlay.id];
      if (mediaInfo && mediaInfo.element && mediaInfo.element.readyState >= 2) {
        if (overlay.position !== "full") {
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 18;
          ctx.strokeStyle = "rgba(99,102,241,0.5)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.shadowBlur = 0;
          // Label badge
          ctx.fillStyle = "rgba(99,102,241,0.85)";
          ctx.fillRect(x + 8, y + 8, 68, 20);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 10px 'DM Sans', sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("LIVE EMBED", x + 12, y + 18);
        }
        ctx.drawImage(mediaInfo.element, x, y, w, h);
      } else {
        ctx.fillStyle = "rgba(15,23,42,0.9)";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "rgba(99,102,241,0.8)";
        ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = "#94A3B8";
        ctx.font = "13px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⏳ Loading video...", x + w / 2, y + h / 2);
      }
      ctx.restore();
      return;
    }

    // Background for Text and Scorecards
    if (overlay.position !== "full") {
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 12;
      const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
      gradient.addColorStop(0, "rgba(15, 23, 42, 0.85)");
      gradient.addColorStop(1, "rgba(30, 41, 59, 0.75)");
      ctx.fillStyle = gradient;

      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 12);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }

      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, w, h);
      }

      // Accent bar
      const accentGradient = ctx.createLinearGradient(x, y, x, y + h);
      accentGradient.addColorStop(
        0,
        overlay.type === "football-scorecard"
          ? "#10B981"
          : overlay.type === "cricket-scorecard"
            ? "#F59E0B"
            : "#3B82F6",
      );
      accentGradient.addColorStop(
        1,
        overlay.type === "football-scorecard"
          ? "#059669"
          : overlay.type === "cricket-scorecard"
            ? "#D97706"
            : "#8B5CF6",
      );
      ctx.fillStyle = accentGradient;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, 6, h, { tl: 12, bl: 12, tr: 0, br: 0 });
      } else {
        ctx.fillRect(x, y, 6, h);
      }
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(x, y, w, h);
    }

    // Drawing Content
    if (overlay.type === "football-scorecard") {
      const data = overlay.content ? JSON.parse(overlay.content) : {};
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 24px 'DM Sans', sans-serif";

      const teamA = (data.teamA || "TMA").substring(0, 3).toUpperCase();
      const teamB = (data.teamB || "TMB").substring(0, 3).toUpperCase();
      const scoreA = data.scoreA || 0;
      const scoreB = data.scoreB || 0;

      // Center separator
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(x + w / 2 - 20, y + 15, 40, h - 30);
      ctx.fillStyle = "#fff";
      ctx.fillText("-", x + w / 2, y + h / 2);

      ctx.fillStyle = "#fff";
      // Team A
      ctx.textAlign = "right";
      ctx.fillText(teamA, x + w / 2 - 35, y + h / 2);
      ctx.fillStyle = "#10B981"; // Score color
      ctx.fillText(scoreA, x + w / 2 - 95, y + h / 2);

      // Team B
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(teamB, x + w / 2 + 35, y + h / 2);
      ctx.fillStyle = "#10B981"; // Score color
      ctx.fillText(scoreB, x + w / 2 + 95, y + h / 2);
    } else if (overlay.type === "cricket-scorecard") {
      const data = overlay.content ? JSON.parse(overlay.content) : {};
      const batTeam = (data.battingTeam || "BAT").substring(0, 3).toUpperCase();
      const bowlTeam = (data.bowlingTeam || "BWL")
        .substring(0, 3)
        .toUpperCase();
      const runs = data.runs || 0;
      const wickets = data.wickets || 0;

      const bat1Name = data.bat1Name || "Batsman 1";
      const bat1Runs = data.bat1Runs || 0;
      const bat1Strike = data.bat1Strike !== false; // Default true

      const bat2Name = data.bat2Name || "Batsman 2";
      const bat2Runs = data.bat2Runs || 0;
      const bat2Strike = data.bat2Strike === true;

      const bowlName = data.bowlName || "Bowler 1";
      const bowlOvers = data.bowlOvers || 0;
      const bowlRuns = data.bowlRuns || 0;
      const bowlWickets = data.bowlWickets || 0;
      const bowlHistory = data.bowlHistory || "";

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const midY = y + h / 2;

      // 1. Teams Box (Dark Blue)
      ctx.fillStyle = "#1E3A8A";
      ctx.fillRect(x, y, 160, h);
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 20px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${batTeam} v ${bowlTeam}`, x + 80, midY);

      // 2. Score Box (Amber)
      ctx.fillStyle = "#F59E0B";
      ctx.fillRect(x + 160, y, 160, h);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 30px 'DM Sans', sans-serif";
      ctx.fillText(`${runs}-${wickets}`, x + 240, midY);

      // 2b. Overs Box (Dark navy)
      const overs = data.overs || 0;
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(x + 320, y, 90, h);
      ctx.fillStyle = "#94A3B8";
      ctx.font = "500 11px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("OVERS", x + 365, midY - 11);
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 18px 'DM Sans', sans-serif";
      ctx.fillText(String(overs), x + 365, midY + 10);

      // 3. Batsmen Area
      ctx.textAlign = "left";
      ctx.font = "bold 18px 'DM Sans', sans-serif";
      let currX = x + 425;

      const drawBatsman = (name, bRuns, isStrike) => {
        // Dot
        if (isStrike) {
          ctx.beginPath();
          ctx.arc(currX, midY, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#10B981"; // Emerald green
          ctx.fill();
        }

        ctx.fillStyle = "#F8FAFC";
        ctx.fillText(`${name}  ${bRuns}`, currX + 15, midY);
        currX += ctx.measureText(`${name}  ${bRuns}`).width + 45;
      };

      drawBatsman(bat1Name, bat1Runs, bat1Strike);

      // Divider
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(currX - 15, y + 15, 1, h - 30);

      drawBatsman(bat2Name, bat2Runs, bat2Strike);

      // Divider
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(currX - 15, y + 15, 1, h - 30);

      // 4. Bowler Area
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "600 16px 'DM Sans', sans-serif";
      ctx.fillText(`${bowlName}`, currX, midY);
      currX += ctx.measureText(bowlName).width + 20;

      // Bowler History
      if (bowlHistory) {
        const balls = bowlHistory.trim().split(/\s+/);
        balls.forEach((ball) => {
          // draw circle
          ctx.beginPath();
          ctx.arc(currX + 12, midY, 12, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.1)";
          if (ball === "W")
            ctx.fillStyle = "#EF4444"; // Red for wicket
          else if (ball === "4" || ball === "6") ctx.fillStyle = "#3B82F6"; // Blue for boundary
          ctx.fill();

          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px 'DM Sans', sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(ball, currX + 12, midY);
          ctx.textAlign = "left";
          currX += 28;
        });
      }

      // Bowler Stats (standard cricket notation: Overs-Wickets-Runs)
      currX += 15;
      ctx.fillStyle = "#94A3B8";
      ctx.font = "500 14px 'DM Sans', sans-serif";
      const bowlFigures = `${bowlOvers}-${bowlWickets}-${bowlRuns}`;
      ctx.fillText(bowlFigures, currX, midY);
    } else if (isTitleAndContent && overlay.position !== "full") {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "600 13px 'DM Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.letterSpacing = "1px";
      ctx.fillText(overlay.title.toUpperCase(), x + padding + 4, y + 16);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 22px 'DM Sans', sans-serif";
      ctx.letterSpacing = "0px";
      ctx.fillText(overlay.content, x + padding + 4, y + 42);
    } else {
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 22px 'DM Sans', sans-serif";
      ctx.textAlign = overlay.position === "full" ? "center" : "left";
      ctx.textBaseline = "middle";
      const textX = overlay.position === "full" ? x + w / 2 : x + padding + 4;
      ctx.fillText(mainText, textX, y + h / 2);
    }

    ctx.restore();
  }, []);

  // Start WebSocket streaming to backend
  const startWebSocketStreaming = useCallback(
    async (stream) => {
      const token = localStorage.getItem("streamangle_token");
      const activeDests = destinations.filter((d) => d.is_active || d.isActive);

      if (!token) {
        console.error("No auth token found for RTMP stream WebSocket");
        return false;
      }

      if (activeDests.length === 0) {
        console.log(
          "No active RTMP destinations. Platform watch stream can still work.",
        );
        return false;
      }

      const buildStreamWsUrl = (destId) => {
        let base =
          import.meta.env.VITE_STREAM_WS_URL ||
          `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/stream/ws`;

        base = String(base).trim().replace(/\/+$/, "");

        return `${base}?token=${encodeURIComponent(token)}&dest_id=${encodeURIComponent(destId)}`;
      };

      const waitForOpen = (ws, label) => {
        return new Promise((resolve) => {
          let done = false;

          const finish = (result) => {
            if (done) return;
            done = true;
            resolve(result);
          };

          const timer = setTimeout(() => {
            console.warn(`[RTMP WS] Timeout opening socket for ${label}`);
            try {
              ws.close();
            } catch {}
            finish(null);
          }, 8000);

          ws.onopen = () => {
            clearTimeout(timer);
            console.log(`[RTMP WS] Connected: ${label}`);
            finish(ws);
          };

          ws.onerror = (error) => {
            clearTimeout(timer);
            console.error(`[RTMP WS] Error for ${label}:`, error);
            finish(null);
          };
        });
      };

      if (streamWSRef.current?.close) {
        streamWSRef.current.close();
      }

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }

      const sockets = activeDests.map((dest) => {
        const ws = new WebSocket(buildStreamWsUrl(dest.id));
        ws.binaryType = "arraybuffer";

        ws.onclose = () => {
          console.log(`[RTMP WS] Closed for destination ${dest.id}`);
        };

        return {
          id: dest.id,
          label: `${dest.platform || "RTMP"} #${dest.id}`,
          ws,
        };
      });

      const opened = await Promise.all(
        sockets.map(async (item) => {
          const openedWs = await waitForOpen(item.ws, item.label);
          return openedWs ? item : null;
        }),
      );

      const openSockets = opened.filter(Boolean);

      if (openSockets.length === 0) {
        console.error("No RTMP WebSocket connections opened.");
        return false;
      }

      streamWSRef.current = {
        close: () => {
          sockets.forEach(({ ws }) => {
            try {
              if (
                ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING
              ) {
                ws.close();
              }
            } catch {}
          });
        },
      };

      const selectedMime = getSupportedMimeType();

      const wsStream = new MediaStream();

      if (canvasRef.current) {
        const freshCanvasStream = canvasRef.current.captureStream(STREAM_FPS);
        freshCanvasStream.getVideoTracks().forEach((track) => {
          wsStream.addTrack(track);
        });
      } else {
        stream.getVideoTracks().forEach((track) => {
          wsStream.addTrack(track);
        });
      }

      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
        wsStream.addTrack(track);
      });

      console.log(
        `[RTMP WS] Recorder stream tracks: video=${wsStream.getVideoTracks().length}, audio=${wsStream.getAudioTracks().length}`,
      );

      const recorderOptions = {
        videoBitsPerSecond: STREAM_VIDEO_BITRATE,
        audioBitsPerSecond: STREAM_AUDIO_BITRATE,
      };

      if (selectedMime) {
        recorderOptions.mimeType = selectedMime;
      }

      const mediaRecorder = new MediaRecorder(wsStream, recorderOptions);

      mediaRecorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) return;

        const buffer = await event.data.arrayBuffer();

        openSockets.forEach(({ id, ws }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(buffer);
          } else {
            console.warn(
              `[RTMP WS] Destination ${id} socket not open, chunk skipped`,
            );
          }
        });
      };

      mediaRecorder.onerror = (event) => {
        console.error("[RTMP WS] MediaRecorder error:", event);
      };

      mediaRecorder.onstop = () => {
        console.log("[RTMP WS] MediaRecorder stopped");

        if (streamWSRef.current?.close) {
          streamWSRef.current.close();
        }
      };

      // Smaller chunks prevent burst/pause/burst behavior.
      mediaRecorder.start(RECORDER_CHUNK_MS);
      mediaRecorderRef.current = mediaRecorder;

      console.log(
        `[RTMP WS] Started stable recorder: ${STREAM_WIDTH}x${STREAM_HEIGHT}, ${STREAM_FPS}fps, chunk=${RECORDER_CHUNK_MS}ms`,
      );

      return true;
    },
    [destinations],
  );

  const requestMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop any existing commentary stream
      if (commentaryStreamRef.current) {
        commentaryStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      commentaryStreamRef.current = stream;
      setCommentaryActive(true);
      setCommentaryMuted(false);
      return stream;
    } catch (err) {
      console.error("Failed to get microphone:", err);
      return null;
    }
  };
  // Centralized function to manage and sync Web Audio Mixer nodes
  const syncMixer = useCallback(() => {
    // Make sure we have an AudioContext and destination node
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.error("Web Audio API not supported in this browser");
        return;
      }
      try {
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;
        mixerDestinationRef.current = audioCtx.createMediaStreamDestination();
        console.log("🔊 Web Audio Mixer initialized successfully");
      } catch (err) {
        console.error("Failed to initialize AudioContext:", err);
        return;
      }
    }

    const audioCtx = audioContextRef.current;
    const destNode = mixerDestinationRef.current;
    if (!audioCtx || !destNode) return;

    // Auto-resume if context is suspended (browser autoplay policy)
    if (audioCtx.state === "suspended") {
      audioCtx
        .resume()
        .catch((err) => console.warn("Failed to resume AudioContext:", err));
    }

    const activeSources = new Set();

    // 1. Sync commentary mic
    if (commentaryActive && commentaryStreamRef.current) {
      const stream = commentaryStreamRef.current;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const sourceId = "commentary";
        activeSources.add(sourceId);

        let existing = audioSourcesRef.current[sourceId];
        // If it doesn't exist or stream changed, create it
        if (!existing || existing.stream !== stream) {
          if (existing) {
            try {
              existing.sourceNode.disconnect();
            } catch (e) {}
            try {
              existing.gainNode.disconnect();
            } catch (e) {}
          }
          try {
            const sourceNode = audioCtx.createMediaStreamSource(stream);
            const gainNode = audioCtx.createGain();
            sourceNode.connect(gainNode);
            gainNode.connect(destNode);
            audioSourcesRef.current[sourceId] = {
              sourceNode,
              gainNode,
              stream,
            };
            existing = audioSourcesRef.current[sourceId];
            console.log("🔊 Web Audio Mixer: Connected commentary mic");
          } catch (err) {
            console.error(
              "Failed to connect commentary mic to Web Audio Mixer:",
              err,
            );
          }
        }

        // Apply gain based on active and muted state
        if (existing) {
          let targetGain = 1.0; // default background / ducked volume
          if (commentaryMuted) {
            targetGain = 0.0;
          } else if (activeAudioSource === "commentary") {
            targetGain = 1.0; // highlighted / main volume
          }
          existing.gainNode.gain.setTargetAtTime(
            targetGain,
            audioCtx.currentTime,
            0.1,
          );
        }
      }
    }

    // 2. Sync connected cameras
    Object.values(cameras).forEach((cam) => {
      const sourceId = cam.id;
      const existing = audioSourcesRef.current[sourceId];

      // Node creation is handled exclusively by pc.ontrack using an unmuted audioOnlyStream.
      // syncMixer's job is just to register it as active and apply the correct gain.
      if (existing) {
        activeSources.add(sourceId);

        // Apply gain based on active and muted state
        let targetGain = 1.0; // default background / ducked volume
        if (mutedCameras[cam.id]) {
          targetGain = 0.0;
        } else if (activeAudioSource === cam.id) {
          targetGain = 1.0; // highlighted / main volume
        }
        existing.gainNode.gain.setTargetAtTime(
          targetGain,
          audioCtx.currentTime,
          0.1,
        );
      }
    });

    // 2.5 Sync active overlays
    Object.keys(activeOverlays).forEach((overlayId) => {
      const mediaInfo = mediaElementsRef.current[overlayId];
      if (
        mediaInfo &&
        mediaInfo.element &&
        (mediaInfo.element.tagName === "VIDEO" ||
          mediaInfo.element.tagName === "AUDIO")
      ) {
        const sourceId = `overlay_${overlayId}`;
        const mediaElement = mediaInfo.element;
        activeSources.add(sourceId);

        let existing = audioSourcesRef.current[sourceId];
        if (!existing || existing.mediaElement !== mediaElement) {
          if (existing) {
            try {
              existing.sourceNode.disconnect();
            } catch (e) {}
            try {
              existing.gainNode.disconnect();
            } catch (e) {}
          }
          try {
            const sourceNode = audioCtx.createMediaElementSource(mediaElement);
            const gainNode = audioCtx.createGain();
            sourceNode.connect(gainNode);
            gainNode.connect(destNode);
            gainNode.connect(audioCtx.destination); // Play locally
            audioSourcesRef.current[sourceId] = {
              sourceNode,
              gainNode,
              mediaElement,
            };
            existing = audioSourcesRef.current[sourceId];
            console.log(`🔊 Connected overlay media ${overlayId} to mixer`);
          } catch (err) {
            console.error("Failed to connect overlay media:", err);
          }
        }
        if (existing) {
          existing.gainNode.gain.setTargetAtTime(
            1.0,
            audioCtx.currentTime,
            0.1,
          );
        }
      }
    });

    // 3. Clean up any sources that are no longer active
    Object.keys(audioSourcesRef.current).forEach((sourceId) => {
      if (!activeSources.has(sourceId)) {
        const existing = audioSourcesRef.current[sourceId];
        if (existing) {
          try {
            existing.sourceNode.disconnect();
          } catch (e) {}
          try {
            existing.gainNode.disconnect();
          } catch (e) {}
          delete audioSourcesRef.current[sourceId];
          if (sourceId !== "commentary" && !sourceId.startsWith("overlay_")) {
            cleanupAutoSwitchForCamera(sourceId);
          }
          console.log(`🔊 Web Audio Mixer: Disconnected source ${sourceId}`);
        }
      }
    });
  }, [
    cameras,
    activeAudioSource,
    mutedCameras,
    commentaryActive,
    commentaryMuted,
    activeOverlays,
    cleanupAutoSwitchForCamera,
  ]);

  // Sync the audio mixer whenever inputs or active settings change
  useEffect(() => {
    syncMixer();
  }, [
    cameras,
    activeAudioSource,
    mutedCameras,
    commentaryActive,
    commentaryMuted,
    activeOverlays,
    syncMixer,
  ]);

  // Start canvas capture
  const startCanvasCapture = useCallback(async () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasStream = canvas.captureStream(30);
    const finalStream = new MediaStream();

    // Add video tracks
    canvasStream
      .getVideoTracks()
      .forEach((track) => finalStream.addTrack(track));

    // Force initialization and syncing of Web Audio mixer
    syncMixer();

    // Check if we have any audio sources already wired into the mixer
    // (camera audio is wired directly via connectAudioTrackToMixer, not through cam.stream)
    const mixerSourceCount = Object.keys(audioSourcesRef.current).length;
    let hasSystemAudio = mixerSourceCount > 0;

    // Also check commentary mic separately
    if (
      !hasSystemAudio &&
      commentaryActive &&
      commentaryStreamRef.current &&
      commentaryStreamRef.current.getAudioTracks().length > 0
    ) {
      hasSystemAudio = true;
    }

    console.log(
      `🔊 startCanvasCapture: ${mixerSourceCount} mixer source(s), hasSystemAudio=${hasSystemAudio}`,
    );

    // If there is absolutely no audio active in the system, request the microphone as a fallback
    if (!hasSystemAudio) {
      console.warn("⚠️ No audio source – requesting microphone...");
      const micStream = await requestMicrophone();
      if (micStream && micStream.getAudioTracks().length > 0) {
        console.log("✅ Using fallback microphone audio");
        syncMixer(); // Sync again now that we have commentary stream
      }
    }

    // Add the mixed audio track from the destination node to the final stream
    if (mixerDestinationRef.current) {
      const mixedStream = mixerDestinationRef.current.stream;
      const audioTracks = mixedStream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log("✅ Using Web Audio Mixer output for stream");
        audioTracks.forEach((track) => {
          track.enabled = true;
          finalStream.addTrack(track);
        });
      }
    }

    // Final check: log what we have
    console.log(
      `Final stream: video=${finalStream.getVideoTracks().length}, audio=${finalStream.getAudioTracks().length}`,
    );

    if (finalStream.getAudioTracks().length === 0) {
      console.warn("⚠️ NO AUDIO TRACK! Stream will be silent.");
      // Do not return here, otherwise the video stream won't be broadcast at all.
    }

    finalStreamRef.current = finalStream;
    // Start WebSocket streaming
    await startWebSocketStreaming(finalStream);
  }, [
    cameras,
    commentaryActive,
    commentaryStreamRef,
    syncMixer,
    requestMicrophone,
    startWebSocketStreaming,
  ]);
  // WebSocket message handlers
  const handleOffer = useCallback(
    async (msg) => {
      const cameraID = msg.from;
      const offer = msg.data?.offer;

      if (!cameraID || !offer) {
        console.warn("Invalid camera offer:", msg);
        return;
      }

      // ✅ FIX: If we already have a stable connection with this camera, skip duplicate offers
      const existingPc = peerConnectionsRef.current[cameraID];
      if (existingPc) {
        const existingState = existingPc.connectionState;
        if (existingState === "connected" || existingState === "connecting") {
          console.log(
            `Camera ${cameraID} already ${existingState}. Skipping duplicate offer.`,
          );
          return;
        }
        // Connection exists but is in bad state — clean it up
        try {
          existingPc.close();
        } catch {}
        delete peerConnectionsRef.current[cameraID];
        delete iceCandidateQueuesRef.current[cameraID];
      }

      let video = cameraVideosRef.current[cameraID];

      if (!video) {
        video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.controls = false;
        video.id = `camera-${cameraID}`;
        video.style.position = "fixed";
        video.style.left = "-99999px";
        video.style.top = "-99999px";
        video.style.width = "1px";
        video.style.height = "1px";
        video.style.opacity = "0";
        document.body.appendChild(video);
        cameraVideosRef.current[cameraID] = video;
      }

      const remoteStream = new MediaStream();

      const registerCamera = () => {
        setCameras((prev) => ({
          ...prev,
          [cameraID]: {
            id: cameraID,
            stream: remoteStream,
            videoElement: video,
            _audioTrackCount: remoteStream.getAudioTracks().length,
            _videoTrackCount: remoteStream.getVideoTracks().length,
            type: msg.data?.camera_type || "phone",
            deviceName: msg.data?.device_name || "Camera",
          },
        }));

        setActiveCameraId((prev) => prev || cameraID);
      };

      const tryPlayVideo = async () => {
        try {
          if (video.srcObject !== remoteStream) {
            video.srcObject = remoteStream;
          }

          await video.play();
          registerCamera();

          console.log(
            `✅ Studio video playing for ${cameraID}: video=${remoteStream.getVideoTracks().length}, audio=${remoteStream.getAudioTracks().length}, readyState=${video.readyState}`,
          );
        } catch (err) {
          console.warn(`Video play pending for ${cameraID}:`, err);
          registerCamera();
        }
      };

      video.onloadedmetadata = tryPlayVideo;
      video.oncanplay = tryPlayVideo;
      video.onplaying = registerCamera;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[cameraID] = pc;
      iceCandidateQueuesRef.current[cameraID] = [];

      // ✅ FIX: Suppress noisy ICE 701 errors (IPv6 STUN lookup — expected)
      pc.onicecandidateerror = (event) => {
        if (event.errorCode !== 701) {
          console.error("[ICE ERROR]", {
            url: event.url,
            errorCode: event.errorCode,
            errorText: event.errorText,
            address: event.address,
            port: event.port,
          });
        }
      };

      const connectAudioTrackToMixer = (audioTrack) => {
        if (!audioContextRef.current) {
          const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

          if (!AudioContextClass) {
            console.error("Web Audio API not supported");
            return;
          }

          try {
            audioContextRef.current = new AudioContextClass();
            mixerDestinationRef.current =
              audioContextRef.current.createMediaStreamDestination();
            console.log("🔊 Web Audio Mixer initialized from camera track");
          } catch (err) {
            console.error("Failed to init AudioContext:", err);
            return;
          }
        }

        const audioCtx = audioContextRef.current;
        const destNode = mixerDestinationRef.current;

        if (!audioCtx || !destNode) return;

        if (audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }

        const existing = audioSourcesRef.current[cameraID];

        if (existing) {
          try {
            existing.sourceNode.disconnect();
          } catch {}
          try {
            existing.gainNode.disconnect();
          } catch {}
          cleanupAutoSwitchForCamera(cameraID);
        }

        const audioOnlyStream = new MediaStream([audioTrack]);

        try {
          const sourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);
          const gainNode = audioCtx.createGain();

          gainNode.gain.value = 1.0;

          sourceNode.connect(gainNode);
          gainNode.connect(destNode);

          audioSourcesRef.current[cameraID] = {
            sourceNode,
            gainNode,
            stream: audioOnlyStream,
            audioTrackCount: 1,
          };

          setActiveAudioSource((prev) => prev || cameraID);

          console.log(`🔊 Audio connected for ${cameraID}`);
        } catch (err) {
          console.error(`Failed to connect audio for ${cameraID}:`, err);
        }
      };

      pc.ontrack = (event) => {
        console.log(
          `📡 Track received from ${cameraID}: kind=${event.track.kind}, state=${event.track.readyState}`,
        );

        remoteStream.addTrack(event.track);

        if (event.track.kind === "audio") {
          connectAudioTrackToMixer(event.track);
        }

        if (event.track.kind === "video") {
          if (video.srcObject !== remoteStream) {
            video.srcObject = remoteStream;
          }

          event.track.onunmute = () => {
            console.log(`✅ Video track unmuted for ${cameraID}`);
            tryPlayVideo();
          };

          event.track.onended = () => {
            console.warn(`⚠️ Video track ended for ${cameraID}`);
          };
        }

        registerCamera();
        tryPlayVideo();
      };

      // ✅ FIX: Proper disconnect/failure handling with ICE restart
      let disconnectTimer = null;
      let iceRestartAttempted = false;

      pc.onconnectionstatechange = () => {
        console.log(`Camera ${cameraID} connectionState:`, pc.connectionState);

        if (pc.connectionState === "connected") {
          if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
          }
          iceRestartAttempted = false; // Reset on successful connection
          return;
        }

        if (pc.connectionState === "disconnected") {
          if (disconnectTimer) clearTimeout(disconnectTimer);

          // ✅ FIX: Try ICE restart first, only request new offer if that fails
          disconnectTimer = setTimeout(() => {
            const currentPc = peerConnectionsRef.current[cameraID];

            if (
              currentPc &&
              currentPc === pc &&
              currentPc.connectionState === "disconnected"
            ) {
              if (!iceRestartAttempted) {
                console.warn(
                  `Camera ${cameraID} still disconnected. Attempting ICE restart...`,
                );
                iceRestartAttempted = true;
                try {
                  currentPc.restartIce();
                } catch (err) {
                  console.warn(`ICE restart failed for ${cameraID}:`, err);
                }

                // Wait another 10s after ICE restart before requesting new offer
                disconnectTimer = setTimeout(() => {
                  const retryPc = peerConnectionsRef.current[cameraID];
                  if (
                    retryPc &&
                    retryPc === pc &&
                    retryPc.connectionState !== "connected" &&
                    retryPc.connectionState !== "connecting"
                  ) {
                    console.warn(
                      `Camera ${cameraID} still not connected after ICE restart. Requesting new offer.`,
                    );
                    send("request_offer", {}, cameraID);
                  }
                }, 10000);
              } else {
                console.warn(
                  `Camera ${cameraID} still disconnected after ICE restart. Requesting new offer.`,
                );
                send("request_offer", {}, cameraID);
              }
            }
          }, 5000); // ✅ FIX: Reduced from 8000ms to 5000ms — faster recovery

          return;
        }

        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          console.warn(`Camera ${cameraID} failed/closed. Cleaning up.`);

          if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
          }

          try {
            pc.close();
          } catch {}

          delete peerConnectionsRef.current[cameraID];
          delete iceCandidateQueuesRef.current[cameraID];

          // ✅ FIX: Clean up audio source for this camera
          const audioSource = audioSourcesRef.current[cameraID];
          if (audioSource) {
            try {
              audioSource.sourceNode.disconnect();
            } catch {}
            try {
              audioSource.gainNode.disconnect();
            } catch {}
            delete audioSourcesRef.current[cameraID];
          }
          cleanupAutoSwitchForCamera(cameraID);

          setCameras((prev) => {
            const next = { ...prev };
            delete next[cameraID];
            return next;
          });

          // ✅ FIX: Only request new offer — don't immediately create a new peer connection
          // The camera will handle sending a new offer when it receives request_offer
          send("request_offer", {}, cameraID);
        }
      };

      // ✅ FIX: Add ICE connection state monitoring
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        console.log(`Camera ${cameraID} iceConnectionState:`, iceState);

        // ✅ FIX: Try ICE restart on ICE failure
        if (iceState === "failed") {
          console.warn(
            `Camera ${cameraID} ICE failed. Attempting restartIce()...`,
          );
          try {
            pc.restartIce();
          } catch (err) {
            console.warn(`restartIce() failed for ${cameraID}:`, err);
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const raw = event.candidate.candidate || "";
          const type = raw.match(/ typ ([a-z]+)/)?.[1];
          const protocol = raw.match(/ udp | tcp /)?.[0]?.trim();

          console.log("[ICE CANDIDATE]", {
            type,
            protocol,
            camera: cameraID,
            candidate: raw,
          });

          send("candidate", { candidate: event.candidate }, cameraID);
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        const queued = iceCandidateQueuesRef.current[cameraID] || [];
        for (const candidate of queued) {
          pc.addIceCandidate(candidate).catch(console.error);
        }
        iceCandidateQueuesRef.current[cameraID] = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        send("answer", { answer }, cameraID);

        console.log(`✅ Answer sent to camera ${cameraID}`);
      } catch (err) {
        console.error("Error handling camera offer:", err);
      }
    },
    [send],
  );
  const handleCandidate = useCallback((msg) => {
    const senderID = msg.from;
    const pc =
      peerConnectionsRef.current[senderID] ||
      viewerPeerConnectionsRef.current[senderID];
    if (pc && msg.data.candidate) {
      const candidate = new RTCIceCandidate(msg.data.candidate);
      if (pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(candidate).catch(console.error);
      } else {
        if (!iceCandidateQueuesRef.current[senderID]) {
          iceCandidateQueuesRef.current[senderID] = [];
        }
        iceCandidateQueuesRef.current[senderID].push(candidate);
      }
    }
  }, []);

  const handleViewerReady = useCallback(
    async (msg) => {
      const viewerID = msg.from;
      const stream = finalStreamRef.current;
      if (!stream) {
        console.warn("Viewer ready but no stream active yet.");
        return;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      viewerPeerConnectionsRef.current[viewerID] = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const raw = event.candidate.candidate || "";
          const type = raw.match(/ typ ([a-z]+)/)?.[1];
          const protocol = raw.match(/ udp | tcp /)?.[0]?.trim();

          console.log("[ICE CANDIDATE]", {
            type,
            protocol,
            candidate: raw,
          });

          send("candidate", { candidate: event.candidate }, viewerID);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send("offer", { offer }, viewerID);
      } catch (err) {
        console.error("Failed to create offer for viewer:", err);
      }
    },
    [send],
  );

  const handleAnswer = useCallback(async (msg) => {
    const senderID = msg.from;
    const pc = viewerPeerConnectionsRef.current[senderID];
    if (pc && msg.data.answer) {
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(msg.data.answer),
        );
      } catch (err) {
        console.error("Failed to set viewer answer:", err);
      }
    }
  }, []);

  const handleClientJoined = useCallback(
    (msg) => {
      if (msg.data?.role === "viewer") {
        setViewerCount((prev) => prev + 1);
        return;
      }

      if (msg.data?.role === "camera") {
        const cameraID = msg.from;

        console.log(`📷 Camera joined: ${cameraID}`);

        // ✅ FIX: Only request offer if we don't already have a connection
        // This prevents duplicate peer connections for the same camera
        setTimeout(() => {
          const existingPc = peerConnectionsRef.current[cameraID];
          if (
            !existingPc ||
            (existingPc.connectionState !== "connected" &&
              existingPc.connectionState !== "connecting")
          ) {
            console.log(`📷 Requesting offer from camera ${cameraID}`);
            send(
              "request_offer",
              {
                event_code: eventCode,
                reason: "studio_request_after_camera_join",
              },
              cameraID,
            );
          } else {
            console.log(
              `📷 Camera ${cameraID} already connected, skipping request_offer`,
            );
          }
        }, 1000); // ✅ FIX: Increased from 500ms to 1000ms — give camera time to send its own offer first
      }
    },
    [send, eventCode],
  );

  const handleClientLeft = useCallback(
    (msg) => {
      if (msg.data?.role === "viewer") {
        setViewerCount((prev) => Math.max(0, prev - 1));
      }
      if (msg.data?.role === "camera") {
        setCameras((prev) => {
          const next = { ...prev };
          delete next[msg.from];
          return next;
        });
        if (activeCameraId === msg.from) {
          setActiveCameraId(Object.keys(cameras)[0] || null);
        }
        if (activeAudioSource === msg.from) {
          const nextAudioCam = Object.values(cameras).find(
            (c) => c.id !== msg.from && c.stream?.getAudioTracks().length > 0,
          );
          if (nextAudioCam) {
            setActiveAudioSource(nextAudioCam.id);
          } else if (commentaryActive) {
            setActiveAudioSource("commentary");
          } else {
            setActiveAudioSource(null);
          }
        }
      }
    },
    [activeCameraId, cameras, activeAudioSource, commentaryActive],
  );

  const handleCameraZoom = useCallback((msg) => {
    if (msg.data && msg.data.zoom) {
      setCameraZoom((prev) => ({
        ...prev,
        [msg.from]: parseFloat(msg.data.zoom),
      }));
    }
  }, []);

  // Register WebSocket handlers
  useEffect(() => {
    on("offer", handleOffer);
    on("candidate", handleCandidate);
    on("viewer_ready", handleViewerReady);
    on("answer", handleAnswer);
    on("client_joined", handleClientJoined);
    on("client_left", handleClientLeft);
    on("camera_zoom", handleCameraZoom);

    return () => {
      off("offer", handleOffer);
      off("candidate", handleCandidate);
      off("viewer_ready", handleViewerReady);
      off("answer", handleAnswer);
      off("client_joined", handleClientJoined);
      off("client_left", handleClientLeft);
      off("camera_zoom", handleCameraZoom);
    };
  }, [
    on,
    off,
    handleOffer,
    handleCandidate,
    handleViewerReady,
    handleAnswer,
    handleClientJoined,
    handleClientLeft,
    handleCameraZoom,
  ]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const events = await getEvents();
        const event = events.find(
          (e) =>
            e.unique_code === eventCode ||
            e.code === eventCode ||
            String(e.id) === String(eventCode),
        );
        if (event) {
          const normalizedEvent = {
            ...event,
            unique_code: event.unique_code || event.code,
            name: event.name || event.title,
            title: event.title || event.name,
          };
          setEventData(normalizedEvent);
          const ov = await getOverlays(normalizedEvent.id);
          setOverlays(ov);
          const dest = await getDestinations(normalizedEvent.id);
          setDestinations(dest);
          const market = await getSponsoredAds().catch(() => []);
          setSponsoredAds(Array.isArray(market) ? market : []);
        }
      } catch (err) {
        console.error("Failed to load data:", err);
      }
    };
    loadData();
  }, [eventCode]);

  // Canvas rendering loop — driven by a Web Worker timer so it keeps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    let animationId = null;
    let lastFrameTime = 0;
    const frameInterval = 1000 / STREAM_FPS;

    const render = (now) => {
      animationId = requestAnimationFrame(render);

      if (now - lastFrameTime < frameInterval) return;
      lastFrameTime = now;

      ctx.fillStyle = "#080C0F";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cameraList = Object.values(cameras);
      const {
        slot1: cam1,
        slot2: cam2,
        slot3: cam3,
        slot4: cam4,
      } = getResolvedSlots();

      if (cameraList.length > 0) {
        if (activeLayout === "single") {
          if (cam1) {
            drawCameraFeed(
              ctx,
              cam1,
              `${cam1.id.split("_")[0]} (Main)`,
              0,
              0,
              canvas.width,
              canvas.height,
            );
          }
        } else if (activeLayout === "side-by-side") {
          const halfW = canvas.width / 2;

          drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Left)` : "Camera 1 (Offline)",
            0,
            0,
            halfW,
            canvas.height,
          );

          drawCameraFeed(
            ctx,
            cam2,
            cam2 ? `${cam2.id.split("_")[0]} (Right)` : "Camera 2 (Offline)",
            halfW,
            0,
            halfW,
            canvas.height,
          );

          ctx.fillStyle = "#1E293B";
          ctx.fillRect(halfW - 1, 0, 2, canvas.height);
        } else if (activeLayout === "pip") {
          drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Main)` : "Camera 1 (Offline)",
            0,
            0,
            canvas.width,
            canvas.height,
          );

          if (cam2) {
            const pipW = canvas.width / 4;
            const pipH = canvas.height / 4;
            const pipX = canvas.width - pipW - 20;
            const pipY = canvas.height - pipH - 20;

            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 15;
            ctx.fillStyle = "#090D11";
            ctx.fillRect(pipX - 2, pipY - 2, pipW + 4, pipH + 4);
            ctx.restore();

            drawCameraFeed(
              ctx,
              cam2,
              `${cam2.id.split("_")[0]} (PiP)`,
              pipX,
              pipY,
              pipW,
              pipH,
            );
          }
        } else if (activeLayout === "grid") {
          const w = canvas.width / 2;
          const h = canvas.height / 2;

          drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Cam 1)` : "Camera 1 (Offline)",
            0,
            0,
            w,
            h,
          );

          drawCameraFeed(
            ctx,
            cam2,
            cam2 ? `${cam2.id.split("_")[0]} (Cam 2)` : "Camera 2 (Offline)",
            w,
            0,
            w,
            h,
          );

          drawCameraFeed(
            ctx,
            cam3,
            cam3 ? `${cam3.id.split("_")[0]} (Cam 3)` : "Camera 3 (Offline)",
            0,
            h,
            w,
            h,
          );

          drawCameraFeed(
            ctx,
            cam4,
            cam4 ? `${cam4.id.split("_")[0]} (Cam 4)` : "Camera 4 (Offline)",
            w,
            h,
            w,
            h,
          );

          ctx.fillStyle = "#1E293B";
          ctx.fillRect(w - 1, 0, 2, canvas.height);
          ctx.fillRect(0, h - 1, canvas.width, 2);
        } else if (activeLayout === "wide-cu") {
          const mainW = canvas.width * 0.75;
          const sideW = canvas.width * 0.25;
          const sideH = canvas.height / 2;

          drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Wide)` : "Camera 1 (Offline)",
            0,
            0,
            mainW,
            canvas.height,
          );

          drawCameraFeed(
            ctx,
            cam2,
            cam2 ? `${cam2.id.split("_")[0]} (CU 1)` : "Camera 2 (Offline)",
            mainW,
            0,
            sideW,
            sideH,
          );

          drawCameraFeed(
            ctx,
            cam3,
            cam3 ? `${cam3.id.split("_")[0]} (CU 2)` : "Camera 3 (Offline)",
            mainW,
            sideH,
            sideW,
            sideH,
          );

          ctx.fillStyle = "#1E293B";
          ctx.fillRect(mainW - 1, 0, 2, canvas.height);
          ctx.fillRect(mainW, sideH - 1, sideW, 2);
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "24px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          "Waiting for cameras...",
          canvas.width / 2,
          canvas.height / 2,
        );
      }

      overlays.forEach((overlay) => {
        if (activeOverlays[overlay.id]) {
          renderOverlay(ctx, overlay);
        }
      });

      if (isLive) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.fillRect(16, 16, 70, 28);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("● LIVE", 51, 35);
      }
    };

    animationId = requestAnimationFrame(render);
    frameRequestRef.current = animationId;

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (frameRequestRef.current)
        cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    };
  }, [
    cameras,
    activeCameraId,
    activeLayout,
    overlays,
    activeOverlays,
    isLive,
    drawCameraFeed,
    getResolvedSlots,
    renderOverlay,
  ]);
  // Go Live
  const goLive = async () => {
    if (!eventData) return;
    try {
      await updateEvent(eventData.id, { status: "live" });
      isLiveRef.current = true;
      setIsLive(true);
      setLiveStartTime(Date.now());

      // Start RTMP stream on backend (optional if only streaming on-platform)
      try {
        await startRTMPStream(eventData.id);
      } catch (rtmpErr) {
        console.warn(
          "RTMP streaming disabled or failed to start. Streaming on platform only.",
        );
      }

      setTimeout(() => startCanvasCapture(), 300);
    } catch (err) {
      console.error("Failed to go live:", err);
      alert("Failed to go live: " + err.message);
    }
  };

  // End Live
  const endLive = async () => {
    if (!eventData) return;
    try {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (streamWSRef.current) {
        streamWSRef.current.close();
      }
      try {
        await stopRTMPStream(eventData.id);
      } catch (rtmpErr) {
        console.warn("RTMP streaming stop failed (likely wasn't running).");
      }
      await updateEvent(eventData.id, { status: "ended" });
      isLiveRef.current = false;
      setIsLive(false);
      setLiveStartTime(null);
    } catch (err) {
      console.error("Failed to end live:", err);
    }
  };

  // Live timer
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (frameRequestRef.current)
        cancelAnimationFrame(frameRequestRef.current);
      // Stop Web Worker timer
      if (timerWorkerRef.current) {
        timerWorkerRef.current.postMessage("stop");
        timerWorkerRef.current.terminate();
        timerWorkerRef.current = null;
      }
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      if (streamWSRef.current) streamWSRef.current.close();
      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      Object.values(cameraVideosRef.current).forEach((video) => {
        if (video.srcObject)
          video.srcObject.getTracks().forEach((t) => t.stop());
        video.remove();
      });
      if (commentaryStreamRef.current) {
        commentaryStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      // Stop screen share
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach((t) => t.stop());
        screenShareStreamRef.current = null;
      }
      // Stop per-camera recorders
      Object.values(cameraRecordersRef.current).forEach((rec) => {
        try {
          rec.stop();
        } catch (e) {}
      });
      cameraRecordersRef.current = {};
      // Destroy HLS instances
      Object.values(hlsInstancesRef.current).forEach((hls) => {
        try {
          hls.destroy();
        } catch (e) {}
      });
      hlsInstancesRef.current = {};
      // Clean up Web Audio Mixer
      if (audioSourcesRef.current) {
        Object.values(audioSourcesRef.current).forEach((source) => {
          try {
            source.sourceNode.disconnect();
          } catch (e) {}
          try {
            source.gainNode.disconnect();
          } catch (e) {}
        });
        audioSourcesRef.current = {};
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.warn);
        audioContextRef.current = null;
      }
      mixerDestinationRef.current = null;
    };
  }, []);

  // Commentary functions
  const startCommentary = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      commentaryStreamRef.current = stream;
      setCommentaryActive(true);
      setCommentaryMuted(false);
    } catch (err) {
      console.error("Failed to get microphone:", err);
    }
  };

  const stopCommentary = () => {
    if (commentaryStreamRef.current) {
      commentaryStreamRef.current.getTracks().forEach((t) => t.stop());
      commentaryStreamRef.current = null;
    }
    setCommentaryActive(false);
  };

  const toggleCommentaryMute = () => {
    if (commentaryStreamRef.current) {
      const audioTracks = commentaryStreamRef.current.getAudioTracks();
      const newMuted = !commentaryMuted;
      audioTracks.forEach((t) => (t.enabled = !newMuted));
      setCommentaryMuted(newMuted);
    }
  };

  // Layout change
  const changeLayout = (layout) => {
    setActiveLayout(layout);
    send("layout_change", { layout });
  };

  // Overlay handlers
  const handleCreateOverlay = async () => {
    if (!eventData || !newOverlay.title) return;
    try {
      let finalContent = newOverlay.content;
      if (
        newOverlay.type === "football-scorecard" ||
        newOverlay.type === "cricket-scorecard"
      ) {
        finalContent = JSON.stringify(scorecardData);
      }

      const payload = { ...newOverlay, content: finalContent };
      const ov = await createOverlay(eventData.id, payload);

      // Store local media object if any
      if (
        newOverlayMedia &&
        (newOverlay.type === "ad" ||
          newOverlay.type === "replay" ||
          newOverlay.type === "image")
      ) {
        const url = URL.createObjectURL(newOverlayMedia);
        if (newOverlayMedia.type.startsWith("video/")) {
          const video = document.createElement("video");
          video.src = url;
          video.loop = newOverlay.type === "ad"; // Ads usually loop
          video.muted = true;
          video.playsInline = true;
          video.load();
          mediaElementsRef.current[ov.id] = {
            type: "video",
            element: video,
            url,
          };
        } else if (newOverlayMedia.type.startsWith("image/")) {
          const img = new Image();
          img.src = url;
          mediaElementsRef.current[ov.id] = {
            type: "image",
            element: img,
            url,
          };
        }
      }

      // Set up external video-link overlay
      if (newOverlay.type === "video-link" && newOverlayVideoUrl) {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        const url = newOverlayVideoUrl.trim();
        if (url.endsWith(".m3u8") || url.includes(".m3u8?")) {
          // HLS stream
          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () =>
              video.play().catch(console.warn),
            );
            hlsInstancesRef.current[ov.id] = hls;
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url; // Safari native HLS
            video.play().catch(console.warn);
          }
        } else {
          video.src = url;
          video.play().catch(console.warn);
        }
        mediaElementsRef.current[ov.id] = {
          type: "video-link",
          element: video,
          url,
        };
        setNewOverlayVideoUrl("");
      }

      setOverlays((prev) => [...prev, ov]);
      setNewOverlay({
        type: "text",
        title: "",
        content: "",
        position: "top-right",
        duration: 0,
      });
      setNewOverlayMedia(null);
      setScorecardData({});
    } catch (err) {
      console.error("Failed to create overlay:", err);
    }
  };

  const toggleOverlayActive = async (overlay) => {
    try {
      const newState = !activeOverlays[overlay.id];
      await updateOverlay(overlay.id, { is_active: newState });
      setActiveOverlays((prev) => ({ ...prev, [overlay.id]: newState }));

      // Handle media elements playback
      const mediaInfo = mediaElementsRef.current[overlay.id];
      if (
        mediaInfo &&
        (mediaInfo.type === "video" || mediaInfo.type === "video-link")
      ) {
        if (newState) {
          mediaInfo.element.currentTime = 0; // Restart video on show
          mediaInfo.element.muted = false; // Unmute so WebAudio captures sound
          mediaInfo.element.play().catch(console.error);
        } else {
          mediaInfo.element.pause();
        }
      }
    } catch (err) {
      console.error("Failed to toggle overlay:", err);
    }
  };

  const handleDeleteOverlay = async (id) => {
    try {
      await deleteOverlay(id);
      setOverlays((prev) => prev.filter((o) => o.id !== id));
      setActiveOverlays((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      // Clean up local media URLs
      if (mediaElementsRef.current[id]) {
        URL.revokeObjectURL(mediaElementsRef.current[id].url);
        delete mediaElementsRef.current[id];
      }
      // Clean up HLS instance for video-link overlays
      if (hlsInstancesRef.current[id]) {
        hlsInstancesRef.current[id].destroy();
        delete hlsInstancesRef.current[id];
      }
    } catch (err) {
      console.error("Failed to delete overlay:", err);
    }
  };

  // ── Feature 3: Screen Sharing ───────────────────────────────────────────────
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });
      screenShareStreamRef.current = stream;

      // Create a hidden video element for the screen share
      const screenId = `screen_${Date.now()}`;
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.id = `screen-share-${screenId}`;
      document.body.appendChild(video);
      cameraVideosRef.current[screenId] = video;

      video.onloadedmetadata = () => {
        setCameras((prev) => ({
          ...prev,
          [screenId]: {
            id: screenId,
            stream,
            videoElement: video,
            type: "screen",
            deviceName: "🖥️ Screen Share",
            _audioTrackCount: stream.getAudioTracks().length,
          },
        }));
        setActiveCameraId((prev) => prev || screenId);
      };

      // Wire audio from screen share to mixer if available
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        if (!audioContextRef.current) {
          const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
          mixerDestinationRef.current =
            audioContextRef.current.createMediaStreamDestination();
        }
        const audioCtx = audioContextRef.current;
        const destNode = mixerDestinationRef.current;
        const audioOnlyStream = new MediaStream(audioTracks);
        const sourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 1.0;
        sourceNode.connect(gainNode);
        gainNode.connect(destNode);
        audioSourcesRef.current[screenId] = {
          sourceNode,
          gainNode,
          stream: audioOnlyStream,
        };
        setActiveAudioSource((prev) => prev || screenId);
      }

      setIsScreenSharing(true);

      // Auto-stop when user ends the share from browser UI
      stream.getVideoTracks()[0].onended = () => stopScreenShare(screenId);
    } catch (err) {
      if (err.name !== "NotAllowedError") {
        console.error("Screen share failed:", err);
      }
    }
  };

  const stopScreenShare = (screenId) => {
    // Find the screen share camera id if not provided
    const sid =
      screenId ||
      Object.keys(cameras).find((id) => cameras[id]?.type === "screen");
    if (!sid) return;

    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((t) => t.stop());
      screenShareStreamRef.current = null;
    }
    if (cameraVideosRef.current[sid]) {
      cameraVideosRef.current[sid].remove();
      delete cameraVideosRef.current[sid];
    }
    // Clean up audio mixer node
    if (audioSourcesRef.current[sid]) {
      try {
        audioSourcesRef.current[sid].sourceNode.disconnect();
      } catch (e) {}
      try {
        audioSourcesRef.current[sid].gainNode.disconnect();
      } catch (e) {}
      delete audioSourcesRef.current[sid];
    }
    cleanupAutoSwitchForCamera(sid);
    setCameras((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    setIsScreenSharing(false);
  };

  // ── Feature 1: Local 10-Second Clip Recording ──────────────────────────────
  const enableLocalRecording = async () => {
    if (!("showDirectoryPicker" in window)) {
      alert(
        "Your browser doesn't support the File System Access API. Please use Chrome or Edge.",
      );
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      // Create StreamAngle root folder
      const rootHandle = await dirHandle.getDirectoryHandle(
        "StreamAngle Recordings",
        { create: true },
      );
      recordingDirHandleRef.current = rootHandle;
      setDownloadEnabled(true);
      startPerCameraRecording(rootHandle);
    } catch (err) {
      if (err.name !== "AbortError")
        console.error("Directory picker failed:", err);
    }
  };

  const startPerCameraRecording = async (rootHandle) => {
    const activeCams = Object.values(cameras);
    for (const cam of activeCams) {
      if (cameraRecordersRef.current[cam.id]) continue; // already recording
      if (!cam.stream || cam.stream.getVideoTracks().length === 0) continue;

      try {
        const camName = (cam.deviceName || cam.id).replace(
          /[^a-z0-9_\-]/gi,
          "_",
        );
        const camDirHandle = await rootHandle.getDirectoryHandle(camName, {
          create: true,
        });

        const formats = [
          { mime: "video/mp4", ext: "mp4" },
          { mime: "video/webm;codecs=h264", ext: "webm" },
          { mime: "video/webm;codecs=vp9", ext: "webm" },
          { mime: "video/webm", ext: "webm" },
        ];

        let selectedFormat = formats[3]; // default fallback
        for (const format of formats) {
          if (MediaRecorder.isTypeSupported(format.mime)) {
            selectedFormat = format;
            break;
          }
        }

        const startRecordingChunk = () => {
          if (!recordingDirHandleRef.current) return; // stopped

          const recorder = new MediaRecorder(cam.stream, {
            mimeType: selectedFormat.mime,
          });

          recorder.ondataavailable = async (e) => {
            if (e.data && e.data.size > 0 && recordingDirHandleRef.current) {
              const filename = `clip_${Date.now()}.${selectedFormat.ext}`;
              try {
                const fileHandle = await camDirHandle.getFileHandle(filename, {
                  create: true,
                });
                const writable = await fileHandle.createWritable();
                await writable.write(e.data);
                await writable.close();
                console.log(
                  `📹 Saved ${camName}/${filename} (${(e.data.size / 1024).toFixed(1)}KB)`,
                );
              } catch (writeErr) {
                console.error("Failed to write clip:", writeErr);
              }
            }
          };

          recorder.start();
          cameraRecordersRef.current[cam.id] = recorder;
        };

        // Start first chunk
        startRecordingChunk();
        console.log(`🔴 Started local recording for ${camName}`);

        // Cycle the recorder every 10 seconds to generate standalone playable files with proper headers
        cameraRecordersIntervalsRef.current[cam.id] = setInterval(() => {
          if (
            cameraRecordersRef.current[cam.id] &&
            cameraRecordersRef.current[cam.id].state !== "inactive"
          ) {
            cameraRecordersRef.current[cam.id].stop();
          }
          startRecordingChunk();
        }, 10000);
      } catch (err) {
        console.error(`Failed to start recording for cam ${cam.id}:`, err);
      }
    }
  };

  const disableLocalRecording = () => {
    Object.values(cameraRecordersRef.current).forEach((rec) => {
      try {
        rec.stop();
      } catch (e) {}
    });
    Object.values(cameraRecordersIntervalsRef.current).forEach((interval) => {
      clearInterval(interval);
    });
    cameraRecordersRef.current = {};
    cameraRecordersIntervalsRef.current = {};
    recordingDirHandleRef.current = null;
    setDownloadEnabled(false);
  };

  // When new cameras connect while recording is active, start recording them too
  useEffect(() => {
    if (downloadEnabled && recordingDirHandleRef.current) {
      startPerCameraRecording(recordingDirHandleRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameras, downloadEnabled]);

  // Cricket Scoring Engine
  const addDelivery = (overlay, delivery) => {
    const data = overlay.content ? JSON.parse(overlay.content) : {};

    // Initialize all fields with defaults
    data.legalBalls = data.legalBalls ?? 0;
    data.runs = data.runs ?? 0;
    data.wickets = data.wickets ?? 0;
    data.bat1Name = data.bat1Name ?? "Batsman 1";
    data.bat1Runs = data.bat1Runs ?? 0;
    data.bat1Strike = data.bat1Strike !== false;
    data.bat2Name = data.bat2Name ?? "Batsman 2";
    data.bat2Runs = data.bat2Runs ?? 0;
    data.bat2Strike = data.bat2Strike ?? false;
    data.bowlName = data.bowlName ?? "Bowler";
    data.bowlOvers = data.bowlOvers ?? 0;
    data.bowlRuns = data.bowlRuns ?? 0;
    data.bowlWickets = data.bowlWickets ?? 0;
    data.bowlHistory = data.bowlHistory ?? "";
    data.battingLog = data.battingLog ?? []; // [{name, runs, out}]
    data.bowlingLog = data.bowlingLog ?? []; // [{name, overs, wickets, runs}]

    // Use local ref for undo log (never sent to server)
    if (!cricketBallLogsRef.current[overlay.id]) {
      cricketBallLogsRef.current[overlay.id] = [];
    }
    const ballLog = cricketBallLogsRef.current[overlay.id];

    if (delivery === "Undo") {
      if (ballLog.length > 0) {
        const prev = JSON.parse(ballLog.pop());
        Object.keys(prev).forEach((k) => {
          data[k] = prev[k];
        });
      }
    } else {
      // Snapshot current state BEFORE the delivery
      const snapshot = JSON.stringify({ ...data });

      const isStriker1 = data.bat1Strike;
      const histArr = data.bowlHistory
        ? data.bowlHistory.split(" ").filter(Boolean)
        : [];

      // ---- Parse compound extras: "Wd+2", "Nb+4", "Lb+1", "B+2" ----
      const extraMatch = delivery.match(/^(Wd|Nb|Lb|B)\+(\d+)$/);

      if (extraMatch) {
        const type = extraMatch[1];
        const extraRuns = parseInt(extraMatch[2]);

        if (type === "Wd") {
          // Wide: 1 penalty + extra running. NOT a legal ball. No batsman runs. No strike rotation.
          const total = 1 + extraRuns;
          data.runs += total;
          data.bowlRuns += total;
          histArr.push(`Wd+${extraRuns}`);
          // not a legal ball → skip legalBalls increment
        } else if (type === "Nb") {
          // No Ball: 1 penalty + runs off bat (credited to batsman). NOT a legal ball.
          const total = 1 + extraRuns;
          data.runs += total;
          data.bowlRuns += total;
          if (isStriker1) data.bat1Runs += extraRuns;
          else data.bat2Runs += extraRuns;
          histArr.push(`Nb+${extraRuns}`);
          // Strike rotates on odd batsman runs
          if (extraRuns % 2 !== 0) {
            data.bat1Strike = !isStriker1;
            data.bat2Strike = isStriker1;
          }
          // not a legal ball → skip legalBalls increment
        } else if (type === "Lb") {
          // Leg Bye: runs NOT to batsman. Legal ball. Strike rotates on odd runs.
          data.runs += extraRuns;
          // Leg bye runs NOT charged to bowler (team extra)
          histArr.push(`Lb+${extraRuns}`);
          if (extraRuns % 2 !== 0) {
            data.bat1Strike = !isStriker1;
            data.bat2Strike = isStriker1;
          }
          data.legalBalls += 1;
        } else if (type === "B") {
          // Bye: runs NOT to batsman. Legal ball. Strike rotates on odd runs.
          data.runs += extraRuns;
          // Bye runs NOT charged to bowler (team extra)
          histArr.push(`B+${extraRuns}`);
          if (extraRuns % 2 !== 0) {
            data.bat1Strike = !isStriker1;
            data.bat2Strike = isStriker1;
          }
          data.legalBalls += 1;
        }
      } else if (delivery === "Wd") {
        data.runs += 1;
        data.bowlRuns += 1;
        histArr.push("Wd");
      } else if (delivery === "Nb") {
        data.runs += 1;
        data.bowlRuns += 1;
        histArr.push("Nb");
      } else if (delivery === "Lb") {
        // Simple Leg Bye +1
        data.runs += 1;
        histArr.push("Lb");
        data.legalBalls += 1;
      } else if (delivery === "B") {
        // Simple Bye +1
        data.runs += 1;
        histArr.push("B");
        data.legalBalls += 1;
      } else if (delivery === "W") {
        data.wickets += 1;
        data.bowlWickets += 1;
        histArr.push("W");
        // Save dismissed batsman to batting log
        if (isStriker1) {
          data.battingLog.push({
            name: data.bat1Name,
            runs: data.bat1Runs,
            out: true,
          });
          data.bat1Name = "New Batsman";
          data.bat1Runs = 0;
        } else {
          data.battingLog.push({
            name: data.bat2Name,
            runs: data.bat2Runs,
            out: true,
          });
          data.bat2Name = "New Batsman";
          data.bat2Runs = 0;
        }
        data.legalBalls += 1;
      } else {
        // Normal run: 0, 1, 2, 3, 4, 6
        const r = parseInt(delivery) || 0;
        data.runs += r;
        data.bowlRuns += r;
        if (isStriker1) data.bat1Runs += r;
        else data.bat2Runs += r;
        histArr.push(String(r));
        // Rotate strike on odd runs
        if (r % 2 !== 0) {
          data.bat1Strike = !isStriker1;
          data.bat2Strike = isStriker1;
        }
        data.legalBalls += 1;
      }

      data.bowlHistory = histArr.join(" ");

      // Check over completion (only legal balls count)
      const isLegal = !extraMatch
        ? delivery !== "Wd" && delivery !== "Nb"
        : extraMatch[1] === "Lb" || extraMatch[1] === "B";

      // Track team's total legal balls separately
      if (isLegal) {
        data.totalLegalBalls =
          (data.totalLegalBalls ||
            Math.round(parseFloat(data.overs || 0) * 6)) + 1;
      }

      // (legalBalls already incremented above for legal deliveries)
      if (isLegal && data.legalBalls >= 6) {
        // Over complete — reset bowler's ball count
        data.legalBalls = 0;
        data.bowlOvers += 1;
        data.bowlHistory = "";
        // Auto-rotate strike at end of over
        const was = data.bat1Strike;
        data.bat1Strike = !was;
        data.bat2Strike = was;
      }

      // Calculate total team overs from totalLegalBalls
      if (data.totalLegalBalls !== undefined) {
        const teamCompletedOvers = Math.floor(data.totalLegalBalls / 6);
        const teamBallsThisOver = data.totalLegalBalls % 6;
        data.overs = parseFloat(
          (teamCompletedOvers + teamBallsThisOver / 10).toFixed(1),
        );
      } else {
        data.overs = parseFloat(
          (data.bowlOvers + data.legalBalls / 10).toFixed(1),
        );
      }

      ballLog.push(snapshot);
    }

    // Strip ballLog before saving to server (it's kept in local ref only)
    const { ballLog: _dropped, ...serverData } = data;
    updateOverlay(overlay.id, { content: JSON.stringify(serverData) }).then(
      () => {
        overlay.content = JSON.stringify(serverData);
        setOverlays((prev) => [...prev]);
      },
    );
  };

  // Destination handlers
  const handlePlaySponsoredAd = async (item) => {
    if (!eventData) {
      alert("Event data is not loaded yet.");
      return;
    }

    const ad = item.ad || item;
    if (!ad?.id) return;

    setSponsoredAdLoading(true);

    try {
      const result = await playSponsoredAd(ad.id, eventData.id);

      const placement = result.placement || result;
      const estimatedPayoutPerView =
        result.estimatedPayoutPerView ||
        result.yourPayout ||
        item.yourPayout ||
        ad.creatorPayoutPro ||
        ad.creatorPayoutFree ||
        0;

      const costPerView =
        result.costPerView ||
        item.costPerView ||
        ad.costPerView ||
        ad.baseChargePerPlay ||
        0;

      const overlayId = `sponsored-${placement.id || Date.now()}`;

      const mediaURL = resolveMediaUrl(
        ad.mediaUrl ||
          ad.media_url ||
          ad.videoUrl ||
          ad.video_url ||
          ad.imageUrl ||
          ad.image_url,
      );

      if (!mediaURL) {
        throw new Error("Ad media URL is missing.");
      }

      const type = ad.type === "image" ? "image" : "ad";
      const element =
        ad.type === "image" ? new Image() : document.createElement("video");

      element.crossOrigin = "anonymous";
      element.src = mediaURL;

      if (ad.type !== "image") {
        element.muted = true;
        element.playsInline = true;
        element.autoplay = true;
        element.loop = false;

        element.onended = () => {
          handleCompleteSponsoredAd(overlayId, placement, ad);
        };

        element.play().catch(() => {});
      } else {
        // For image ads, keep it visible until creator manually completes.
        element.onload = () => {};
      }

      mediaElementsRef.current[overlayId] = {
        type: ad.type === "image" ? "image" : "video",
        element,
        url: mediaURL,
      };

      const overlay = {
        id: overlayId,
        type,
        title: ad.title || "Sponsored Ad",
        content: `Sponsored • Est. payout/view NRS ${Number(estimatedPayoutPerView || 0).toFixed(2)}`,
        position: "bottom-right",
        duration: ad.durationSeconds || ad.duration_seconds || 0,
        sponsored: true,
      };

      setOverlays((prev) => [
        ...prev.filter((o) => o.id !== overlayId),
        overlay,
      ]);

      setActiveOverlays((prev) => ({
        ...prev,
        [overlayId]: true,
      }));

      setCurrentSponsoredAd({
        overlayId,
        placement,
        ad,
        estimatedPayoutPerView,
        costPerView,
        startedAt: Date.now(),
      });
    } catch (err) {
      alert("Failed to play sponsored ad: " + (err.message || err));
    } finally {
      setSponsoredAdLoading(false);
    }
  };

  const handleCompleteSponsoredAd = async (overlayId, placementArg, adArg) => {
    const active = currentSponsoredAd || {
      overlayId,
      placement: placementArg,
      ad: adArg,
      startedAt: Date.now(),
    };

    if (!active?.placement?.id) return;

    const watchedSeconds =
      active.ad?.type === "video"
        ? Number(
            active.ad.durationSeconds ||
              active.ad.duration_seconds ||
              Math.max(1, Math.round((Date.now() - active.startedAt) / 1000)),
          )
        : Math.max(1, Math.round((Date.now() - active.startedAt) / 1000));

    try {
      const result = await completeSponsoredAdPlacement(
        active.placement.id,
        watchedSeconds,
      );

      setOverlays((prev) => prev.filter((o) => o.id !== active.overlayId));

      setActiveOverlays((prev) => {
        const next = { ...prev };
        delete next[active.overlayId];
        return next;
      });

      const mediaInfo = mediaElementsRef.current[active.overlayId];
      if (mediaInfo?.element?.pause) mediaInfo.element.pause();

      delete mediaElementsRef.current[active.overlayId];

      setCurrentSponsoredAd(null);

      const market = await getSponsoredAds().catch(() => []);
      setSponsoredAds(Array.isArray(market) ? market : []);

      const placement = result?.placement || {};
      const platformViews =
        placement.platformViews || placement.platform_views || 0;
      const earnedAmount =
        placement.earnedAmount || placement.earned_amount || 0;
      const chargedAmount =
        placement.chargedAmount || placement.charged_amount || 0;

      alert(
        `Sponsored ad completed.\n\nPlatform views: ${platformViews}\nCreator earned: NRS ${Number(earnedAmount).toFixed(2)}\nConsumed spend: NRS ${Number(chargedAmount).toFixed(2)}`,
      );
    } catch (err) {
      alert("Failed to complete sponsored ad: " + (err.message || err));
    }
  };

  const handleAddDestination = async () => {
    if (!eventData || !newDest.stream_key) return;
    try {
      const dest = await addDestination(eventData.id, newDest);
      setDestinations((prev) => [...prev, dest]);
      setNewDest({ platform: "youtube", stream_key: "", server_url: "" });
    } catch (err) {
      console.error("Failed to add destination:", err);
    }
  };

  const toggleDestinationActive = async (dest) => {
    try {
      await updateDestination(dest.id, { is_active: !dest.is_active });
      setDestinations((prev) =>
        prev.map((d) =>
          d.id === dest.id ? { ...d, is_active: !d.is_active } : d,
        ),
      );
    } catch (err) {
      console.error("Failed to toggle destination:", err);
    }
  };

  const handleDeleteDestination = async (id) => {
    try {
      await deleteDestination(id);
      setDestinations((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Failed to delete destination:", err);
    }
  };

  const studioUi = {
    eventCode,
    navigate,
    canvasRef,
    cameraVideosRef,
    peerConnectionsRef,
    viewerPeerConnectionsRef,
    iceCandidateQueuesRef,
    mediaRecorderRef,
    commentaryStreamRef,
    streamWSRef,
    frameRequestRef,
    clientIdRef,
    isLiveRef,
    finalStreamRef,
    mediaElementsRef,
    cricketBallLogsRef,
    audioContextRef,
    mixerDestinationRef,
    audioSourcesRef,
    timerWorkerRef,
    screenShareStreamRef,
    cameraRecordersRef,
    cameraRecordersIntervalsRef,
    recordingDirHandleRef,
    hlsInstancesRef,
    autoSwitchEnabledRef,
    lastSwitchTimeRef,
    analyserNodesRef,
    prevFrameDataRef,
    autoSwitchIntervalRef,
    autoSwitchBusyRef,
    camerasRef,
    activeCameraIdRef,
    autoSwitchModeRef,
    faceDetectorRef,
    faceDetectorLoadingRef,
    aiDirectorStatusRef,
    faceScoresRef,
    faceDetectionTimeRef,
    autoSwitchScoresRef,
    autoSwitchEnabled,
    setAutoSwitchEnabled,
    autoSwitchMode,
    setAutoSwitchMode,
    aiDirectorStatus,
    setAiDirectorStatus,
    aiDirectorScores,
    setAiDirectorScores,
    cameras,
    setCameras,
    activeCameraId,
    setActiveCameraId,
    activeLayout,
    setActiveLayout,
    slotAssignments,
    setSlotAssignments,
    mutedCameras,
    setMutedCameras,
    activeAudioSource,
    setActiveAudioSource,
    commentaryActive,
    setCommentaryActive,
    commentaryMuted,
    setCommentaryMuted,
    isLive,
    setIsLive,
    viewerCount,
    setViewerCount,
    liveStartTime,
    setLiveStartTime,
    overlays,
    setOverlays,
    activeOverlays,
    setActiveOverlays,
    newOverlay,
    setNewOverlay,
    newOverlayMedia,
    setNewOverlayMedia,
    scorecardData,
    setScorecardData,
    destinations,
    setDestinations,
    newDest,
    setNewDest,
    eventData,
    setEventData,
    activePanel,
    setActivePanel,
    elapsed,
    setElapsed,
    downloadEnabled,
    setDownloadEnabled,
    isScreenSharing,
    setIsScreenSharing,
    cameraZoom,
    setCameraZoom,
    newOverlayVideoUrl,
    setNewOverlayVideoUrl,
    sponsoredAds,
    setSponsoredAds,
    currentSponsoredAd,
    setCurrentSponsoredAd,
    sponsoredAdLoading,
    setSponsoredAdLoading,
    isConnected,
    clientID,
    send,
    on,
    off,
    drawVideoFit,
    drawCameraFeed,
    cleanupAutoSwitchForCamera,
    getAudioLevel,
    getMotionScore,
    setupAnalyserForCamera,
    initAiDirectorModel,
    getFacePresenceScore,
    buildDirectorScore,
    runAutoSwitch,
    toggleAutoSwitch,
    getResolvedSlots,
    renderOverlay,
    startWebSocketStreaming,
    requestMicrophone,
    syncMixer,
    startCanvasCapture,
    handleOffer,
    handleCandidate,
    handleViewerReady,
    handleAnswer,
    handleClientJoined,
    handleClientLeft,
    handleCameraZoom,
    goLive,
    endLive,
    startCommentary,
    stopCommentary,
    toggleCommentaryMute,
    changeLayout,
    handleCreateOverlay,
    toggleOverlayActive,
    handleDeleteOverlay,
    startScreenShare,
    stopScreenShare,
    enableLocalRecording,
    startPerCameraRecording,
    disableLocalRecording,
    addDelivery,
    handlePlaySponsoredAd,
    handleCompleteSponsoredAd,
    handleAddDestination,
    toggleDestinationActive,
    handleDeleteDestination,
    STREAM_WIDTH,
    STREAM_HEIGHT
  };

  return <StudioLayout studio={studioUi} />;
}
