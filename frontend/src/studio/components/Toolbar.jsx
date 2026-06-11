import React from 'react';
import { useStudio } from '../context/StudioContext';
import { LAYOUTS } from '../utils/constants';

export default function Toolbar({
  eventCode,
  isConnected,
  navigate,
  disableLocalRecording,
  enableLocalRecording,
  stopScreenShare,
  startScreenShare,
  endLive,
  goLive
}) {
  const {
    isLive, elapsed, activeLayout, downloadEnabled,
    isScreenSharing, viewerCount, cameras
  } = useStudio();

  return (
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

  );
}
