import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useWebSocket from "../hooks/useWebSocket";
import Hls from "hls.js";
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

const LAYOUTS = [
  { id: "single", label: "Single", icon: "1" },
  { id: "side-by-side", label: "Side by Side", icon: "2" },
  { id: "pip", label: "Picture in Picture", icon: "PiP" },
  { id: "grid", label: "2×2 Grid", icon: "4" },
  { id: "wide-cu", label: "Wide + Close-up", icon: "W+C" },
];

const OVERLAY_TYPES = [
  { id: "text", label: "Text Overlay" },
  { id: "football-scorecard", label: "Football Scorecard" },
  { id: "cricket-scorecard", label: "Cricket Scorecard" },
  { id: "ad", label: "Advertisement (Video/Image)" },
  { id: "replay", label: "Replay Video" },
  { id: "image", label: "Image" },
  { id: "video-link", label: "External Video / Live Stream" },
];

const OVERLAY_POSITIONS = [
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
  { id: "center", label: "Center" },
  { id: "full", label: "Full Screen" },
];

const PLATFORM_OPTIONS = [
  { id: "youtube", label: "YouTube Live" },
  { id: "facebook", label: "Facebook Live" },
  { id: "twitch", label: "Twitch" },
  { id: "custom", label: "Custom RTMP" },
];

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};

