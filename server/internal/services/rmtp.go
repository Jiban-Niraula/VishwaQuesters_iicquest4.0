package services

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type RTMPStreamer struct {
	mu       sync.RWMutex
	streams  map[uint]*exec.Cmd
	inputs   map[uint]io.WriteCloser
	logFiles map[uint]*os.File
}

func NewRTMPStreamer() *RTMPStreamer {
	return &RTMPStreamer{
		streams:  make(map[uint]*exec.Cmd),
		inputs:   make(map[uint]io.WriteCloser),
		logFiles: make(map[uint]*os.File),
	}
}

func (r *RTMPStreamer) StartStream(destinationID uint, serverURL, streamKey string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.streams[destinationID]; exists {
		log.Printf("[RTMP] Stream for destination %d already running", destinationID)
		return nil
	}

	rtmpURL := r.buildRTMPURL(serverURL, streamKey)
	log.Printf("[RTMP] Starting stream to: %s", rtmpURL)

	ffmpegPath := r.findFFmpegPath()
	if ffmpegPath == "" {
		return fmt.Errorf("FFmpeg not found")
	}

	logFile, err := os.Create(fmt.Sprintf("ffmpeg_log_%d_%d.txt", destinationID, time.Now().Unix()))
	if err != nil {
		log.Printf("[RTMP] Warning: Could not create log file: %v", err)
	} else {
		r.logFiles[destinationID] = logFile
	}

	args := []string{
		"-hide_banner",
		"-loglevel", "info",

		// Browser MediaRecorder sends WebM chunks through stdin.
		// Do not use tiny probe values here. FFmpeg needs enough data
		// to detect VP8/VP9 + Opus correctly.
		"-fflags", "+genpts",
		"-use_wallclock_as_timestamps", "1",
		"-thread_queue_size", "1024",
		"-probesize", "100M",
		"-analyzeduration", "100M",
		"-f", "webm",
		"-i", "pipe:0",

		// Video output for YouTube/Facebook/Twitch RTMP.
		"-vf", "fps=30,format=yuv420p",
		"-c:v", "libx264",
		"-preset", "veryfast",
		"-tune", "zerolatency",
		"-b:v", "4500k",
		"-maxrate", "4500k",
		"-bufsize", "9000k",
		"-g", "60",
		"-keyint_min", "60",
		"-sc_threshold", "0",

		// Audio output.
		"-c:a", "aac",
		"-b:a", "160k",
		"-ar", "48000",
		"-ac", "2",

		// RTMP/FLV output.
		"-f", "flv",
		"-flvflags", "no_duration_filesize",
		"-rtmp_live", "live",
		rtmpURL,
	}

	log.Printf("[RTMP] FFmpeg command: %s %v", ffmpegPath, args)

	cmd := exec.Command(ffmpegPath, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		if logFile != nil {
			logFile.Close()
		}
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = io.MultiWriter(os.Stderr, logFile)
	} else {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}

	if err := cmd.Start(); err != nil {
		stdin.Close()
		if logFile != nil {
			logFile.Close()
		}
		return fmt.Errorf("failed to start FFmpeg: %w", err)
	}

	r.streams[destinationID] = cmd
	r.inputs[destinationID] = stdin

	go r.monitorFFmpeg(destinationID, cmd)

	log.Printf("[RTMP] ✅ Stream started for destination %d (PID: %d)", destinationID, cmd.Process.Pid)

	return nil
}
func (r *RTMPStreamer) buildRTMPURL(serverURL, streamKey string) string {
	serverURL = strings.TrimSuffix(serverURL, "/")

	// Log for debugging
	log.Printf("[RTMP] Building URL - Server: %s, Key: %s", serverURL, streamKey)

	// YouTube Live
	if strings.Contains(serverURL, "youtube.com") {
		if !strings.HasSuffix(serverURL, "/live2") && !strings.HasSuffix(serverURL, "/live") {
			if strings.Contains(serverURL, "rtmp.youtube.com") {
				serverURL = serverURL + "/live2"
			}
		}
		result := serverURL + "/" + streamKey
		log.Printf("[RTMP] YouTube URL: %s", result)
		return result
	}

	// Facebook Live - NEEDS A SLASH between serverURL and streamKey
	if strings.Contains(serverURL, "facebook.com") || strings.Contains(serverURL, "fbcdn") {
		// Add the slash!
		result := serverURL + "/" + streamKey
		log.Printf("[RTMP] Facebook URL: %s", result)
		return result
	}

	// Twitch
	if strings.Contains(serverURL, "twitch.tv") {
		result := serverURL + "/" + streamKey
		log.Printf("[RTMP] Twitch URL: %s", result)
		return result
	}

	// Custom RTMP
	result := serverURL + "/" + streamKey
	log.Printf("[RTMP] Custom URL: %s", result)
	return result
}

