// Draw video maintaining aspect ratio (with optional digital zoom)
export const drawVideoFit = (ctx, video, x, y, w, h, zoom = 1) => {
  if (!video) {
    ctx.fillStyle = "#0D1318";
    ctx.fillRect(x, y, w, h);
    return;
  }

  // Try to force hidden video playback if stream is attached but not playing yet.
  if (video.srcObject && video.paused) {
    video.play().catch(() => {});
  }

  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    ctx.fillStyle = "#0D1318";
    ctx.fillRect(x, y, w, h);
    return;
  }

  const vW = video.videoWidth;
  const vH = video.videoHeight;

  const safeZoom = Math.max(1, Math.min(zoom, 4));
  const srcW = vW / safeZoom;
  const srcH = vH / safeZoom;
  const srcX = (vW - srcW) / 2;
  const srcY = (vH - srcH) / 2;

  const videoRatio = srcW / srcH;
  const boxRatio = w / h;

  let drawW;
  let drawH;
  let drawX;
  let drawY;

  if (videoRatio > boxRatio) {
    drawW = w;
    drawH = w / videoRatio;
    drawX = x;
    drawY = y + (h - drawH) / 2;
  } else {
    drawH = h;
    drawW = h * videoRatio;
    drawX = x + (w - drawW) / 2;
    drawY = y;
  }

  ctx.save();
  ctx.filter = "contrast(1.08) saturate(1.12) brightness(1.03)";
  ctx.drawImage(video, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);
  ctx.restore();
};

// Draw camera feed with premium HUD labels and fallbacks
export const drawCameraFeed = (ctx, camera, label, x, y, w, h, cameraZoom) => {
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
};

