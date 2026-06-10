package webrtc

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"server/internal/config"
	"server/internal/models"
	"server/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v4"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

var streamUpgrader = websocket.Upgrader{
	CheckOrigin:     func(r *http.Request) bool { return true },
	ReadBufferSize:  4 * 1024 * 1024,
	WriteBufferSize: 4 * 1024 * 1024,
}

func HandleStreamWebSocket(db *gorm.DB, rtmpService *services.RTMPStreamer) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := userIDFromQueryToken(c.Query("token"))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		var destID uint
		if _, err := fmt.Sscanf(c.Query("dest_id"), "%d", &destID); err != nil || destID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "valid dest_id required"})
			return
		}

		var dest models.StreamDestination
		if err := db.Preload("Event").First(&dest, destID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "destination not found"})
			return
		}
		if dest.Event == nil || dest.Event.CreatorID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "destination not owned by you"})
			return
		}

		conn, err := streamUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("Stream WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		log.Printf("Stream WebSocket connected for user %d destination %d", userID, destID)
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Stream WebSocket closed: %v", err)
				break
			}
			if err := rtmpService.WriteChunkToDestination(destID, message); err != nil {
				log.Printf("Failed to write chunk to destination %d: %v", destID, err)
			}
		}
	}
}

func userIDFromQueryToken(tokenString string) (uint, error) {
	if tokenString == "" {
		return 0, fmt.Errorf("token required")
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return config.JWTSecret, nil
	})
	if err != nil || !token.Valid {
		return 0, fmt.Errorf("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, fmt.Errorf("invalid token claims")
	}

	exp, _ := claims["exp"].(float64)
	if exp > 0 && int64(exp) < time.Now().Unix() {
		return 0, fmt.Errorf("token expired")
	}

	userIDFloat, ok := claims["userID"].(float64)
	if !ok {
		return 0, fmt.Errorf("invalid userID in token")
	}
	return uint(userIDFloat), nil
}
