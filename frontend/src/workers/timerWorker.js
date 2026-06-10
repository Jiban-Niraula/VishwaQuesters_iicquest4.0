/**
 * timerWorker.js
 * A Web Worker that sends tick messages at ~30 FPS using setInterval.
 * Unlike requestAnimationFrame on the main thread, workers are NOT throttled
 * by the browser when the tab is in the background, ensuring the canvas
 * render loop keeps running and the stream stays live.
 */

let intervalId = null;

self.onmessage = (e) => {
  if (e.data === 'start') {
    if (intervalId) return;
    // ~30 FPS  (33.33ms per frame)
    intervalId = setInterval(() => {
      self.postMessage('tick');
    }, 1000 / 30);
  } else if (e.data === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
