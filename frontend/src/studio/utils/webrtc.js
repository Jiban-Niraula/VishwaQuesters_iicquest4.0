export function buildIceServers() {
  const iceServers = [
    // ✅ FIX: Multiple STUN servers for redundancy
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // ✅ FIX: Additional fallback STUN
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  const turnUrlsRaw =
    import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL;

  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrlsRaw && turnUsername && turnCredential) {
    const turnUrls = String(turnUrlsRaw)
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);

    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy:
      import.meta.env.VITE_FORCE_TURN === "true" ? "relay" : "all",
    // ✅ FIX: Better policies for multi-peer connections
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };
}

export const ICE_SERVERS = buildIceServers();

export const getSupportedMimeType = () => {
  // For browser MediaRecorder → FFmpeg pipe, VP8 WebM is usually more stable.
  // Backend FFmpeg will convert this to H.264 for YouTube/Facebook.
  const types = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log(`✅ Using stable MediaRecorder MIME type: ${type}`);
      return type;
    }
  }

  console.warn(
    "⚠️ No preferred MediaRecorder type supported. Using browser default.",
  );
  return "";
};
