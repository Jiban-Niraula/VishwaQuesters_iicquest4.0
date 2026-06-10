package webrtc

import (
	"fmt"
	"log"
	"net/http"
	"server/internal/config"
	"server/internal/services"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/websocket"
)

// Use existing upgrader but ensure it has proper settings
// We'll use a separate upgrader for stream to avoid conflicts

var streamUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for testing
	},
	// MediaRecorder sends chunks every second; at 4.5 Mbps video + 128 kbps audio
	// a 1-second chunk can be ~600 KB. Use 4 MB buffers to avoid ECONNRESET.
	ReadBufferSize:  4 * 1024 * 1024, // 4 MB
	WriteBufferSize: 4 * 1024 * 1024, // 4 MB
}

type StreamWSClient struct {
	ID            string
	Conn          *websocket.Conn
	DestinationID uint
	Send          chan []byte
}

var (
	streamClients   = make(map[*StreamWSClient]bool)
	streamClientsMu sync.RWMutex
)

// HandleStreamWebSocket handles WebSocket connections for streaming video data
func HandleStreamWebSocket(rtmpService *services.RTMPStreamer) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Authenticate user
		tokenString := c.Query("token")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token required"})
			return
		}

		// Parse JWT token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return config.JWTSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			return
		}

		// Get destination ID
		destIDStr := c.Query("dest_id")
		if destIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dest_id required"})
			return
		}

		var destID uint
		_, err = fmt.Sscanf(destIDStr, "%d", &destID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid dest_id"})
			return
		}

		// Upgrade connection
		conn, err := streamUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		client := &StreamWSClient{
			ID:            fmt.Sprintf("stream_%d_%d", destID, time.Now().Unix()),
			Conn:          conn,
			DestinationID: destID,
			Send:          make(chan []byte, 256),
		}

		streamClientsMu.Lock()
		streamClients[client] = true
		streamClientsMu.Unlock()

		defer func() {
			streamClientsMu.Lock()
			delete(streamClients, client)
			streamClientsMu.Unlock()
			close(client.Send)
		}()

		log.Printf("Stream WebSocket connected for destination %d", destID)

		// Read messages and write to FFmpeg
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Stream WebSocket read error: %v", err)
				break
			}

			log.Printf("Received stream chunk: %d bytes for destination %d", len(message), destID)

			// Write directly to FFmpeg stdin
			if err := rtmpService.WriteChunk(message); err != nil {
				log.Printf("Failed to write chunk: %v", err)
			}
		}
	}
}
