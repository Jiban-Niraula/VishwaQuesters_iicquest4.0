export const LAYOUTS = [
  { id: "single", label: "Single", icon: "1" },
  { id: "side-by-side", label: "Side by Side", icon: "2" },
  { id: "pip", label: "Picture in Picture", icon: "PiP" },
  { id: "grid", label: "2×2 Grid", icon: "4" },
  { id: "wide-cu", label: "Wide + Close-up", icon: "W+C" },
];

export const OVERLAY_TYPES = [
  { id: "text", label: "Text Overlay" },
  { id: "football-scorecard", label: "Football Scorecard" },
  { id: "cricket-scorecard", label: "Cricket Scorecard" },
  { id: "ad", label: "Advertisement (Video/Image)" },
  { id: "replay", label: "Replay Video" },
  { id: "image", label: "Image" },
  { id: "video-link", label: "External Video / Live Stream" },
];

export const OVERLAY_POSITIONS = [
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
  { id: "center", label: "Center" },
  { id: "full", label: "Full Screen" },
];

export const PLATFORM_OPTIONS = [
  { id: "youtube", label: "YouTube Live" },
  { id: "facebook", label: "Facebook Live" },
  { id: "twitch", label: "Twitch" },
  { id: "custom", label: "Custom RTMP" },
];

export const STREAM_WIDTH = 1280;
export const STREAM_HEIGHT = 720;
export const STREAM_FPS = 24;
export const RECORDER_CHUNK_MS = 250;
export const STREAM_VIDEO_BITRATE = 2_500_000;
export const STREAM_AUDIO_BITRATE = 128_000;