const getSupportedMimeType = () => {
  // Prioritize H.264 for YouTube compatibility
  const types = [
    "video/webm;codecs=h264,opus", // H.264 + Opus
    "video/mp4;codecs=h264,aac", // MP4 with H.264 + AAC
    "video/webm;codecs=vp8,opus", // Fallback to VP8
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`✅ Using MediaRecorder MIME type: ${type}`);
      return type;
    }
  }
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
    if (!video || video.readyState < 2) {
      ctx.fillStyle = "#0D1318";
      ctx.fillRect(x, y, w, h);
      return;
    }

    const vW = video.videoWidth;
    const vH = video.videoHeight;

    // Digital zoom: crop source rectangle centered on the video
    const safeZoom = Math.max(1, Math.min(zoom, 4));
    const srcW = vW / safeZoom;
    const srcH = vH / safeZoom;
    const srcX = (vW - srcW) / 2;
    const srcY = (vH - srcH) / 2;

    const videoRatio = srcW / srcH;
    const boxRatio = w / h;
    let drawW, drawH, drawX, drawY;

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
    // Enhance visual quality before capturing stream
    ctx.filter =
      "contrast(1.1) saturate(1.2) brightness(1.05) hue-rotate(-2deg)";
    ctx.drawImage(video, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);
    ctx.restore();
  }, []);

  // Draw camera feed with premium HUD labels and fallbacks
  const drawCameraFeed = useCallback(
    (ctx, camera, label, x, y, w, h) => {
      if (
        camera &&
        camera.videoElement &&
        camera.videoElement.readyState >= 2
      ) {
        const zoom = cameraZoom[camera.id] || 1;
        drawVideoFit(ctx, camera.videoElement, x, y, w, h, zoom);
        // Removed camera name label overlay per user request
      } else {
        // Premium broadcast placeholder
        ctx.save();
        ctx.fillStyle = "#090D11";
        ctx.fillRect(x, y, w, h);

        // Subtle grid-dashed border outline
        ctx.strokeStyle = "#1E293B";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.strokeRect(x + 12, y + 12, w - 24, h - 24);

        // Label text centered
        ctx.fillStyle = "#475569";
        ctx.font = "bold 15px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label || "Offline Feed", x + w / 2, y + h / 2 - 10);

        ctx.font = "11px 'DM Sans', sans-serif";
        ctx.fillStyle = "#334155";
        ctx.fillText("Waiting for connection...", x + w / 2, y + h / 2 + 12);
        ctx.restore();
      }
    },
    [drawVideoFit, cameraZoom],
  );

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

      // Close old RTMP sockets before starting a new recorder.
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

      console.log(
        `[RTMP WS] Ready. Sending one MediaRecorder stream to ${openSockets.length} destination(s).`,
      );

      const mimeTypes = [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9,opus",
        "video/webm",
      ];

      let selectedMime = "";

      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      console.log(
        `Using MediaRecorder mimeType: ${selectedMime || "browser default"}`,
      );

      const audioTracks = stream.getAudioTracks();

      audioTracks.forEach((track) => {
        track.enabled = true;
      });

      const wsStream = new MediaStream();

      // Use a fresh canvas capture track for RTMP so viewer WebRTC does not freeze.
      if (canvasRef.current) {
        const freshCanvasStream = canvasRef.current.captureStream(30);

        freshCanvasStream.getVideoTracks().forEach((track) => {
          wsStream.addTrack(track);
        });
      } else {
        stream.getVideoTracks().forEach((track) => {
          wsStream.addTrack(track);
        });
      }

      audioTracks.forEach((track) => {
        wsStream.addTrack(track);
      });

      console.log(
        `[RTMP WS] Recorder stream tracks: video=${wsStream.getVideoTracks().length}, audio=${wsStream.getAudioTracks().length}`,
      );

      const recorderOptions = {
        videoBitsPerSecond: 4_500_000,
        audioBitsPerSecond: 160_000,
      };

      if (selectedMime) {
        recorderOptions.mimeType = selectedMime;
      }

      const mediaRecorder = new MediaRecorder(wsStream, recorderOptions);

      mediaRecorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;

        openSockets.forEach(({ id, ws }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          } else {
            console.warn(
              `[RTMP WS] Destination ${id} socket not open, chunk skipped`,
            );
          }
        });

        if (Math.random() < 0.1) {
          console.log(
            `[RTMP WS] Chunk ${event.data.size} bytes sent to ${openSockets.length} destination(s)`,
          );
        }
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

      // 1000ms chunks are easier for FFmpeg to keep live.
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

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
          let targetGain = 0.2; // default background / ducked volume
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
        let targetGain = 0.2; // default background / ducked volume
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
      const offer = msg.data.offer;

      if (peerConnectionsRef.current[cameraID]) {
        console.log(`Already processing camera ${cameraID}`);
        return;
      }

      let video = cameraVideosRef.current[cameraID];
      if (!video) {
        video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.id = `camera-${cameraID}`;
        document.body.appendChild(video);
        cameraVideosRef.current[cameraID] = video;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[cameraID] = pc;
      iceCandidateQueuesRef.current[cameraID] = [];

      // Helper: directly connect an audio track to the Web Audio mixer WITHOUT
      // going through React state. This is synchronous and happens the instant
      // the track arrives — bypassing the setCameras→re-render→syncMixer chain.
      const connectAudioTrackToMixer = (audioTrack) => {
        // Initialize AudioContext on first use
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
            console.log("🔊 Web Audio Mixer initialized (from ontrack)");
          } catch (err) {
            console.error("Failed to init AudioContext:", err);
            return;
          }
        }

        const audioCtx = audioContextRef.current;
        const destNode = mixerDestinationRef.current;
        if (!audioCtx || !destNode) return;

        // Resume context if suspended (browser autoplay policy)
        if (audioCtx.state === "suspended") {
          audioCtx
            .resume()
            .catch((e) => console.warn("AudioContext resume failed:", e));
        }

        // Tear down any existing node for this camera before creating a new one
        const existing = audioSourcesRef.current[cameraID];
        if (existing) {
          try {
            existing.sourceNode.disconnect();
          } catch (e) {}
          try {
            existing.gainNode.disconnect();
          } catch (e) {}
        }

        // Wrap the raw track in its own MediaStream for createMediaStreamSource
        const audioOnlyStream = new MediaStream([audioTrack]);
        try {
          const sourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = 1.0; // full volume; syncMixer can adjust later
          sourceNode.connect(gainNode);
          gainNode.connect(destNode);
          audioSourcesRef.current[cameraID] = {
            sourceNode,
            gainNode,
            stream: audioOnlyStream,
            audioTrackCount: 1,
          };
          console.log(
            `🔊 Camera ${cameraID}: audio track directly wired to mixer`,
          );

          // Auto-select this camera as active audio source if none chosen yet
          setActiveAudioSource((prev) => prev || cameraID);
        } catch (err) {
          console.error(
            `Failed to connect camera ${cameraID} audio to mixer:`,
            err,
          );
        }
      };

      // Helper to register / refresh the camera in React state (for UI / video rendering)
      const registerCamera = (stream) => {
        setCameras((prev) => ({
          ...prev,
          [cameraID]: {
            id: cameraID,
            stream: stream,
            videoElement: video,
            _audioTrackCount: stream.getAudioTracks().length,
            type: msg.data.camera_type || "phone",
            deviceName: msg.data.device_name || "Camera",
          },
        }));
        setActiveCameraId((prev) => prev || cameraID);
      };

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          console.log(
            `Received track (${event.track.kind}) from ${cameraID} – video: ${stream.getVideoTracks().length}, audio: ${stream.getAudioTracks().length}`,
          );

          // ── AUDIO: connect directly to mixer NOW, do not wait for React state ──
          if (event.track.kind === "audio") {
            connectAudioTrackToMixer(event.track);
          }

          // ── VIDEO: attach to hidden <video> element for canvas rendering ──
          if (!video.srcObject) {
            video.srcObject = stream;
            video.play().catch(console.warn);
            video.onloadedmetadata = () => registerCamera(stream);
          } else {
            registerCamera(stream);
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send("candidate", { candidate: event.candidate }, cameraID);
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Process queued candidates
        const queued = iceCandidateQueuesRef.current[cameraID] || [];
        for (const candidate of queued) {
          pc.addIceCandidate(candidate).catch(console.error);
        }
        iceCandidateQueuesRef.current[cameraID] = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send("answer", { answer }, cameraID);
      } catch (err) {
        console.error("Error handling offer:", err);
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

  const handleClientJoined = useCallback((msg) => {
    if (msg.data?.role === "viewer") {
      setViewerCount((prev) => prev + 1);
    }
  }, []);

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
  // running even when this tab is in the background (rAF is throttled
  // by the browser to ~1 FPS when hidden, causing stream lag).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Snapshot the latest state values in a ref so the worker tick
    // callback always has access to the current values without needing
    // to be recreated on every state change.
    const stateRef = {
      cameras,
      activeCameraId,
      activeLayout,
      overlays,
      activeOverlays,
      isLive,
      getResolvedSlots,
      drawCameraFeed,
      renderOverlay,
    };

    const render = () => {
      const s = stateRef;
      // Clear canvas
      ctx.fillStyle = "#080C0F";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cameraList = Object.values(s.cameras);
      const {
        slot1: cam1,
        slot2: cam2,
        slot3: cam3,
        slot4: cam4,
      } = s.getResolvedSlots();

      if (cameraList.length > 0) {
        if (s.activeLayout === "single") {
          if (cam1) {
            s.drawCameraFeed(
              ctx,
              cam1,
              `${cam1.id.split("_")[0]} (Main)`,
              0,
              0,
              canvas.width,
              canvas.height,
            );
          }
        } else if (s.activeLayout === "side-by-side") {
          const halfW = canvas.width / 2;
          s.drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Left)` : "Camera 1 (Offline)",
            0,
            0,
            halfW,
            canvas.height,
          );
          s.drawCameraFeed(
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
        } else if (s.activeLayout === "pip") {
          s.drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Main)` : "Camera 1 (Offline)",
            0,
            0,
            canvas.width,
            canvas.height,
          );
          if (cam2) {
            const pipW = canvas.width / 4,
              pipH = canvas.height / 4;
            const pipX = canvas.width - pipW - 20,
              pipY = canvas.height - pipH - 20;
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.5)";
            ctx.shadowBlur = 15;
            ctx.fillStyle = "#090D11";
            ctx.fillRect(pipX - 2, pipY - 2, pipW + 4, pipH + 4);
            ctx.restore();
            s.drawCameraFeed(
              ctx,
              cam2,
              `${cam2.id.split("_")[0]} (PiP)`,
              pipX,
              pipY,
              pipW,
              pipH,
            );
          }
        } else if (s.activeLayout === "grid") {
          const w = canvas.width / 2,
            h = canvas.height / 2;
          s.drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Cam 1)` : "Camera 1 (Offline)",
            0,
            0,
            w,
            h,
          );
          s.drawCameraFeed(
            ctx,
            cam2,
            cam2 ? `${cam2.id.split("_")[0]} (Cam 2)` : "Camera 2 (Offline)",
            w,
            0,
            w,
            h,
          );
          s.drawCameraFeed(
            ctx,
            cam3,
            cam3 ? `${cam3.id.split("_")[0]} (Cam 3)` : "Camera 3 (Offline)",
            0,
            h,
            w,
            h,
          );
          s.drawCameraFeed(
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
        } else if (s.activeLayout === "wide-cu") {
          const mainW = canvas.width * 0.75,
            sideW = canvas.width * 0.25,
            sideH = canvas.height / 2;
          s.drawCameraFeed(
            ctx,
            cam1,
            cam1 ? `${cam1.id.split("_")[0]} (Wide)` : "Camera 1 (Offline)",
            0,
            0,
            mainW,
            canvas.height,
          );
          s.drawCameraFeed(
            ctx,
            cam2,
            cam2 ? `${cam2.id.split("_")[0]} (CU 1)` : "Camera 2 (Offline)",
            mainW,
            0,
            sideW,
            sideH,
          );
          s.drawCameraFeed(
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

      // Draw overlays
      s.overlays.forEach((overlay) => {
        if (s.activeOverlays[overlay.id]) s.renderOverlay(ctx, overlay);
      });

      // Draw LIVE indicator
      if (s.isLive) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.fillRect(16, 16, 70, 28);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px 'DM Sans', sans-serif";
        ctx.fillText("● LIVE", 51, 35);
      }
    };

    // Start Web Worker timer
    const worker = new Worker(
      new URL("../workers/timerWorker.js", import.meta.url),
      { type: "module" },
    );
    timerWorkerRef.current = worker;
    worker.onmessage = () => render();
    worker.postMessage("start");

    // Also update the stateRef when state changes (so the worker tick uses fresh values)
    stateRef.cameras = cameras;
    stateRef.activeCameraId = activeCameraId;
    stateRef.activeLayout = activeLayout;
    stateRef.overlays = overlays;
    stateRef.activeOverlays = activeOverlays;
    stateRef.isLive = isLive;
    stateRef.getResolvedSlots = getResolvedSlots;
    stateRef.drawCameraFeed = drawCameraFeed;
    stateRef.renderOverlay = renderOverlay;

    return () => {
      worker.postMessage("stop");
      worker.terminate();
      timerWorkerRef.current = null;
    };
  }, [
    cameras,
    activeCameraId,
    activeLayout,
    overlays,
    activeOverlays,
    isLive,
    drawVideoFit,
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

  return (
    <>
      <style>{`
          .vc-studio-shell {
            --vc-bg: #050505;
            --vc-panel: rgba(15, 15, 18, 0.94);
            --vc-panel-2: rgba(22, 22, 26, 0.9);
            --vc-card: rgba(255, 255, 255, 0.055);
            --vc-card-strong: rgba(255, 255, 255, 0.09);
            --vc-border: rgba(255, 255, 255, 0.11);
            --vc-border-strong: rgba(255, 255, 255, 0.18);
            --vc-muted: #a1a1aa;
            --vc-soft: #e4e4e7;
            --vc-primary: #ff4f1f;
            --vc-primary-2: #ff7a45;
            --vc-success: #22c55e;
            --vc-danger: #ef4444;
            background:
              radial-gradient(circle at top left, rgba(255, 79, 31, 0.15), transparent 34%),
              radial-gradient(circle at 72% 8%, rgba(59, 130, 246, 0.12), transparent 32%),
              linear-gradient(135deg, #050505 0%, #09090b 54%, #050505 100%);
            color: #fff;
            font-family: "Poppins", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          .vc-topbar {
            min-height: 78px;
            background: rgba(6, 6, 8, 0.88);
            border-bottom: 1px solid var(--vc-border);
            backdrop-filter: blur(18px);
            box-shadow: 0 18px 55px rgba(0, 0, 0, 0.34);
          }

          .vc-brand-mark {
            width: 42px;
            height: 42px;
            border-radius: 16px;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, var(--vc-primary), #7c2d12);
            box-shadow: 0 16px 32px rgba(255, 79, 31, 0.28);
          }

          .vc-icon-btn,
          .vc-action-btn,
          .vc-live-btn,
          .vc-danger-btn,
          .vc-copy-btn {
            border: 1px solid var(--vc-border);
            border-radius: 14px;
            transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
          }

          .vc-icon-btn:hover,
          .vc-action-btn:hover,
          .vc-live-btn:hover,
          .vc-danger-btn:hover,
          .vc-copy-btn:hover {
            transform: translateY(-1px);
          }

          .vc-icon-btn {
            width: 40px;
            height: 40px;
            display: grid;
            place-items: center;
            background: rgba(255, 255, 255, 0.055);
            color: #d4d4d8;
          }

          .vc-icon-btn:hover {
            background: rgba(255, 255, 255, 0.09);
            color: #fff;
            border-color: var(--vc-border-strong);
          }

          .vc-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 40px;
            padding: 0 14px;
            background: rgba(255, 255, 255, 0.06);
            color: #e4e4e7;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
          }

          .vc-action-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: var(--vc-border-strong);
          }

          .vc-action-btn.is-active {
            background: rgba(34, 197, 94, 0.18);
            border-color: rgba(34, 197, 94, 0.36);
            color: #bbf7d0;
          }

          .vc-action-btn.is-recording {
            background: rgba(239, 68, 68, 0.18);
            border-color: rgba(239, 68, 68, 0.42);
            color: #fecaca;
            box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.06);
          }

          .vc-live-btn,
          .vc-danger-btn {
            min-height: 44px;
            padding: 0 20px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 9px;
            color: #fff;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.02em;
            white-space: nowrap;
          }

          .vc-live-btn {
            background: linear-gradient(135deg, var(--vc-primary), #dc2626);
            border-color: rgba(255, 255, 255, 0.12);
            box-shadow: 0 16px 38px rgba(255, 79, 31, 0.28);
          }

          .vc-live-btn:disabled {
            cursor: not-allowed;
            opacity: 0.48;
            background: rgba(113, 113, 122, 0.34);
            box-shadow: none;
          }

          .vc-danger-btn {
            background: rgba(239, 68, 68, 0.2);
            border-color: rgba(239, 68, 68, 0.42);
            color: #fecaca;
          }

          .vc-pill {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            min-height: 32px;
            padding: 0 11px;
            border-radius: 999px;
            border: 1px solid var(--vc-border);
            background: rgba(255, 255, 255, 0.055);
            color: #d4d4d8;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
          }

          .vc-pill strong {
            color: #fff;
            font-weight: 800;
          }

          .vc-live-pill {
            border-color: rgba(239, 68, 68, 0.42);
            background: rgba(239, 68, 68, 0.13);
            color: #fecaca;
          }

          .vc-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            display: inline-block;
            background: #f59e0b;
            box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.08);
          }

          .vc-dot.ok {
            background: var(--vc-success);
            box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.1);
          }

          .vc-dot.live {
            background: var(--vc-danger);
            box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.1);
            animation: vcPulse 1.4s infinite;
          }

          @keyframes vcPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.55; transform: scale(0.82); }
          }

          .vc-workspace {
            min-height: calc(100vh - 78px);
          }

          .vc-stage-wrap {
            background:
              linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
              radial-gradient(circle at center, rgba(255, 255, 255, 0.065), transparent 36%),
              #050505;
            background-size: 44px 44px, 44px 44px, auto, auto;
          }

          .vc-stage-card {
            width: min(100%, 1280px);
            background: rgba(10, 10, 12, 0.78);
            border: 1px solid var(--vc-border);
            border-radius: 26px;
            padding: 16px;
            box-shadow: 0 28px 90px rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(16px);
          }

          .vc-stage-header,
          .vc-stage-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 4px 14px;
          }

          .vc-stage-footer {
            padding: 14px 4px 0;
            color: var(--vc-muted);
            font-size: 12px;
          }

          .vc-canvas-frame {
            position: relative;
            border-radius: 22px;
            overflow: hidden;
            background: #000;
            border: 1px solid rgba(255, 255, 255, 0.14);
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04), 0 24px 70px rgba(0, 0, 0, 0.6);
          }

          .vc-canvas-frame::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            border-radius: 22px;
            background: linear-gradient(180deg, rgba(255,255,255,0.06), transparent 18%, transparent 82%, rgba(0,0,0,0.28));
            z-index: 1;
          }

          .vc-canvas-frame canvas {
            display: block;
            width: 100%;
            height: auto;
            max-height: calc(100vh - 230px);
            object-fit: contain;
          }

          .vc-side-panel {
            width: 400px;
            background: rgba(10, 10, 12, 0.9);
            border-left: 1px solid var(--vc-border);
            backdrop-filter: blur(18px);
            box-shadow: -24px 0 70px rgba(0, 0, 0, 0.28);
          }

          .vc-panel-head {
            padding: 18px;
            border-bottom: 1px solid var(--vc-border);
          }

          .vc-panel-tabs {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 7px;
            padding: 12px;
            border-bottom: 1px solid var(--vc-border);
            background: rgba(255, 255, 255, 0.025);
          }

          .vc-panel-tab {
            min-height: 58px;
            border-radius: 15px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 5px;
            color: #a1a1aa;
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid transparent;
            font-size: 11px;
            font-weight: 800;
            transition: 0.18s ease;
          }

          .vc-panel-tab i {
            font-size: 14px;
          }

          .vc-panel-tab:hover {
            color: #fff;
            background: rgba(255, 255, 255, 0.07);
            border-color: var(--vc-border);
          }

          .vc-panel-tab.active {
            color: #fff;
            background: linear-gradient(135deg, rgba(255, 79, 31, 0.25), rgba(255, 122, 69, 0.08));
            border-color: rgba(255, 79, 31, 0.4);
            box-shadow: 0 12px 30px rgba(255, 79, 31, 0.13);
          }

          .vc-panel-body {
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 79, 31, 0.55) rgba(255, 255, 255, 0.04);
          }

          .vc-panel-body::-webkit-scrollbar {
            width: 8px;
          }

          .vc-panel-body::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.04);
          }

          .vc-panel-body::-webkit-scrollbar-thumb {
            background: rgba(255, 79, 31, 0.55);
            border-radius: 999px;
          }

          .vc-studio-shell .bg-gray-800,
          .vc-studio-shell .bg-gray-900 {
            background-color: rgba(255, 255, 255, 0.055) !important;
            border: 1px solid rgba(255, 255, 255, 0.09);
          }

          .vc-studio-shell .bg-gray-700 {
            background-color: rgba(255, 255, 255, 0.09) !important;
          }

          .vc-studio-shell .rounded-lg {
            border-radius: 16px !important;
          }

          .vc-studio-shell input,
          .vc-studio-shell select,
          .vc-studio-shell textarea {
            background: rgba(5, 5, 5, 0.45) !important;
            border: 1px solid rgba(255, 255, 255, 0.13) !important;
            border-radius: 13px !important;
            color: #fff !important;
            outline: none !important;
          }

          .vc-studio-shell input:focus,
          .vc-studio-shell select:focus,
          .vc-studio-shell textarea:focus {
            border-color: rgba(255, 79, 31, 0.65) !important;
            box-shadow: 0 0 0 4px rgba(255, 79, 31, 0.12) !important;
          }

          .vc-studio-shell button {
            cursor: pointer;
          }

          .vc-studio-shell button:disabled {
            cursor: not-allowed;
          }

          .vc-platform-icon {
            width: 34px;
            height: 34px;
            display: grid;
            place-items: center;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.07);
            color: #fff;
          }

          .vc-share-card {
            padding: 16px;
            border-top: 1px solid var(--vc-border);
            background: rgba(255, 255, 255, 0.025);
          }

          .vc-share-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
            align-items: center;
          }

          .vc-copy-btn {
            width: 40px;
            height: 40px;
            display: grid;
            place-items: center;
            background: rgba(255, 255, 255, 0.065);
            color: #e4e4e7;
          }

          .vc-copy-btn:hover {
            color: #fff;
            background: rgba(255, 79, 31, 0.18);
            border-color: rgba(255, 79, 31, 0.36);
          }

          @media (max-width: 1180px) {
            .vc-workspace { flex-direction: column; }
            .vc-side-panel { width: 100%; border-left: 0; border-top: 1px solid var(--vc-border); max-height: none; }
            .vc-canvas-frame canvas { max-height: none; }
            .vc-topbar { position: static; }
          }

          @media (max-width: 820px) {
            .vc-topbar-content { flex-direction: column; align-items: stretch; }
            .vc-topbar-actions { flex-wrap: wrap; justify-content: flex-start; }
            .vc-stage-header, .vc-stage-footer { flex-direction: column; align-items: flex-start; }
            .vc-panel-tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .vc-stage-card { border-radius: 18px; padding: 10px; }
            .vc-canvas-frame { border-radius: 16px; }
          }
        `}</style>
      <div className="vc-studio-shell min-h-screen text-white flex flex-col">
        <header className="vc-topbar px-5 py-4 flex items-center">
          <div className="vc-topbar-content w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => navigate("/creator/events")}
                className="vc-icon-btn shrink-0"
                title="Back to events"
              >
                <i className="fa-solid fa-arrow-left" />
              </button>

              <div className="vc-brand-mark shrink-0">
                <i className="fa-solid fa-clapperboard text-white" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-extrabold tracking-tight leading-none">
                    Vision Cast Studio
                  </h1>
                  {isLive && (
                    <span className="vc-pill vc-live-pill">
                      <span className="vc-dot live" /> Live {elapsed}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="vc-pill">
                    <i className="fa-solid fa-key" /> Session{" "}
                    <strong>{eventCode}</strong>
                  </span>
                  <span className="vc-pill">
                    <i className="fa-solid fa-layer-group" />{" "}
                    {LAYOUTS.find((layout) => layout.id === activeLayout)
                      ?.label || "Single"}
                  </span>
                  <span className="vc-pill">
                    <span className={`vc-dot ${isConnected ? "ok" : ""}`} />{" "}
                    {isConnected ? "Connected" : "Connecting"}
                  </span>
                </div>
              </div>
            </div>

            <div className="vc-topbar-actions flex items-center gap-2">
              <button
                onClick={
                  downloadEnabled ? disableLocalRecording : enableLocalRecording
                }
                title={
                  downloadEnabled
                    ? "Stop local recording"
                    : "Enable local 10s clip recording"
                }
                className={`vc-action-btn ${downloadEnabled ? "is-recording" : ""}`}
              >
                <i
                  className={`fa-solid ${downloadEnabled ? "fa-circle-stop" : "fa-record-vinyl"}`}
                />
                <span>
                  {downloadEnabled ? "Recording Clips" : "Record Clips"}
                </span>
              </button>

              <button
                onClick={
                  isScreenSharing
                    ? () => stopScreenShare(null)
                    : startScreenShare
                }
                title={
                  isScreenSharing ? "Stop screen share" : "Share your screen"
                }
                className={`vc-action-btn ${isScreenSharing ? "is-active" : ""}`}
              >
                <i className="fa-solid fa-display" />
                <span>{isScreenSharing ? "Stop Share" : "Share Screen"}</span>
              </button>

              <span className="vc-pill">
                <i className="fa-solid fa-eye" /> {viewerCount} viewers
              </span>
              <span className="vc-pill">
                <i className="fa-solid fa-video" />{" "}
                {Object.keys(cameras).length} cameras
              </span>

              {isLive ? (
                <button onClick={endLive} className="vc-danger-btn">
                  <i className="fa-solid fa-power-off" /> End Live
                </button>
              ) : (
                <button
                  onClick={goLive}
                  disabled={Object.keys(cameras).length === 0}
                  className="vc-live-btn"
                >
                  <i className="fa-solid fa-signal" /> Go Live
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="vc-workspace flex flex-1 overflow-hidden">
          <main className="vc-stage-wrap flex-1 flex items-center justify-center p-5 overflow-auto">
            <section className="vc-stage-card">
              <div className="vc-stage-header">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-500 font-bold">
                    Program Output
                  </p>
                  <h2 className="text-base font-bold mt-1">
                    Live Preview Canvas
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="vc-pill">
                    <i className="fa-solid fa-camera-retro" /> Active{" "}
                    {activeCameraId
                      ? cameras[activeCameraId]?.deviceName ||
                        activeCameraId.split("_")[0]
                      : "Auto"}
                  </span>
                  <span className="vc-pill">
                    <i className="fa-solid fa-wand-magic-sparkles" />{" "}
                    {
                      Object.keys(activeOverlays).filter(
                        (key) => activeOverlays[key],
                      ).length
                    }{" "}
                    overlays
                  </span>
                </div>
              </div>

              <div className="vc-canvas-frame">
                <canvas
                  ref={canvasRef}
                  width={1920}
                  height={1080}
                  style={{ aspectRatio: "16/9" }}
                />
              </div>

              <div className="vc-stage-footer">
                <span>
                  <i className="fa-solid fa-circle-info mr-2" /> Use the right
                  panel to switch cameras, control overlays, mix audio, and
                  start RTMP destinations.
                </span>
                <span className="font-mono text-zinc-500">
                  1920×1080 / 16:9
                </span>
              </div>
            </section>
          </main>

          <aside className="vc-side-panel flex flex-col">
            <div className="vc-panel-head">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500 font-bold">
                Production Controls
              </p>
              <h2 className="text-base font-bold mt-1">Control Room</h2>
            </div>

            <div className="vc-panel-tabs">
              {[
                { id: "cameras", label: "Cameras", icon: "fa-solid fa-video" },
                {
                  id: "overlays",
                  label: "Overlays",
                  icon: "fa-solid fa-layer-group",
                },
                { id: "audio", label: "Audio", icon: "fa-solid fa-sliders" },
                {
                  id: "destinations",
                  label: "Stream",
                  icon: "fa-solid fa-broadcast-tower",
                },
                {
                  id: "sponsored",
                  label: "Ads",
                  icon: "fa-solid fa-rectangle-ad",
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActivePanel(tab.id)}
                  className={`vc-panel-tab ${activePanel === tab.id ? "active" : ""}`}
                >
                  <i className={tab.icon} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="vc-panel-body flex-1 overflow-y-auto p-4">
              {/* Cameras Panel */}
              {activePanel === "cameras" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-gray-400 uppercase">
                    Connected Cameras ({Object.keys(cameras).length})
                  </h3>
                  {Object.values(cameras).map((cam) => (
                    <div
                      key={cam.id}
                      className={`bg-gray-800 rounded-lg p-3 transition border-2 ${activeCameraId === cam.id ? "border-red-500" : "border-transparent hover:border-gray-600"}`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer mb-2"
                        onClick={() => setActiveCameraId(cam.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-sm font-medium">
                            {cam.deviceName || cam.id.split("_")[0]}
                          </span>
                        </div>
                        {activeCameraId === cam.id && (
                          <span className="text-xs bg-red-600 px-2 py-0.5 rounded font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      {/* Zoom Slider */}
                      {cam.type !== "screen" && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-gray-400">Zoom</span>
                          <input
                            type="range"
                            min="1"
                            max="4"
                            step="0.1"
                            value={cameraZoom[cam.id] || 1}
                            onChange={(e) =>
                              setCameraZoom((p) => ({
                                ...p,
                                [cam.id]: parseFloat(e.target.value),
                              }))
                            }
                            className="flex-1 accent-red-500"
                          />
                          <span className="text-xs text-gray-400 w-6">
                            {(cameraZoom[cam.id] || 1).toFixed(1)}x
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  <h3 className="font-bold text-sm text-gray-400 uppercase mt-6">
                    Layout
                  </h3>
                  <div className="grid grid-cols-5 gap-2">
                    {LAYOUTS.map((layout) => (
                      <button
                        key={layout.id}
                        onClick={() => changeLayout(layout.id)}
                        title={layout.label}
                        className={`p-2 rounded text-xs font-bold transition ${activeLayout === layout.id ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                      >
                        {layout.icon}
                      </button>
                    ))}
                  </div>

                  {activeLayout !== "single" && (
                    <div className="mt-6 space-y-3 border-t border-gray-800 pt-4">
                      <h3 className="font-bold text-xs text-gray-400 uppercase tracking-wider">
                        Grid Slot Assignment
                      </h3>
                      <div className="space-y-2">
                        {/* Slot 1 Assignment */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-gray-400 font-medium whitespace-nowrap">
                            Slot 1 (Main/Left):
                          </span>
                          <select
                            value={slotAssignments.slot1 || ""}
                            onChange={(e) =>
                              setSlotAssignments((prev) => ({
                                ...prev,
                                slot1: e.target.value,
                              }))
                            }
                            className="bg-gray-800 text-white rounded px-2 py-1 border border-gray-700 w-36 outline-none focus:border-red-500"
                          >
                            <option value="">Auto Select</option>
                            {Object.values(cameras).map((cam) => (
                              <option key={cam.id} value={cam.id}>
                                {cam.deviceName || cam.id.split("_")[0]}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Slot 2 Assignment */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-gray-400 font-medium whitespace-nowrap">
                            {activeLayout === "side-by-side" &&
                              "Slot 2 (Right):"}
                            {activeLayout === "pip" && "Slot 2 (PiP Float):"}
                            {activeLayout === "grid" && "Slot 2 (Top Right):"}
                            {activeLayout === "wide-cu" &&
                              "Slot 2 (Top Thumbnail):"}
                          </span>
                          <select
                            value={slotAssignments.slot2 || ""}
                            onChange={(e) =>
                              setSlotAssignments((prev) => ({
                                ...prev,
                                slot2: e.target.value,
                              }))
                            }
                            className="bg-gray-800 text-white rounded px-2 py-1 border border-gray-700 w-36 outline-none focus:border-red-500"
                          >
                            <option value="">Auto Select</option>
                            {Object.values(cameras).map((cam) => (
                              <option key={cam.id} value={cam.id}>
                                {cam.deviceName || cam.id.split("_")[0]}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Slot 3 Assignment */}
                        {(activeLayout === "grid" ||
                          activeLayout === "wide-cu") && (
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-gray-400 font-medium whitespace-nowrap">
                              {activeLayout === "grid" &&
                                "Slot 3 (Bottom Left):"}
                              {activeLayout === "wide-cu" &&
                                "Slot 3 (Bottom Thumbnail):"}
                            </span>
                            <select
                              value={slotAssignments.slot3 || ""}
                              onChange={(e) =>
                                setSlotAssignments((prev) => ({
                                  ...prev,
                                  slot3: e.target.value,
                                }))
                              }
                              className="bg-gray-800 text-white rounded px-2 py-1 border border-gray-700 w-36 outline-none focus:border-red-500"
                            >
                              <option value="">Auto Select</option>
                              {Object.values(cameras).map((cam) => (
                                <option key={cam.id} value={cam.id}>
                                  {cam.deviceName || cam.id.split("_")[0]}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Slot 4 Assignment */}
                        {activeLayout === "grid" && (
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-gray-400 font-medium whitespace-nowrap">
                              Slot 4 (Bottom Right):
                            </span>
                            <select
                              value={slotAssignments.slot4 || ""}
                              onChange={(e) =>
                                setSlotAssignments((prev) => ({
                                  ...prev,
                                  slot4: e.target.value,
                                }))
                              }
                              className="bg-gray-800 text-white rounded px-2 py-1 border border-gray-700 w-36 outline-none focus:border-red-500"
                            >
                              <option value="">Auto Select</option>
                              {Object.values(cameras).map((cam) => (
                                <option key={cam.id} value={cam.id}>
                                  {cam.deviceName || cam.id.split("_")[0]}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Overlays Panel - Simplified */}
              {activePanel === "overlays" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-gray-400 uppercase">
                    Create Overlay
                  </h3>
                  <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                    <select
                      value={newOverlay.type}
                      onChange={(e) =>
                        setNewOverlay({ ...newOverlay, type: e.target.value })
                      }
                      className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                    >
                      {OVERLAY_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Title"
                      value={newOverlay.title}
                      onChange={(e) =>
                        setNewOverlay({ ...newOverlay, title: e.target.value })
                      }
                      className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                    />
                    {newOverlay.type === "text" && (
                      <textarea
                        placeholder="Content"
                        value={newOverlay.content}
                        onChange={(e) =>
                          setNewOverlay({
                            ...newOverlay,
                            content: e.target.value,
                          })
                        }
                        className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm h-20"
                      />
                    )}
                    {newOverlay.type === "football-scorecard" && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Team A Name"
                          onChange={(e) =>
                            setScorecardData((p) => ({
                              ...p,
                              teamA: e.target.value,
                              scoreA: 0,
                            }))
                          }
                          className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Team B Name"
                          onChange={(e) =>
                            setScorecardData((p) => ({
                              ...p,
                              teamB: e.target.value,
                              scoreB: 0,
                            }))
                          }
                          className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                    {newOverlay.type === "cricket-scorecard" && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Batting Team"
                          onChange={(e) =>
                            setScorecardData((p) => ({
                              ...p,
                              battingTeam: e.target.value,
                              runs: 0,
                              wickets: 0,
                              overs: 0,
                              bat1Name: "Player 1",
                              bat1Runs: 0,
                              bat1Strike: true,
                              bat2Name: "Player 2",
                              bat2Runs: 0,
                              bat2Strike: false,
                              bowlName: "Bowler 1",
                              bowlOvers: 0,
                              bowlRuns: 0,
                              bowlWickets: 0,
                              bowlHistory: "",
                            }))
                          }
                          className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Bowling Team"
                          onChange={(e) =>
                            setScorecardData((p) => ({
                              ...p,
                              bowlingTeam: e.target.value,
                            }))
                          }
                          className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                    {(newOverlay.type === "ad" ||
                      newOverlay.type === "replay" ||
                      newOverlay.type === "image") && (
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setNewOverlayMedia(e.target.files[0]);
                          }
                        }}
                        className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-gray-800 file:text-white hover:file:bg-gray-600"
                      />
                    )}
                    {newOverlay.type === "video-link" && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Live stream URL (e.g., .m3u8 or .mp4)"
                          value={newOverlayVideoUrl}
                          onChange={(e) =>
                            setNewOverlayVideoUrl(e.target.value)
                          }
                          className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                        />
                        {(newOverlayVideoUrl.includes("youtube.com") ||
                          newOverlayVideoUrl.includes("youtu.be")) && (
                          <div className="text-xs bg-amber-500/10 text-amber-300 p-3 rounded border border-amber-500/30 leading-relaxed">
                            <i className="fa-solid fa-triangle-exclamation mr-1" />{" "}
                            <b>YouTube Security Restriction</b>
                            <br />
                            Browsers forbid broadcasting YouTube streams
                            directly inside a studio canvas due to security
                            rules.
                            <br />
                            <br />
                            <span className="text-white font-medium">
                              Workaround:
                            </span>{" "}
                            Open the YouTube video in a new browser tab, and use
                            the <b>Share Screen</b> button at the top of the
                            studio to bring it into your broadcast!
                          </div>
                        )}
                      </div>
                    )}
                    <select
                      value={newOverlay.position}
                      onChange={(e) =>
                        setNewOverlay({
                          ...newOverlay,
                          position: e.target.value,
                        })
                      }
                      className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                    >
                      {OVERLAY_POSITIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleCreateOverlay}
                      className="w-full bg-red-600 hover:bg-red-700 rounded py-2 text-sm font-bold"
                    >
                      + Add Overlay
                    </button>
                  </div>
                  <h3 className="font-bold text-sm text-gray-400 uppercase mt-4">
                    Active Overlays
                  </h3>
                  {overlays.map((overlay) => (
                    <div
                      key={overlay.id}
                      className="bg-gray-800 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          {overlay.title}
                        </span>
                        <span className="ml-2 text-xs bg-gray-700 px-2 py-0.5 rounded">
                          {overlay.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleOverlayActive(overlay)}
                          className={`px-3 py-1 rounded text-xs font-bold ${activeOverlays[overlay.id] ? "bg-green-600" : "bg-gray-700"}`}
                        >
                          {activeOverlays[overlay.id] ? "ON" : "OFF"}
                        </button>
                        <button
                          onClick={() => handleDeleteOverlay(overlay.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Active Overlay Controls (Scorecards) */}
              {activePanel === "overlays" &&
                overlays.filter(
                  (o) =>
                    activeOverlays[o.id] &&
                    (o.type === "football-scorecard" ||
                      o.type === "cricket-scorecard"),
                ).length > 0 && (
                  <div className="px-4 pb-4 space-y-4">
                    <h3 className="font-bold text-sm text-gray-400 uppercase mt-4 border-t border-gray-800 pt-4">
                      Scorecard Controls
                    </h3>
                    {overlays
                      .filter(
                        (o) =>
                          activeOverlays[o.id] &&
                          (o.type === "football-scorecard" ||
                            o.type === "cricket-scorecard"),
                      )
                      .map((overlay) => {
                        const data = overlay.content
                          ? JSON.parse(overlay.content)
                          : {};
                        return (
                          <div
                            key={`controls-${overlay.id}`}
                            className="bg-gray-800 rounded-lg p-3 space-y-3"
                          >
                            <div className="text-sm font-bold text-white mb-2">
                              {overlay.title}
                            </div>
                            {overlay.type === "football-scorecard" && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <div className="text-xs text-gray-400">
                                    {data.teamA || "Team A"} Score
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        data.scoreA = (data.scoreA || 0) + 1;
                                        updateOverlay(overlay.id, {
                                          content: JSON.stringify(data),
                                        }).then(() => {
                                          overlay.content =
                                            JSON.stringify(data);
                                          setOverlays([...overlays]);
                                        });
                                      }}
                                      className="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-sm"
                                    >
                                      +
                                    </button>
                                    <button
                                      onClick={() => {
                                        data.scoreA = Math.max(
                                          0,
                                          (data.scoreA || 0) - 1,
                                        );
                                        updateOverlay(overlay.id, {
                                          content: JSON.stringify(data),
                                        }).then(() => {
                                          overlay.content =
                                            JSON.stringify(data);
                                          setOverlays([...overlays]);
                                        });
                                      }}
                                      className="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-sm"
                                    >
                                      -
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="text-xs text-gray-400">
                                    {data.teamB || "Team B"} Score
                                  </div>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        data.scoreB = (data.scoreB || 0) + 1;
                                        updateOverlay(overlay.id, {
                                          content: JSON.stringify(data),
                                        }).then(() => {
                                          overlay.content =
                                            JSON.stringify(data);
                                          setOverlays([...overlays]);
                                        });
                                      }}
                                      className="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-sm"
                                    >
                                      +
                                    </button>
                                    <button
                                      onClick={() => {
                                        data.scoreB = Math.max(
                                          0,
                                          (data.scoreB || 0) - 1,
                                        );
                                        updateOverlay(overlay.id, {
                                          content: JSON.stringify(data),
                                        }).then(() => {
                                          overlay.content =
                                            JSON.stringify(data);
                                          setOverlays([...overlays]);
                                        });
                                      }}
                                      className="flex-1 bg-gray-700 hover:bg-gray-600 rounded py-1 text-sm"
                                    >
                                      -
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {overlay.type === "cricket-scorecard" &&
                              (() => {
                                const d = overlay.content
                                  ? JSON.parse(overlay.content)
                                  : {};
                                const bat1Strike = d.bat1Strike !== false;
                                const deliveryBtn = (
                                  label,
                                  delivery,
                                  color = "bg-gray-700 hover:bg-gray-600",
                                ) => (
                                  <button
                                    key={label}
                                    onClick={() =>
                                      addDelivery(overlay, delivery)
                                    }
                                    className={`${color} text-white font-bold rounded py-2 text-sm transition-all active:scale-95`}
                                  >
                                    {label}
                                  </button>
                                );
                                const updateField = (field, value) => {
                                  d[field] = value;
                                  updateOverlay(overlay.id, {
                                    content: JSON.stringify(d),
                                  }).then(() => {
                                    overlay.content = JSON.stringify(d);
                                    setOverlays((prev) => [...prev]);
                                  });
                                };
                                return (
                                  <div className="space-y-3">
                                    {/* Batsmen Names */}
                                    <div className="space-y-1">
                                      <div className="text-xs text-gray-400 uppercase font-semibold">
                                        Batsmen
                                      </div>
                                      <div className="flex gap-2 items-center">
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${bat1Strike ? "bg-green-400" : "bg-gray-600"}`}
                                        />
                                        <input
                                          type="text"
                                          value={d.bat1Name || ""}
                                          onChange={(e) =>
                                            updateField(
                                              "bat1Name",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Batsman 1"
                                          className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm"
                                        />
                                        <span className="text-amber-400 font-bold text-sm w-8 text-center">
                                          {d.bat1Runs || 0}
                                        </span>
                                        <button
                                          onClick={() => {
                                            d.bat1Strike = true;
                                            d.bat2Strike = false;
                                            updateField("bat1Strike", true);
                                          }}
                                          className={`text-xs px-2 py-1 rounded ${bat1Strike ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"}`}
                                        >
                                          *
                                        </button>
                                      </div>
                                      <div className="flex gap-2 items-center">
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${!bat1Strike ? "bg-green-400" : "bg-gray-600"}`}
                                        />
                                        <input
                                          type="text"
                                          value={d.bat2Name || ""}
                                          onChange={(e) =>
                                            updateField(
                                              "bat2Name",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Batsman 2"
                                          className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm"
                                        />
                                        <span className="text-amber-400 font-bold text-sm w-8 text-center">
                                          {d.bat2Runs || 0}
                                        </span>
                                        <button
                                          onClick={() => {
                                            d.bat2Strike = true;
                                            d.bat1Strike = false;
                                            updateField("bat2Strike", true);
                                          }}
                                          className={`text-xs px-2 py-1 rounded ${!bat1Strike ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"}`}
                                        >
                                          *
                                        </button>
                                      </div>
                                    </div>

                                    {/* Bowler */}
                                    <div className="space-y-2">
                                      <div className="text-xs text-gray-400 uppercase font-semibold">
                                        Bowler
                                      </div>
                                      {/* Current bowler name + figures */}
                                      <div className="flex gap-2 items-center">
                                        <input
                                          type="text"
                                          value={d.bowlName || ""}
                                          onChange={(e) =>
                                            updateField(
                                              "bowlName",
                                              e.target.value,
                                            )
                                          }
                                          placeholder="Bowler Name"
                                          className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm"
                                        />
                                        <span className="text-xs text-amber-400 font-mono font-bold whitespace-nowrap">
                                          {d.bowlOvers || 0}-
                                          {d.bowlWickets || 0}-{d.bowlRuns || 0}
                                        </span>
                                      </div>

                                      {/* Change Bowler panel */}
                                      <div className="bg-gray-900 rounded p-2 space-y-2">
                                        <div className="text-xs text-gray-500">
                                          Change bowler →
                                        </div>
                                        {/* Select a previous bowler */}
                                        {(d.bowlingLog || []).length > 0 && (
                                          <select
                                            defaultValue=""
                                            onChange={(e) => {
                                              if (!e.target.value) return;
                                              // Save current bowler first
                                              const existing = [
                                                ...(d.bowlingLog || []),
                                              ];
                                              const idx = existing.findIndex(
                                                (b) => b.name === d.bowlName,
                                              );
                                              if (idx >= 0) {
                                                existing[idx] = {
                                                  ...existing[idx],
                                                  overs:
                                                    existing[idx].overs +
                                                    (d.bowlOvers || 0),
                                                  wickets:
                                                    existing[idx].wickets +
                                                    (d.bowlWickets || 0),
                                                  runs:
                                                    existing[idx].runs +
                                                    (d.bowlRuns || 0),
                                                };
                                              } else if (d.bowlName) {
                                                existing.push({
                                                  name: d.bowlName,
                                                  overs: d.bowlOvers || 0,
                                                  wickets: d.bowlWickets || 0,
                                                  runs: d.bowlRuns || 0,
                                                });
                                              }
                                              // Restore selected previous bowler's accumulated stats
                                              const sel =
                                                existing.find(
                                                  (b) =>
                                                    b.name === e.target.value,
                                                ) || {};
                                              const remaining = existing.filter(
                                                (b) =>
                                                  b.name !== e.target.value,
                                              );
                                              d.bowlingLog = remaining;
                                              d.bowlName =
                                                sel.name || e.target.value;
                                              d.bowlOvers = sel.overs || 0;
                                              d.bowlWickets = sel.wickets || 0;
                                              d.bowlRuns = sel.runs || 0;
                                              d.bowlHistory = "";
                                              d.legalBalls = 0;
                                              updateOverlay(overlay.id, {
                                                content: JSON.stringify(d),
                                              }).then(() => {
                                                overlay.content =
                                                  JSON.stringify(d);
                                                setOverlays((prev) => [
                                                  ...prev,
                                                ]);
                                              });
                                              e.target.value = "";
                                            }}
                                            className="w-full bg-gray-700 text-white rounded px-2 py-1 text-sm"
                                          >
                                            <option value="">
                                              ↩ Return a previous bowler…
                                            </option>
                                            {(d.bowlingLog || []).map(
                                              (b, i) => (
                                                <option key={i} value={b.name}>
                                                  {b.name} ({b.overs}-
                                                  {b.wickets}-{b.runs})
                                                </option>
                                              ),
                                            )}
                                          </select>
                                        )}
                                        {/* New bowler name field */}
                                        <div className="flex gap-1">
                                          <input
                                            id={`new-bowler-${overlay.id}`}
                                            type="text"
                                            placeholder="New bowler name…"
                                            className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm"
                                          />
                                          <button
                                            onClick={() => {
                                              const input =
                                                document.getElementById(
                                                  `new-bowler-${overlay.id}`,
                                                );
                                              const newName =
                                                input?.value?.trim();
                                              // Save current bowler
                                              const existing = [
                                                ...(d.bowlingLog || []),
                                              ];
                                              const idx = existing.findIndex(
                                                (b) => b.name === d.bowlName,
                                              );
                                              if (idx >= 0) {
                                                existing[idx] = {
                                                  ...existing[idx],
                                                  overs:
                                                    existing[idx].overs +
                                                    (d.bowlOvers || 0),
                                                  wickets:
                                                    existing[idx].wickets +
                                                    (d.bowlWickets || 0),
                                                  runs:
                                                    existing[idx].runs +
                                                    (d.bowlRuns || 0),
                                                };
                                              } else if (d.bowlName) {
                                                existing.push({
                                                  name: d.bowlName,
                                                  overs: d.bowlOvers || 0,
                                                  wickets: d.bowlWickets || 0,
                                                  runs: d.bowlRuns || 0,
                                                });
                                              }
                                              d.bowlingLog = existing;
                                              d.bowlName =
                                                newName || "New Bowler";
                                              d.bowlOvers = 0;
                                              d.bowlRuns = 0;
                                              d.bowlWickets = 0;
                                              d.bowlHistory = "";
                                              d.legalBalls = 0;
                                              if (input) input.value = "";
                                              updateOverlay(overlay.id, {
                                                content: JSON.stringify(d),
                                              }).then(() => {
                                                overlay.content =
                                                  JSON.stringify(d);
                                                setOverlays((prev) => [
                                                  ...prev,
                                                ]);
                                              });
                                            }}
                                            className="bg-indigo-700 hover:bg-indigo-600 text-white text-xs px-3 py-1 rounded whitespace-nowrap"
                                          >
                                            Set
                                          </button>
                                        </div>
                                      </div>
                                      {/* Bowling log summary */}
                                      {(d.bowlingLog || []).length > 0 && (
                                        <div className="bg-gray-900 rounded p-2 space-y-1">
                                          <div className="text-xs text-gray-500 uppercase mb-1">
                                            Bowling Log (O-W-R)
                                          </div>
                                          {(d.bowlingLog || []).map((b, i) => (
                                            <div
                                              key={i}
                                              className="flex justify-between text-xs"
                                            >
                                              <span className="text-gray-300">
                                                {b.name}
                                              </span>
                                              <span className="text-amber-400 font-mono">
                                                {b.overs}-{b.wickets}-{b.runs}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Current Over Balls */}
                                    {d.bowlHistory && (
                                      <div className="flex gap-1 flex-wrap">
                                        <span className="text-xs text-gray-500 mr-1 self-center">
                                          This over:
                                        </span>
                                        {d.bowlHistory
                                          .split(" ")
                                          .filter(Boolean)
                                          .map((ball, i) => (
                                            <span
                                              key={i}
                                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white
                                      ${ball === "W" ? "bg-red-600" : ball === "4" || ball === "6" ? "bg-blue-600" : ball === "Wd" || ball === "Nb" ? "bg-yellow-600" : "bg-gray-600"}`}
                                            >
                                              {ball}
                                            </span>
                                          ))}
                                      </div>
                                    )}

                                    {/* Score Status */}
                                    <div className="bg-gray-900 rounded p-2 flex justify-between text-sm">
                                      <span className="text-white font-bold">
                                        {d.runs || 0}-{d.wickets || 0}
                                      </span>
                                      <span className="text-gray-400">
                                        Overs: {d.overs || "0.0"}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {d.legalBalls || 0}/6 balls
                                      </span>
                                    </div>

                                    {/* Runs Buttons */}
                                    <div>
                                      <div className="text-xs text-gray-400 mb-1 uppercase font-semibold">
                                        Runs
                                      </div>
                                      <div className="grid grid-cols-6 gap-1">
                                        {deliveryBtn("0", "0")}
                                        {deliveryBtn("1", "1")}
                                        {deliveryBtn("2", "2")}
                                        {deliveryBtn("3", "3")}
                                        {deliveryBtn(
                                          "4",
                                          "4",
                                          "bg-blue-700 hover:bg-blue-600",
                                        )}
                                        {deliveryBtn(
                                          "6",
                                          "6",
                                          "bg-blue-700 hover:bg-blue-600",
                                        )}
                                      </div>
                                    </div>

                                    {/* Extras */}
                                    <div className="space-y-2">
                                      <div className="text-xs text-gray-400 mb-1 uppercase font-semibold">
                                        Extras
                                      </div>

                                      {/* Wide */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-yellow-400 w-16 shrink-0 font-semibold">
                                          Wide
                                        </span>
                                        <div className="grid grid-cols-6 gap-1 flex-1">
                                          {deliveryBtn(
                                            "Wd",
                                            "Wd",
                                            "bg-yellow-700 hover:bg-yellow-600",
                                          )}
                                          {deliveryBtn(
                                            "+1",
                                            "Wd+1",
                                            "bg-yellow-700 hover:bg-yellow-600",
                                          )}
                                          {deliveryBtn(
                                            "+2",
                                            "Wd+2",
                                            "bg-yellow-700 hover:bg-yellow-600",
                                          )}
                                          {deliveryBtn(
                                            "+3",
                                            "Wd+3",
                                            "bg-yellow-700 hover:bg-yellow-600",
                                          )}
                                          {deliveryBtn(
                                            "+4",
                                            "Wd+4",
                                            "bg-yellow-700 hover:bg-yellow-600",
                                          )}
                                          {deliveryBtn(
                                            "+5",
                                            "Wd+5",
                                            "bg-yellow-700 hover:bg-yellow-600",
                                          )}
                                        </div>
                                      </div>

                                      {/* No Ball */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-orange-400 w-16 shrink-0 font-semibold">
                                          No Ball
                                        </span>
                                        <div className="grid grid-cols-6 gap-1 flex-1">
                                          {deliveryBtn(
                                            "Nb",
                                            "Nb",
                                            "bg-orange-700 hover:bg-orange-600",
                                          )}
                                          {deliveryBtn(
                                            "+1",
                                            "Nb+1",
                                            "bg-orange-700 hover:bg-orange-600",
                                          )}
                                          {deliveryBtn(
                                            "+2",
                                            "Nb+2",
                                            "bg-orange-700 hover:bg-orange-600",
                                          )}
                                          {deliveryBtn(
                                            "+3",
                                            "Nb+3",
                                            "bg-orange-700 hover:bg-orange-600",
                                          )}
                                          {deliveryBtn(
                                            "+4",
                                            "Nb+4",
                                            "bg-orange-700 hover:bg-orange-600",
                                          )}
                                          {deliveryBtn(
                                            "+6",
                                            "Nb+6",
                                            "bg-orange-700 hover:bg-orange-600",
                                          )}
                                        </div>
                                      </div>

                                      {/* Leg Bye */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-blue-300 w-16 shrink-0 font-semibold">
                                          Leg Bye
                                        </span>
                                        <div className="grid grid-cols-4 gap-1 flex-1">
                                          {deliveryBtn(
                                            "Lb+1",
                                            "Lb+1",
                                            "bg-slate-600 hover:bg-slate-500",
                                          )}
                                          {deliveryBtn(
                                            "Lb+2",
                                            "Lb+2",
                                            "bg-slate-600 hover:bg-slate-500",
                                          )}
                                          {deliveryBtn(
                                            "Lb+3",
                                            "Lb+3",
                                            "bg-slate-600 hover:bg-slate-500",
                                          )}
                                          {deliveryBtn(
                                            "Lb+4",
                                            "Lb+4",
                                            "bg-slate-600 hover:bg-slate-500",
                                          )}
                                        </div>
                                      </div>

                                      {/* Bye */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-purple-300 w-16 shrink-0 font-semibold">
                                          Bye
                                        </span>
                                        <div className="grid grid-cols-4 gap-1 flex-1">
                                          {deliveryBtn(
                                            "B+1",
                                            "B+1",
                                            "bg-purple-800 hover:bg-purple-700",
                                          )}
                                          {deliveryBtn(
                                            "B+2",
                                            "B+2",
                                            "bg-purple-800 hover:bg-purple-700",
                                          )}
                                          {deliveryBtn(
                                            "B+3",
                                            "B+3",
                                            "bg-purple-800 hover:bg-purple-700",
                                          )}
                                          {deliveryBtn(
                                            "B+4",
                                            "B+4",
                                            "bg-purple-800 hover:bg-purple-700",
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Wicket + Undo */}
                                    <div className="grid grid-cols-2 gap-2">
                                      {deliveryBtn(
                                        "⚡ WICKET",
                                        "W",
                                        "bg-red-700 hover:bg-red-600 col-span-1",
                                      )}
                                      {deliveryBtn(
                                        "↩ Undo",
                                        "Undo",
                                        "bg-gray-600 hover:bg-gray-500 col-span-1",
                                      )}
                                    </div>

                                    {/* Download Summary */}
                                    <button
                                      onClick={() => {
                                        const allBatsmen = [
                                          ...(d.battingLog || []),
                                          {
                                            name: d.bat1Name || "Batsman 1",
                                            runs: d.bat1Runs || 0,
                                            out: false,
                                          },
                                          {
                                            name: d.bat2Name || "Batsman 2",
                                            runs: d.bat2Runs || 0,
                                            out: false,
                                          },
                                        ];
                                        const allBowlers = [
                                          ...(d.bowlingLog || []),
                                          {
                                            name: d.bowlName || "Bowler",
                                            overs: d.bowlOvers || 0,
                                            wickets: d.bowlWickets || 0,
                                            runs: d.bowlRuns || 0,
                                          },
                                        ];
                                        const lines = [
                                          "===== MATCH SCORECARD =====",
                                          `Score: ${d.runs || 0}/${d.wickets || 0}  (${d.overs || 0} overs)`,
                                          "",
                                          "--- BATTING ---",
                                          "Batsman                 Runs  Status",
                                          ...allBatsmen.map(
                                            (b) =>
                                              `${(b.name || "").padEnd(24)}${String(b.runs || 0).padEnd(6)}${b.out ? "Out" : "Not Out"}`,
                                          ),
                                          "",
                                          "--- BOWLING ---",
                                          "Bowler                  Overs  Wkts  Runs",
                                          ...allBowlers.map(
                                            (b) =>
                                              `${(b.name || "").padEnd(24)}${String(b.overs || 0).padEnd(7)}${String(b.wickets || 0).padEnd(6)}${b.runs || 0}`,
                                          ),
                                          "",
                                          `Generated: ${new Date().toLocaleString()}`,
                                        ];
                                        const blob = new Blob(
                                          [lines.join("\n")],
                                          { type: "text/plain" },
                                        );
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = "scorecard.txt";
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      }}
                                      className="w-full bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold rounded py-2 transition-all"
                                    >
                                      Download Match Summary
                                    </button>
                                  </div>
                                );
                              })()}
                          </div>
                        );
                      })}
                  </div>
                )}

              {/* Audio Panel */}
              {/* Audio Panel - Add source selection */}
              {activePanel === "audio" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-gray-400 uppercase">
                    Audio Source
                  </h3>
                  <select
                    value={activeAudioSource || ""}
                    onChange={(e) =>
                      setActiveAudioSource(e.target.value || null)
                    }
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3"
                  >
                    <option value="">No Audio</option>
                    {Object.values(cameras).map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        Camera: {cam.deviceName || cam.id.split("_")[0]}{" "}
                        {cam.stream.getAudioTracks().length === 0
                          ? "(no mic)"
                          : ""}
                      </option>
                    ))}
                    <option value="commentary">Commentary Mic</option>
                  </select>

                  <h3 className="font-bold text-sm text-gray-400 uppercase mt-6">
                    Camera Audio
                  </h3>
                  {Object.values(cameras).map((cam) => {
                    const hasMic = cam.stream.getAudioTracks().length > 0;
                    const isMuted = mutedCameras[cam.id];
                    const isActive = activeAudioSource === cam.id;

                    return (
                      <div
                        key={cam.id}
                        className={`bg-gray-800 rounded-lg p-3 flex items-center justify-between border transition ${isActive && !isMuted ? "border-green-500/50" : "border-transparent"}`}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {cam.deviceName || cam.id.split("_")[0]}
                          </span>
                          <span className="text-xs mt-1">
                            {!hasMic ? (
                              <span className="text-gray-500">
                                No mic input
                              </span>
                            ) : isMuted ? (
                              <span className="text-red-400 font-semibold">
                                Muted
                              </span>
                            ) : isActive ? (
                              <span className="text-green-400 font-bold">
                                Main Voice (Highlighted)
                              </span>
                            ) : (
                              <span className="text-indigo-400">
                                Ducked (Background)
                              </span>
                            )}
                          </span>
                        </div>
                        {hasMic && (
                          <button
                            onClick={() => {
                              const audioTracks = cam.stream.getAudioTracks();
                              if (audioTracks.length) {
                                const newMuted = !mutedCameras[cam.id];
                                audioTracks.forEach(
                                  (t) => (t.enabled = !newMuted),
                                );
                                setMutedCameras((prev) => ({
                                  ...prev,
                                  [cam.id]: newMuted,
                                }));
                              }
                            }}
                            className={`px-2 py-1 rounded text-xs font-bold transition ${mutedCameras[cam.id] ? "bg-red-600 hover:bg-red-500 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-200"}`}
                          >
                            {mutedCameras[cam.id] ? "Unmute" : "Mute"}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <h3 className="font-bold text-sm text-gray-400 uppercase mt-6">
                    Commentary Mic
                  </h3>
                  {commentaryActive ? (
                    <div
                      className={`bg-gray-800 rounded-lg p-3 space-y-2 border transition ${activeAudioSource === "commentary" && !commentaryMuted ? "border-green-500/50" : "border-transparent"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            Commentary Mic
                          </span>
                          <span className="text-xs mt-1">
                            {commentaryMuted ? (
                              <span className="text-red-400 font-semibold">
                                Muted
                              </span>
                            ) : activeAudioSource === "commentary" ? (
                              <span className="text-green-400 font-bold">
                                Main Voice (Highlighted)
                              </span>
                            ) : (
                              <span className="text-indigo-400">
                                Ducked (Background)
                              </span>
                            )}
                          </span>
                        </div>
                        <button
                          onClick={toggleCommentaryMute}
                          className={`px-3 py-1 rounded text-xs font-bold transition ${commentaryMuted ? "bg-red-600 hover:bg-red-500 text-white" : "bg-green-600 hover:bg-green-500 text-white"}`}
                        >
                          {commentaryMuted ? "Unmute" : "Mute"}
                        </button>
                      </div>
                      <button
                        onClick={stopCommentary}
                        className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded py-1.5 text-xs transition"
                      >
                        Disconnect Mic
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={startCommentary}
                      className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg p-3 text-sm transition font-semibold"
                    >
                      <i className="fa-solid fa-microphone-lines mr-2" />{" "}
                      Connect Commentary Mic
                    </button>
                  )}
                </div>
              )}

              {/* Sponsored Ads Panel */}
              {activePanel === "sponsored" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-gray-400 uppercase">
                    Sponsored Ads Marketplace
                  </h3>
                  {currentSponsoredAd && (
                    <div className="bg-green-900/40 border border-green-700 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-bold text-green-200">
                        Playing: {currentSponsoredAd.ad.title}
                      </p>

                      <p className="text-xs text-green-100 leading-relaxed">
                        Complete after playback. Payout will be calculated from
                        verified Vision Cast platform viewers.
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-black/20 rounded p-2">
                          <span className="block text-green-100/70">
                            Est. payout/view
                          </span>
                          <strong className="text-green-100">
                            NRS{" "}
                            {Number(
                              currentSponsoredAd.estimatedPayoutPerView || 0,
                            ).toFixed(2)}
                          </strong>
                        </div>

                        <div className="bg-black/20 rounded p-2">
                          <span className="block text-green-100/70">
                            Cost/view
                          </span>
                          <strong className="text-green-100">
                            NRS{" "}
                            {Number(
                              currentSponsoredAd.costPerView || 0,
                            ).toFixed(2)}
                          </strong>
                        </div>
                      </div>

                      <button
                        onClick={() => handleCompleteSponsoredAd()}
                        className="w-full bg-green-600 hover:bg-green-700 rounded py-2 text-sm font-bold"
                      >
                        Complete & Calculate Views
                      </button>
                    </div>
                  )}
                  {sponsoredAds.length === 0 ? (
                    <div className="bg-gray-800 rounded-lg p-4 text-center text-gray-400 text-sm">
                      No approved sponsored ads available yet.
                    </div>
                  ) : (
                    sponsoredAds.map((item) => {
                      const ad = item.ad || item;
                      const mediaURL = resolveMediaUrl(
                        ad.mediaUrl || ad.media_url,
                      );
                      return (
                        <div
                          key={ad.id}
                          className="bg-gray-800 rounded-lg p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm text-white">
                                {ad.title}
                              </p>
                              <p className="text-xs text-gray-400 capitalize">
                                {ad.type} • est. payout/view NRS{" "}
                                {Number(
                                  item.yourPayout ||
                                    item.estimatedPayoutPerView ||
                                    ad.creatorPayoutPro ||
                                    ad.creatorPayoutFree ||
                                    0,
                                ).toFixed(2)}
                              </p>

                              <p className="text-xs text-gray-500">
                                Budget left: NRS{" "}
                                {Number(ad.remainingBudget || 0).toFixed(2)} •
                                CPV: NRS{" "}
                                {Number(
                                  ad.costPerView || ad.baseChargePerPlay || 0,
                                ).toFixed(2)}
                              </p>
                            </div>
                            <span className="text-xs bg-gray-700 rounded px-2 py-1">
                              {ad.durationSeconds || ad.duration_seconds || 0}s
                            </span>
                          </div>
                          {mediaURL &&
                            (ad.type === "image" ? (
                              <img
                                src={mediaURL}
                                className="w-full h-24 object-cover rounded border border-gray-700"
                              />
                            ) : (
                              <video
                                src={mediaURL}
                                className="w-full h-24 object-cover rounded border border-gray-700"
                                muted
                                controls
                              />
                            ))}
                          <button
                            disabled={
                              sponsoredAdLoading || !!currentSponsoredAd
                            }
                            onClick={() => handlePlaySponsoredAd(item)}
                            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded py-2 text-sm font-bold"
                          >
                            Add to Stream
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Destinations Panel */}
              {activePanel === "destinations" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-gray-400 uppercase">
                    Add Stream Destination
                  </h3>
                  <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                    <select
                      value={newDest.platform}
                      onChange={(e) =>
                        setNewDest({ ...newDest, platform: e.target.value })
                      }
                      className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                    >
                      {PLATFORM_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Stream Key"
                      value={newDest.stream_key}
                      onChange={(e) =>
                        setNewDest({ ...newDest, stream_key: e.target.value })
                      }
                      className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                    />
                    {newDest.platform === "custom" && (
                      <input
                        type="text"
                        placeholder="RTMP Server URL"
                        value={newDest.server_url}
                        onChange={(e) =>
                          setNewDest({ ...newDest, server_url: e.target.value })
                        }
                        className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm"
                      />
                    )}
                    <button
                      onClick={handleAddDestination}
                      className="w-full bg-red-600 hover:bg-red-700 rounded py-2 text-sm font-bold"
                    >
                      Add Destination
                    </button>
                  </div>
                  <h3 className="font-bold text-sm text-gray-400 uppercase mt-4">
                    Active Destinations
                  </h3>
                  {destinations.map((dest) => (
                    <div
                      key={dest.id}
                      className="bg-gray-800 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="vc-platform-icon">
                          {dest.platform === "youtube" && (
                            <i className="fa-brands fa-youtube" />
                          )}
                          {dest.platform === "facebook" && (
                            <i className="fa-brands fa-facebook" />
                          )}
                          {dest.platform === "twitch" && (
                            <i className="fa-brands fa-twitch" />
                          )}
                          {dest.platform === "custom" && (
                            <i className="fa-solid fa-plug" />
                          )}
                        </span>
                        <span className="text-sm font-medium capitalize">
                          {dest.platform}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleDestinationActive(dest)}
                          className={`px-3 py-1 rounded text-xs font-bold ${dest.is_active ? "bg-green-600" : "bg-gray-700"}`}
                        >
                          {dest.is_active ? "ON" : "OFF"}
                        </button>
                        <button
                          onClick={() => handleDeleteDestination(dest.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="vc-share-card space-y-3">
              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2">
                  Share Watch Link
                </p>
                <div className="vc-share-row">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/watch/${eventCode}`}
                    className="text-xs"
                  />
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}/watch/${eventCode}`,
                      )
                    }
                    className="vc-copy-btn"
                    title="Copy watch link"
                  >
                    <i className="fa-solid fa-copy" />
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2">
                  Camera Join Link
                </p>
                <div className="vc-share-row">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/camera?session=${eventCode}`}
                    className="text-xs"
                  />
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `${window.location.origin}/camera?session=${eventCode}`,
                      )
                    }
                    className="vc-copy-btn"
                    title="Copy camera link"
                  >
                    <i className="fa-solid fa-copy" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
