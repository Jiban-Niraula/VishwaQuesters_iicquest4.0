import { LAYOUTS, OVERLAY_TYPES, OVERLAY_POSITIONS, PLATFORM_OPTIONS } from "./studioConstants";
import { resolveMediaUrl } from "../../services/api";

export default function StudioSidebar({ studio }) {
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
                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-gray-400 uppercase">
                    Connected Cameras ({Object.keys(cameras).length})
                  </h3>

                  {/* AI Director Controls */}
                  <div className="bg-gray-800 rounded-lg p-3 space-y-3 border border-purple-500/10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <i className="fa-solid fa-brain text-purple-400 text-sm" />
                          <span className="text-sm font-bold">AI Director</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Auto picks the best camera angle
                        </p>
                      </div>
                      <button
                        onClick={toggleAutoSwitch}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          autoSwitchEnabled
                            ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                            : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                        }`}
                      >
                        {autoSwitchEnabled ? "ON" : "OFF"}
                      </button>
                    </div>

                    {autoSwitchEnabled && (
                      <>
                        <div className="flex gap-1">
                          {[
                            {
                              id: "director",
                              label: "Director",
                              icon: "fa-wand-magic-sparkles",
                            },
                            {
                              id: "audio",
                              label: "Audio",
                              icon: "fa-microphone",
                            },
                            {
                              id: "motion",
                              label: "Motion",
                              icon: "fa-person-running",
                            },
                            { id: "both", label: "Hybrid", icon: "fa-sliders" },
                          ].map((mode) => (
                            <button
                              key={mode.id}
                              onClick={() => setAutoSwitchMode(mode.id)}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all flex flex-col items-center gap-1 ${
                                autoSwitchMode === mode.id
                                  ? "bg-purple-600/30 text-purple-300 border border-purple-500/50"
                                  : "bg-gray-900 text-gray-500 border border-transparent hover:text-gray-300"
                              }`}
                            >
                              <i className={`fa-solid ${mode.icon}`} />
                              {mode.label}
                            </button>
                          ))}
                        </div>

                        <div className="rounded-lg bg-gray-900/80 border border-gray-700 p-2 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-400 uppercase tracking-wide">
                              Model
                            </span>
                            <span
                              className={`font-bold ${
                                aiDirectorStatus === "ready"
                                  ? "text-green-400"
                                  : aiDirectorStatus === "loading"
                                    ? "text-yellow-400"
                                    : aiDirectorStatus === "fallback"
                                      ? "text-orange-400"
                                      : "text-gray-500"
                              }`}
                            >
                              {aiDirectorStatus === "ready"
                                ? "Face AI Ready"
                                : aiDirectorStatus === "loading"
                                  ? "Loading AI..."
                                  : aiDirectorStatus === "fallback"
                                    ? "Fallback: Audio + Motion"
                                    : "Standby"}
                            </span>
                          </div>

                          {Object.keys(aiDirectorScores).length > 0 && (
                            <div className="space-y-1">
                              {Object.entries(aiDirectorScores)
                                .sort(([, a], [, b]) => b.total - a.total)
                                .slice(0, 3)
                                .map(([cameraId, score]) => (
                                  <div key={cameraId} className="space-y-0.5">
                                    <div className="flex justify-between gap-2 text-[10px] text-gray-400">
                                      <span className="truncate">
                                        {score.label || cameraId}
                                      </span>
                                      <span>{Math.round(score.total * 100)}%</span>
                                    </div>
                                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-purple-500 rounded-full transition-all"
                                        style={{ width: `${Math.round(score.total * 100)}%` }}
                                      />
                                    </div>
                                    {autoSwitchMode === "director" && (
                                      <div className="flex justify-between text-[9px] text-gray-600">
                                        <span>A {Math.round(score.audio * 100)}</span>
                                        <span>F {Math.round(score.face * 100)}</span>
                                        <span>M {Math.round(score.motion * 100)}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {Object.values(cameras).length === 0 && (
                    <div className="text-center py-6 text-gray-500">
                      <i className="fa-solid fa-video-slash text-xl mb-2 block" />
                      <p className="text-xs">No cameras connected yet</p>
                    </div>
                  )}

                  {Object.values(cameras).map((cam) => {
                    const isActive = activeCameraId === cam.id;
                    const hasVideo =
                      cam.stream && cam.stream.getVideoTracks().length > 0;
                    const connState =
                      peerConnectionsRef.current[cam.id]?.connectionState;

                    return (
                      <div
                        key={cam.id}
                        onClick={() => setActiveCameraId(cam.id)}
                        className={`bg-gray-800 rounded-lg overflow-hidden cursor-pointer transition border-2 ${
                          isActive
                            ? "border-red-500 shadow-lg shadow-red-500/20"
                            : "border-transparent hover:border-gray-600"
                        }`}
                      >
                        {/* Row: Small Video + Camera Info */}
                        <div className="flex items-center gap-3 p-2">
                          {/* Small Live Video Thumbnail */}
                          <div className="relative w-20 h-12 rounded-md overflow-hidden bg-black shrink-0">
                            {hasVideo ? (
                              <video
                                autoPlay
                                playsInline
                                muted
                                ref={(el) => {
                                  if (el && cam.stream) {
                                    el.srcObject = cam.stream;
                                    if (el.paused) {
                                      el.play().catch(() => {});
                                    }
                                  }
                                }}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <i className="fa-solid fa-video-slash text-gray-600 text-xs" />
                              </div>
                            )}
                            {/* LIVE dot on thumbnail */}
                            {isActive && (
                              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            )}
                          </div>

                          {/* Camera Name + Status */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  connState === "connected"
                                    ? "bg-green-500"
                                    : connState === "connecting"
                                      ? "bg-yellow-500 animate-pulse"
                                      : "bg-red-500"
                                }`}
                              />
                              <span className="text-sm font-medium truncate">
                                {cam.deviceName || cam.id.split("_")[0]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-gray-500 uppercase">
                                {cam.type}
                              </span>
                              {isActive && (
                                <span className="text-[10px] bg-red-600 px-1.5 py-0.5 rounded font-bold">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Zoom Slider */}
                        {cam.type !== "screen" && (
                          <div className="px-2 pb-2 flex items-center gap-2">
                            <span className="text-xs text-gray-400">Zoom</span>
                            <input
                              type="range"
                              min="1"
                              max="4"
                              step="0.1"
                              value={cameraZoom[cam.id] || 1}
                              onClick={(e) => e.stopPropagation()}
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
                    );
                  })}

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
  );
}
