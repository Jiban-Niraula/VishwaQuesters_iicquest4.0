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
import { 
  LAYOUTS, OVERLAY_TYPES, OVERLAY_POSITIONS, PLATFORM_OPTIONS, 
  STREAM_WIDTH, STREAM_HEIGHT, STREAM_FPS, RECORDER_CHUNK_MS, 
  STREAM_VIDEO_BITRATE, STREAM_AUDIO_BITRATE 
} from "../studio/utils/constants";
import { ICE_SERVERS, getSupportedMimeType } from "../studio/utils/webrtc";
import { drawVideoFit } from "../studio/utils/canvasHelpers";
import { useStudio } from "../studio/context/StudioContext";
import "../studio/styles/studio.css";
import Toolbar from "../studio/components/Toolbar";
import { useStudioLogic } from "../studio/hooks/useStudioLogic";
import Sidebar from "../studio/components/Sidebar";
import Canvas from "../studio/components/Canvas";







export default function StudioContent() {
  const { eventCode } = useParams();
  const navigate = useNavigate();


  const state = useStudio();
  const { 
    canvasRef, cameraVideosRef, peerConnectionsRef, viewerPeerConnectionsRef,
    iceCandidateQueuesRef, mediaRecorderRef, commentaryStreamRef, streamWSRef,
    frameRequestRef, clientIdRef, isLiveRef, finalStreamRef, mediaElementsRef,
    cricketBallLogsRef, audioContextRef, mixerDestinationRef, audioSourcesRef,
    timerWorkerRef, screenShareStreamRef, cameraRecordersRef, cameraRecordersIntervalsRef,
    recordingDirHandleRef, hlsInstancesRef,
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
  } = state;

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


  // Draw camera feed with premium HUD labels and fallbacks
  const actions = useStudioLogic(state, { send, isConnected, clientID, eventCode });
  const { drawCameraFeed,
    getResolvedSlots,
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
    handleDeleteDestination } = actions;

  return (
    <>
      
      <div className="vc-studio-shell min-h-screen text-white flex flex-col">
        <Toolbar 
          eventCode={eventCode}
          isConnected={isConnected}
          navigate={navigate}
          disableLocalRecording={disableLocalRecording}
          enableLocalRecording={enableLocalRecording}
          stopScreenShare={stopScreenShare}
          startScreenShare={startScreenShare}
          endLive={endLive}
          goLive={goLive}
        />

        <div className="vc-workspace flex flex-1 overflow-hidden">
          <Canvas />

          <Sidebar eventCode={eventCode} actions={actions} />
        </div>
      </div>
    </>
  );
}
