package handlers

import (
    "crypto/rand"
    "encoding/hex"
    "net/http"
    "strings"

    "server/internal/models"
    "server/internal/services"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

func generateUniqueCode() string {
    b := make([]byte, 5)
    rand.Read(b)
    code := strings.ToUpper(hex.EncodeToString(b)[:5])
    return code[:2] + "-" + code[2:]
}

func CreateEvent(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, ok := getUserID(c)
        if !ok {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
            return
        }

        role, _ := getUserRole(c)
        if role != "creator" {
            c.JSON(http.StatusForbidden, gin.H{"error": "Only creators can create events"})
            return
        }

        var req struct {
            Title       string `json:"title" binding:"required"`
            Description string `json:"description"`
        }

        if err := c.ShouldBindJSON(&req); err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
            return
        }

        event := models.Event{
            CreatorID:   userID,
            Title:       req.Title,
            Description: req.Description,
            Code:        generateUniqueCode(),
            IsLive:      false,
        }

        if err := db.Create(&event).Error; err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
            return
        }

        c.JSON(http.StatusCreated, event)
    }
}

func ListEvents(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, ok := getUserID(c)
        if !ok {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
            return
        }

        var events []models.Event
        db.Where("creator_id = ?", userID).Order("created_at DESC").Find(&events)

        c.JSON(http.StatusOK, events)
    }
}

func GetEvent(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, ok := getUserID(c)
        if !ok {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
            return
        }

        eventID, ok := parseUintParam(c, "id")
        if !ok {
            c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
            return
        }

        var event models.Event
        if err := db.Preload("Destinations").Preload("AdPlacements").Where("id = ? AND creator_id = ?", eventID, userID).First(&event).Error; err != nil {
            c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
            return
        }

        // Include camera limit info
        plan := getCreatorPlan(userID)

        c.JSON(http.StatusOK, gin.H{
            "event":        event,
            "cameraLimit":  services.MaxCamerasForPlan(plan),
            "creatorPlan":  plan,
        })
    }
}

func UpdateEvent(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, ok := getUserID(c)
        if !ok {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
            return
        }

        eventID, ok := parseUintParam(c, "id")
        if !ok {
            c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
            return
        }

        var event models.Event
        if err := db.Where("id = ? AND creator_id = ?", eventID, userID).First(&event).Error; err != nil {
            c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
            return
        }

        var input struct {
            Title       *string `json:"title"`
            Description *string `json:"description"`
            IsLive      *bool   `json:"is_live"`
            CameraCount *int    `json:"camera_count"`
            ViewerCount *int    `json:"viewer_count"`
        }

        if err := c.ShouldBindJSON(&input); err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
            return
        }

        updates := map[string]interface{}{}

        if input.Title != nil {
            updates["title"] = *input.Title
        }
        if input.Description != nil {
            updates["description"] = *input.Description
        }
        if input.IsLive != nil {
            updates["is_live"] = *input.IsLive
        }

        // Camera count — enforce limit
        if input.CameraCount != nil {
            plan := getCreatorPlan(userID)
            if !services.CanConnectCamera(plan, *input.CameraCount) {
                c.JSON(http.StatusForbidden, gin.H{
                    "error":          "Camera limit reached. Upgrade to Pro for unlimited cameras.",
                    "currentCameras": event.CameraCount,
                    "requested":      *input.CameraCount,
                    "maxCameras":     services.MaxCamerasForPlan(plan),
                    "plan":           plan,
                })
                return
            }
            updates["camera_count"] = *input.CameraCount
        }

        if input.ViewerCount != nil {
            updates["viewer_count"] = *input.ViewerCount
        }

        db.Model(&event).Updates(updates)
        db.Where("id = ?", eventID).First(&event)

        c.JSON(http.StatusOK, event)
    }
}

func DeleteEvent(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, ok := getUserID(c)
        if !ok {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
            return
        }

        eventID, ok := parseUintParam(c, "id")
        if !ok {
            c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
            return
        }

        var event models.Event
        if err := db.Where("id = ? AND creator_id = ?", eventID, userID).First(&event).Error; err != nil {
            c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
            return
        }

        db.Delete(&event)
        c.JSON(http.StatusOK, gin.H{"message": "Event deleted"})
    }
}

// GetPublicEvent — no auth required, for viewers
func GetPublicEvent(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        code := c.Param("code")
        var event models.Event
        if err := db.Where("code = ?", code).First(&event).Error; err != nil {
            c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
            return
        }
        c.JSON(http.StatusOK, event)
    }
}