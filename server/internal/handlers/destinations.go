package handlers

import (
	"net/http"
	"server/internal/models"

	"github.com/gin-gonic/gin"
)

func AddDestination(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var input struct {
		EventID   uint   `json:"event_id"`
		Platform  string `json:"platform" binding:"required"`
		StreamKey string `json:"stream_key" binding:"required"`
		ServerURL string `json:"server_url"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify ownership
	var event models.Event
	if err := db.Where("id = ? AND user_id = ?", input.EventID, userID).First(&event).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Event not found or not owned by you"})
		return
	}

	// Default server URLs based on platform
	// NOTE: URLs must end with "/" so that appending the stream key is correct
	serverURL := input.ServerURL
	if serverURL == "" {
		switch input.Platform {
		case "youtube":
			serverURL = "rtmp://a.rtmp.youtube.com/live2/"
		case "facebook":
			serverURL = "rtmps://live-api-s.facebook.com:443/rtmp/"
		case "twitch":
			serverURL = "rtmp://live.twitch.tv/app/"
		}
	}

	dest := models.StreamDestination{
		EventID:   input.EventID,
		Platform:  input.Platform,
		StreamKey: input.StreamKey,
		ServerURL: serverURL,
		IsActive:  false,
	}

	if err := db.Create(&dest).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add destination"})
		return
	}

	c.JSON(http.StatusCreated, dest)
}

func ListDestinations(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	eventID, ok := parseUintQuery(c, "event_id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_id query parameter required"})
		return
	}

	var event models.Event
	if err := db.Where("id = ? AND user_id = ?", eventID, userID).First(&event).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Event not found"})
		return
	}

	var dests []models.StreamDestination
	db.Where("event_id = ?", eventID).Find(&dests)

	c.JSON(http.StatusOK, dests)
}

func UpdateDestination(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	destID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid destination ID"})
		return
	}

	var dest models.StreamDestination
	if err := db.First(&dest, destID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Destination not found"})
		return
	}

	var event models.Event
	if err := db.Where("id = ? AND user_id = ?", dest.EventID, userID).First(&event).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}

	var input struct {
		StreamKey *string `json:"stream_key"`
		ServerURL *string `json:"server_url"`
		IsActive  *bool   `json:"is_active"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if input.StreamKey != nil {
		updates["stream_key"] = *input.StreamKey
	}
	if input.ServerURL != nil {
		updates["server_url"] = *input.ServerURL
	}
	if input.IsActive != nil {
		updates["is_active"] = *input.IsActive
	}

	db.Model(&dest).Updates(updates)
	db.First(&dest, destID)

	c.JSON(http.StatusOK, dest)
}

func DeleteDestination(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	destID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid destination ID"})
		return
	}

	var dest models.StreamDestination
	if err := db.First(&dest, destID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Destination not found"})
		return
	}

	var event models.Event
	if err := db.Where("id = ? AND user_id = ?", dest.EventID, userID).First(&event).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}

	db.Delete(&dest)
	c.JSON(http.StatusOK, gin.H{"message": "Destination deleted"})
}
