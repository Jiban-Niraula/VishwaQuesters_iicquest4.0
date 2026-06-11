import React from 'react';
import { useStudio } from '../context/StudioContext';
import { STREAM_WIDTH, STREAM_HEIGHT } from '../utils/constants';

export default function Canvas() {
  const {
    activeCameraId, cameras, activeOverlays, canvasRef
  } = useStudio();

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
