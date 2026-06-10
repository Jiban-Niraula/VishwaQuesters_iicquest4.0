package handlers

import (
	"net/http"

	"server/internal/models"
	"server/internal/services"

	"github.com/gin-gonic/gin"
)

func StartStream(rtmpService *services.RTMPStreamer) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := getUserID(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		var input struct {
			DestinationID uint `json:"destination_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var dest models.StreamDestination
		if err := db.Preload("Event").First(&dest, input.DestinationID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Destination not found"})
			return
		}
		if dest.Event == nil || dest.Event.CreatorID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Destination not owned by you"})
			return
		}

		if err := rtmpService.StartStream(dest.ID, dest.ServerURL, dest.StreamKey); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		db.Model(&dest).Update("is_active", true)
		c.JSON(http.StatusOK, gin.H{"message": "Stream destination started", "destinationId": dest.ID})
	}
}

func StopStream(rtmpService *services.RTMPStreamer) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, ok := getUserID(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		var input struct {
			DestinationID uint `json:"destination_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var dest models.StreamDestination
		if err := db.Preload("Event").First(&dest, input.DestinationID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Destination not found"})
			return
		}
		if dest.Event == nil || dest.Event.CreatorID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Destination not owned by you"})
			return
		}

		rtmpService.StopStream(dest.ID)
		db.Model(&dest).Update("is_active", false)
		c.JSON(http.StatusOK, gin.H{"message": "Stream destination stopped", "destinationId": dest.ID})
	}
}
