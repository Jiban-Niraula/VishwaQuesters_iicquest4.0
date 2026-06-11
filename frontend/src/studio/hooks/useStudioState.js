import { useState, useRef } from "react";

export function useStudioState() {
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

  return {
    // Refs
    canvasRef, cameraVideosRef, peerConnectionsRef, viewerPeerConnectionsRef,
    iceCandidateQueuesRef, mediaRecorderRef, commentaryStreamRef, streamWSRef,
    frameRequestRef, clientIdRef, isLiveRef, finalStreamRef, mediaElementsRef,
    cricketBallLogsRef, audioContextRef, mixerDestinationRef, audioSourcesRef,
    timerWorkerRef, screenShareStreamRef, cameraRecordersRef, cameraRecordersIntervalsRef,
    recordingDirHandleRef, hlsInstancesRef,
    
    // State
    cameras, setCameras, activeCameraId, setActiveCameraId, activeLayout, setActiveLayout,
    slotAssignments, setSlotAssignments, mutedCameras, setMutedCameras, activeAudioSource, setActiveAudioSource,
    commentaryActive, setCommentaryActive, commentaryMuted, setCommentaryMuted, isLive, setIsLive,
    viewerCount, setViewerCount, liveStartTime, setLiveStartTime, overlays, setOverlays,
    activeOverlays, setActiveOverlays, newOverlay, setNewOverlay, newOverlayMedia, setNewOverlayMedia,
    scorecardData, setScorecardData, destinations, setDestinations, newDest, setNewDest,
    eventData, setEventData, activePanel, setActivePanel, elapsed, setElapsed,
    downloadEnabled, setDownloadEnabled, isScreenSharing, setIsScreenSharing, cameraZoom, setCameraZoom,
    newOverlayVideoUrl, setNewOverlayVideoUrl, sponsoredAds, setSponsoredAds, currentSponsoredAd, setCurrentSponsoredAd,
    sponsoredAdLoading, setSponsoredAdLoading
  };
}
