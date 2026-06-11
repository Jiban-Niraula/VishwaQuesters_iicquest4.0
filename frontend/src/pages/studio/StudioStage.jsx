export default function StudioStage({ studio }) {
  const {
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
  } = studio;

  return (
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
                  width={STREAM_WIDTH}
                  height={STREAM_HEIGHT}
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
                  1920×720 / 24fps
                </span>
              </div>
            </section>
          </main>
  );
}