// Render overlay
export const renderOverlay = (ctx, overlay, canvasRef, mediaElementsRef) => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  let x, y, w, h;
  const padding = 24;

  ctx.save();

  // Default dynamic sizing based on text (if not media)
  const isTitleAndContent = overlay.title && overlay.content;
  const mainText = overlay.content || overlay.title || "Overlay";

  ctx.font = "bold 22px 'DM Sans', sans-serif";
  const contentWidth = ctx.measureText(mainText).width;
  ctx.font = "600 13px 'DM Sans', sans-serif";
  const titleWidth = overlay.title
    ? ctx.measureText(overlay.title.toUpperCase()).width
    : 0;

  let targetW = Math.max(contentWidth, titleWidth) + padding * 2 + 8;
  w = Math.min(Math.max(targetW, 200), 800);
  h = isTitleAndContent ? 84 : 64;

  // Adjust size for specific scorecards
  if (overlay.type === "football-scorecard") {
    w = 400;
    h = 70;
  } else if (overlay.type === "cricket-scorecard") {
    w = canvas.width;
    h = 70; // Full width bottom bar
  } else if (
    overlay.type === "ad" ||
    overlay.type === "replay" ||
    overlay.type === "image" ||
    overlay.type === "video-link"
  ) {
    // Full screen or specific pip size
    if (overlay.position === "full") {
      w = canvas.width;
      h = canvas.height;
    } else {
      w = 320;
      h = 180; // Default 16:9 box
    }
  }

  switch (overlay.position) {
    case "top-left":
      x = 32;
      y = 32;
      break;
    case "top-right":
      x = canvas.width - w - 32;
      y = 32;
      break;
    case "bottom-left":
      x = 32;
      y = canvas.height - h - 32;
      break;
    case "bottom-right":
      x = canvas.width - w - 32;
      y = canvas.height - h - 32;
      break;
    case "center":
      x = (canvas.width - w) / 2;
      y = (canvas.height - h) / 2;
      break;
    case "full":
      x = 0;
      y = 0;
      w = canvas.width;
      h = canvas.height;
      break;
    default:
      ctx.restore();
      return;
  }

  // Force full bottom for cricket
  if (overlay.type === "cricket-scorecard") {
    x = 0;
    y = canvas.height - h;
  }

  // Render Media (Video/Image)
  if (
    overlay.type === "ad" ||
    overlay.type === "replay" ||
    overlay.type === "image"
  ) {
    const mediaInfo = mediaElementsRef.current[overlay.id];
    if (mediaInfo && mediaInfo.element) {
      if (overlay.position !== "full") {
        // Draw border/shadow for PiP media
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 15;
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.shadowBlur = 0;
      }
      ctx.drawImage(mediaInfo.element, x, y, w, h);

      if (overlay.type === "replay") {
        // Add "REPLAY" watermark
        ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
        ctx.fillRect(x + 10, y + 10, 80, 24);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("REPLAY", x + 50, y + 22);
      }
    } else {
      // Placeholder if media is missing
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = "14px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Media not loaded", x + w / 2, y + h / 2);
    }
    ctx.restore();
    return;
  }

  // Render External Video Link overlay
  if (overlay.type === "video-link") {
    const mediaInfo = mediaElementsRef.current[overlay.id];
    if (mediaInfo && mediaInfo.element && mediaInfo.element.readyState >= 2) {
      if (overlay.position !== "full") {
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 18;
        ctx.strokeStyle = "rgba(99,102,241,0.5)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        ctx.shadowBlur = 0;
        // Label badge
        ctx.fillStyle = "rgba(99,102,241,0.85)";
        ctx.fillRect(x + 8, y + 8, 68, 20);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px 'DM Sans', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("LIVE EMBED", x + 12, y + 18);
      }
      ctx.drawImage(mediaInfo.element, x, y, w, h);
    } else {
      ctx.fillStyle = "rgba(15,23,42,0.9)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(99,102,241,0.8)";
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = "#94A3B8";
      ctx.font = "13px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⏳ Loading video...", x + w / 2, y + h / 2);
    }
    ctx.restore();
    return;
  }

  // Background for Text and Scorecards
  if (overlay.position !== "full") {
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, "rgba(15, 23, 42, 0.85)");
    gradient.addColorStop(1, "rgba(30, 41, 59, 0.75)");
    ctx.fillStyle = gradient;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, w, h);
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }

    // Accent bar
    const accentGradient = ctx.createLinearGradient(x, y, x, y + h);
    accentGradient.addColorStop(
      0,
      overlay.type === "football-scorecard"
        ? "#10B981"
        : overlay.type === "cricket-scorecard"
          ? "#F59E0B"
          : "#3B82F6",
    );
    accentGradient.addColorStop(
      1,
      overlay.type === "football-scorecard"
        ? "#059669"
        : overlay.type === "cricket-scorecard"
          ? "#D97706"
          : "#8B5CF6",
    );
    ctx.fillStyle = accentGradient;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, 6, h, { tl: 12, bl: 12, tr: 0, br: 0 });
    } else {
      ctx.fillRect(x, y, 6, h);
    }
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(x, y, w, h);
  }

  // Drawing Content
  if (overlay.type === "football-scorecard") {
    const data = overlay.content ? JSON.parse(overlay.content) : {};
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 24px 'DM Sans', sans-serif";

    const teamA = (data.teamA || "TMA").substring(0, 3).toUpperCase();
    const teamB = (data.teamB || "TMB").substring(0, 3).toUpperCase();
    const scoreA = data.scoreA || 0;
    const scoreB = data.scoreB || 0;

    // Center separator
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(x + w / 2 - 20, y + 15, 40, h - 30);
    ctx.fillStyle = "#fff";
    ctx.fillText("-", x + w / 2, y + h / 2);

    ctx.fillStyle = "#fff";
    // Team A
    ctx.textAlign = "right";
    ctx.fillText(teamA, x + w / 2 - 35, y + h / 2);
    ctx.fillStyle = "#10B981"; // Score color
    ctx.fillText(scoreA, x + w / 2 - 95, y + h / 2);

    // Team B
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(teamB, x + w / 2 + 35, y + h / 2);
    ctx.fillStyle = "#10B981"; // Score color
    ctx.fillText(scoreB, x + w / 2 + 95, y + h / 2);
  } else if (overlay.type === "cricket-scorecard") {
    const data = overlay.content ? JSON.parse(overlay.content) : {};
    const batTeam = (data.battingTeam || "BAT").substring(0, 3).toUpperCase();
    const bowlTeam = (data.bowlingTeam || "BWL")
      .substring(0, 3)
      .toUpperCase();
    const runs = data.runs || 0;
    const wickets = data.wickets || 0;

    const bat1Name = data.bat1Name || "Batsman 1";
    const bat1Runs = data.bat1Runs || 0;
    const bat1Strike = data.bat1Strike !== false; // Default true

    const bat2Name = data.bat2Name || "Batsman 2";
    const bat2Runs = data.bat2Runs || 0;
    const bat2Strike = data.bat2Strike === true;

    const bowlName = data.bowlName || "Bowler 1";
    const bowlOvers = data.bowlOvers || 0;
    const bowlRuns = data.bowlRuns || 0;
    const bowlWickets = data.bowlWickets || 0;
    const bowlHistory = data.bowlHistory || "";

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const midY = y + h / 2;

    // 1. Teams Box (Dark Blue)
    ctx.fillStyle = "#1E3A8A";
    ctx.fillRect(x, y, 160, h);
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "bold 20px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${batTeam} v ${bowlTeam}`, x + 80, midY);

    // 2. Score Box (Amber)
    ctx.fillStyle = "#F59E0B";
    ctx.fillRect(x + 160, y, 160, h);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 30px 'DM Sans', sans-serif";
    ctx.fillText(`${runs}-${wickets}`, x + 240, midY);

    // 2b. Overs Box (Dark navy)
    const overs = data.overs || 0;
    ctx.fillStyle = "#0F172A";
    ctx.fillRect(x + 320, y, 90, h);
    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 11px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("OVERS", x + 365, midY - 11);
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "bold 18px 'DM Sans', sans-serif";
    ctx.fillText(String(overs), x + 365, midY + 10);

    // 3. Batsmen Area
    ctx.textAlign = "left";
    ctx.font = "bold 18px 'DM Sans', sans-serif";
    let currX = x + 425;

    const drawBatsman = (name, bRuns, isStrike) => {
      // Dot
      if (isStrike) {
        ctx.beginPath();
        ctx.arc(currX, midY, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#10B981"; // Emerald green
        ctx.fill();
      }

      ctx.fillStyle = "#F8FAFC";
      ctx.fillText(`${name}  ${bRuns}`, currX + 15, midY);
      currX += ctx.measureText(`${name}  ${bRuns}`).width + 45;
    };

    drawBatsman(bat1Name, bat1Runs, bat1Strike);

    // Divider
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(currX - 15, y + 15, 1, h - 30);

    drawBatsman(bat2Name, bat2Runs, bat2Strike);

    // Divider
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(currX - 15, y + 15, 1, h - 30);

    // 4. Bowler Area
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "600 16px 'DM Sans', sans-serif";
    ctx.fillText(`${bowlName}`, currX, midY);
    currX += ctx.measureText(bowlName).width + 20;

    // Bowler History
    if (bowlHistory) {
      const balls = bowlHistory.trim().split(/\s+/);
      balls.forEach((ball) => {
        // draw circle
        ctx.beginPath();
        ctx.arc(currX + 12, midY, 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        if (ball === "W")
          ctx.fillStyle = "#EF4444"; // Red for wicket
        else if (ball === "4" || ball === "6") ctx.fillStyle = "#3B82F6"; // Blue for boundary
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px 'DM Sans', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ball, currX + 12, midY);
        ctx.textAlign = "left";
        currX += 28;
      });
    }

    // Bowler Stats (standard cricket notation: Overs-Wickets-Runs)
    currX += 15;
    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 14px 'DM Sans', sans-serif";
    const bowlFigures = `${bowlOvers}-${bowlWickets}-${bowlRuns}`;
    ctx.fillText(bowlFigures, currX, midY);
  } else if (isTitleAndContent && overlay.position !== "full") {
    ctx.fillStyle = "#94A3B8";
    ctx.font = "600 13px 'DM Sans', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.letterSpacing = "1px";
    ctx.fillText(overlay.title.toUpperCase(), x + padding + 4, y + 16);

    ctx.fillStyle = "#F8FAFC";
    ctx.font = "bold 22px 'DM Sans', sans-serif";
    ctx.letterSpacing = "0px";
    ctx.fillText(overlay.content, x + padding + 4, y + 42);
  } else {
    ctx.fillStyle = "#F8FAFC";
    ctx.font = "bold 22px 'DM Sans', sans-serif";
    ctx.textAlign = overlay.position === "full" ? "center" : "left";
    ctx.textBaseline = "middle";
    const textX = overlay.position === "full" ? x + w / 2 : x + padding + 4;
    ctx.fillText(mainText, textX, y + h / 2);
  }

  ctx.restore();
};
