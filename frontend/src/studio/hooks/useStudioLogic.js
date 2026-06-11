import { useEffect, useCallback, useRef } from 'react';
import { 
  getOverlays, createOverlay, updateOverlay, deleteOverlay, 
  getDestinations, addDestination, updateDestination, deleteDestination, 
  startRTMPStream, stopRTMPStream, updateEvent, getEvents, 
  getSponsoredAds, playSponsoredAd, completeSponsoredAdPlacement, resolveMediaUrl 
} from "../../services/api";
import { STREAM_WIDTH, STREAM_HEIGHT, STREAM_FPS, RECORDER_CHUNK_MS, STREAM_VIDEO_BITRATE, STREAM_AUDIO_BITRATE } from "../utils/constants";
import { ICE_SERVERS, getSupportedMimeType } from "../utils/webrtc";
import { drawVideoFit } from "../utils/canvasHelpers";

export function useStudioLogic(state, { send, isConnected, clientID, eventCode }) {
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
          renderOverlay(ctx, overlay, canvasRef, mediaElementsRef);
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



  return {
    drawCameraFeed,
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
    handleDeleteDestination
  };
}