func (r *RTMPStreamer) findFFmpegPath() string {
	paths := []string{
		"ffmpeg",
		"/usr/local/bin/ffmpeg",
		"/usr/bin/ffmpeg",
		"C:\\ffmpeg\\bin\\ffmpeg.exe",
		os.ExpandEnv("${LOCALAPPDATA}\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe"),
	}

	for _, path := range paths {
		if _, err := exec.LookPath(path); err == nil {
			return path
		}
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

func (r *RTMPStreamer) monitorFFmpeg(destinationID uint, cmd *exec.Cmd) {
	err := cmd.Wait()

	r.mu.Lock()
	defer r.mu.Unlock()

	if err != nil {
		log.Printf("[RTMP] ❌ FFmpeg for destination %d exited with error: %v", destinationID, err)
	} else {
		log.Printf("[RTMP] FFmpeg for destination %d exited normally", destinationID)
	}

	delete(r.streams, destinationID)
	delete(r.inputs, destinationID)

	if logFile, exists := r.logFiles[destinationID]; exists {
		logFile.Close()
		delete(r.logFiles, destinationID)
	}
}

func (r *RTMPStreamer) WriteChunkToDestination(destinationID uint, data []byte) error {
	if len(data) == 0 {
		return nil
	}

	r.mu.RLock()
	input, exists := r.inputs[destinationID]
	r.mu.RUnlock()

	if !exists {
		log.Printf("[RTMP] No active stream input for destination %d; dropping %d-byte chunk", destinationID, len(data))
		return nil
	}

	_, err := input.Write(data)
	if err != nil {
		log.Printf("[RTMP] Error writing to destination %d: %v", destinationID, err)
	}
	return err
}

func (r *RTMPStreamer) WriteChunk(data []byte) error {
	if len(data) == 0 {
		return nil
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	if len(r.inputs) == 0 {
		// No active FFmpeg process yet — silently drop the chunk rather than
		// returning an error that would close the WebSocket connection.
		log.Printf("[RTMP] No active stream input; dropping %d-byte chunk", len(data))
		return nil
	}

	var lastErr error
	successCount := 0

	for destID, input := range r.inputs {
		_, err := input.Write(data)
		if err != nil {
			log.Printf("[RTMP] Error writing to destination %d: %v", destID, err)
			lastErr = err
		} else {
			successCount++
		}
	}

	if successCount > 0 && successCount < len(r.inputs) {
		log.Printf("[RTMP] ⚠️ Partial write: %d/%d destinations", successCount, len(r.inputs))
	} else if successCount == len(r.inputs) && successCount > 0 {
		// Only log occasionally to avoid spam
	}

	return lastErr
}

func (r *RTMPStreamer) StopStream(destinationID uint) {
	r.mu.Lock()
	defer r.mu.Unlock()

	log.Printf("[RTMP] Stopping stream for destination %d", destinationID)

	if stdin, exists := r.inputs[destinationID]; exists {
		stdin.Close()
		delete(r.inputs, destinationID)
	}

	if cmd, exists := r.streams[destinationID]; exists {
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		delete(r.streams, destinationID)
	}

	if logFile, exists := r.logFiles[destinationID]; exists {
		logFile.Close()
		delete(r.logFiles, destinationID)
	}
}

func (r *RTMPStreamer) StopAll() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for id := range r.streams {
		if stdin, exists := r.inputs[id]; exists {
			stdin.Close()
		}
		if cmd, exists := r.streams[id]; exists {
			cmd.Process.Kill()
		}
	}

	r.streams = make(map[uint]*exec.Cmd)
	r.inputs = make(map[uint]io.WriteCloser)
	for _, f := range r.logFiles {
		f.Close()
	}
	r.logFiles = make(map[uint]*os.File)
}
