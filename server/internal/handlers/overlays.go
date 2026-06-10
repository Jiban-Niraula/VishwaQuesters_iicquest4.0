package handlers

import (
<<<<<<< HEAD
	"net/http"
=======
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3

	"server/internal/models"

	"github.com/gin-gonic/gin"
)

<<<<<<< HEAD
=======
var allowedOverlayTypes = map[string]bool{
	"text": true, "image": true, "video": true, "scoreboard": true, "timer": true,
	"lower_third": true, "logo": true, "banner": true, "sponsored_ad": true,
	// Backwards-compatible V1 studio overlay types:
	"football-scorecard": true, "cricket-scorecard": true, "ad": true, "replay": true, "video-link": true,
}

>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
func CreateOverlay(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

<<<<<<< HEAD
	var input struct {
		Name    string `json:"name" binding:"required"`
		Type    string `json:"type" binding:"required"`
		Content string `json:"content" binding:"required"`
	}

=======
	var input overlayInput
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

<<<<<<< HEAD
	overlay := models.Overlay{
		UserID:  userID,
		Name:    input.Name,
		Type:    input.Type,
		Content: input.Content,
=======
	title := firstNonEmptyString(input.Title, input.Name, "Untitled overlay")
	typeName := strings.TrimSpace(input.Type)
	if typeName == "" {
		typeName = "text"
	}
	if !allowedOverlayTypes[typeName] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported overlay type"})
		return
	}

	if input.EventID != nil {
		if !creatorOwnsEvent(*input.EventID, userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Event not found or not owned by you"})
			return
		}
	}

	if input.AdID != nil && typeName != "sponsored_ad" {
		typeName = "sponsored_ad"
	}

	overlay := models.Overlay{
		CreatorID: userID,
		EventID:   input.EventID,
		AdID:      input.AdID,
		Title:     title,
		Type:      typeName,
		Content:   input.Content,
		MediaURL:  normalizePath(input.MediaURL),
		Position:  firstNonEmptyString(input.Position, "top-right"),
		Duration:  input.Duration,
		X:         valueOr(input.X, 0),
		Y:         valueOr(input.Y, 0),
		Width:     valueOr(input.Width, 360),
		Height:    valueOr(input.Height, 120),
		Opacity:   valueOr(input.Opacity, 1),
		ZIndex:    intValueOr(input.ZIndex, 1),
		StyleJSON: input.StyleJSON,
		DataJSON:  input.DataJSON,
		IsActive:  input.IsActive,
		IsGlobal:  input.IsGlobal,
	}

	if overlay.IsActive {
		now := time.Now()
		overlay.StartedAt = &now
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
	}

	if err := db.Create(&overlay).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create overlay"})
		return
	}

	c.JSON(http.StatusCreated, overlay)
}

func ListOverlays(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

<<<<<<< HEAD
	var overlays []models.Overlay
	db.Where("user_id = ?", userID).Order("created_at DESC").Find(&overlays)
=======
	query := db.Where("creator_id = ?", userID)

	if eventID, ok := parseUintQuery(c, "event_id"); ok {
		if !creatorOwnsEvent(eventID, userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Event not found or not owned by you"})
			return
		}
		query = query.Where("event_id = ? OR is_global = ?", eventID, true)
	}

	var overlays []models.Overlay
	if err := query.Order("is_active DESC, z_index ASC, created_at DESC").Find(&overlays).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list overlays"})
		return
	}

	c.JSON(http.StatusOK, overlays)
}

func ListOverlayLibrary(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var overlays []models.Overlay
	if err := db.Where("creator_id = ? AND is_global = ?", userID, true).Order("created_at DESC").Find(&overlays).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list overlay library"})
		return
	}
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3

	c.JSON(http.StatusOK, overlays)
}

func UpdateOverlay(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	overlayID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid overlay ID"})
		return
	}

	var overlay models.Overlay
<<<<<<< HEAD
	if err := db.Where("id = ? AND user_id = ?", overlayID, userID).First(&overlay).Error; err != nil {
=======
	if err := db.Where("id = ? AND creator_id = ?", overlayID, userID).First(&overlay).Error; err != nil {
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
		c.JSON(http.StatusNotFound, gin.H{"error": "Overlay not found"})
		return
	}

<<<<<<< HEAD
	var input struct {
		Name    *string `json:"name"`
		Type    *string `json:"type"`
		Content *string `json:"content"`
	}

=======
	var input overlayUpdateInput
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
<<<<<<< HEAD
	if input.Name != nil {
		updates["name"] = *input.Name
	}
	if input.Type != nil {
=======
	if input.Title != nil {
		updates["title"] = strings.TrimSpace(*input.Title)
	}
	if input.Name != nil && input.Title == nil {
		updates["title"] = strings.TrimSpace(*input.Name)
	}
	if input.Type != nil {
		if !allowedOverlayTypes[*input.Type] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported overlay type"})
			return
		}
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
		updates["type"] = *input.Type
	}
	if input.Content != nil {
		updates["content"] = *input.Content
	}
<<<<<<< HEAD

	db.Model(&overlay).Updates(updates)
	db.Where("id = ?", overlayID).First(&overlay)

=======
	if input.MediaURL != nil {
		updates["media_url"] = normalizePath(*input.MediaURL)
	}
	if input.Position != nil {
		updates["position"] = *input.Position
	}
	if input.Duration != nil {
		updates["duration"] = *input.Duration
	}
	if input.X != nil {
		updates["x"] = *input.X
	}
	if input.Y != nil {
		updates["y"] = *input.Y
	}
	if input.Width != nil {
		updates["width"] = *input.Width
	}
	if input.Height != nil {
		updates["height"] = *input.Height
	}
	if input.Opacity != nil {
		updates["opacity"] = *input.Opacity
	}
	if input.ZIndex != nil {
		updates["z_index"] = *input.ZIndex
	}
	if input.StyleJSON != nil {
		updates["style_json"] = *input.StyleJSON
	}
	if input.DataJSON != nil {
		updates["data_json"] = *input.DataJSON
	}
	if input.IsGlobal != nil {
		updates["is_global"] = *input.IsGlobal
	}
	if input.IsActive != nil {
		updates["is_active"] = *input.IsActive
		now := time.Now()
		if *input.IsActive {
			updates["started_at"] = &now
		} else {
			updates["ended_at"] = &now
		}
	}

	if input.EventID != nil {
		if !creatorOwnsEvent(*input.EventID, userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Event not found or not owned by you"})
			return
		}
		updates["event_id"] = *input.EventID
	}
	if input.AdID != nil {
		updates["ad_id"] = *input.AdID
	}

	if len(updates) > 0 {
		if err := db.Model(&overlay).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update overlay"})
			return
		}
	}

	db.First(&overlay, overlayID)
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
	c.JSON(http.StatusOK, overlay)
}

func DeleteOverlay(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	overlayID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid overlay ID"})
		return
	}

	var overlay models.Overlay
<<<<<<< HEAD
	if err := db.Where("id = ? AND user_id = ?", overlayID, userID).First(&overlay).Error; err != nil {
=======
	if err := db.Where("id = ? AND creator_id = ?", overlayID, userID).First(&overlay).Error; err != nil {
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
		c.JSON(http.StatusNotFound, gin.H{"error": "Overlay not found"})
		return
	}

	db.Delete(&overlay)
	c.JSON(http.StatusOK, gin.H{"message": "Overlay deleted"})
}
<<<<<<< HEAD
=======

func ActivateOverlay(c *gin.Context)   { setOverlayActive(c, true) }
func DeactivateOverlay(c *gin.Context) { setOverlayActive(c, false) }

func UploadOverlayMedia(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	contentType := file.Header.Get("Content-Type")
	if !(strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "video/")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only image and video overlay media are allowed"})
		return
	}
	if file.Size > 150*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Overlay media must be 150MB or less"})
		return
	}

	if rawEventID := strings.TrimSpace(c.PostForm("event_id")); rawEventID != "" {
		var eventID uint
		if _, err := fmt.Sscanf(rawEventID, "%d", &eventID); err != nil || eventID == 0 || !creatorOwnsEvent(eventID, userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Event not found or not owned by you"})
			return
		}
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == "" {
		ext = ".bin"
	}
	safeName := fmt.Sprintf("overlay_%d_%d%s", userID, time.Now().UnixNano(), ext)
	dir := filepath.Join("uploads", "overlays")
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare upload directory"})
		return
	}

	diskPath := filepath.Join(dir, safeName)
	if err := c.SaveUploadedFile(file, diskPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save overlay media"})
		return
	}

	mediaURL := "/uploads/overlays/" + safeName
	mediaType := "image"
	if strings.HasPrefix(contentType, "video/") {
		mediaType = "video"
	}

	c.JSON(http.StatusCreated, gin.H{
		"mediaUrl":    mediaURL,
		"media_url":   mediaURL,
		"type":        mediaType,
		"size":        file.Size,
		"contentType": contentType,
	})
}

type overlayInput struct {
	Name      string   `json:"name"`
	Title     string   `json:"title"`
	Type      string   `json:"type" binding:"required"`
	Content   string   `json:"content"`
	MediaURL  string   `json:"media_url"`
	EventID   *uint    `json:"event_id"`
	AdID      *uint    `json:"ad_id"`
	Position  string   `json:"position"`
	Duration  int      `json:"duration"`
	X         *float64 `json:"x"`
	Y         *float64 `json:"y"`
	Width     *float64 `json:"width"`
	Height    *float64 `json:"height"`
	Opacity   *float64 `json:"opacity"`
	ZIndex    *int     `json:"z_index"`
	StyleJSON string   `json:"style_json"`
	DataJSON  string   `json:"data_json"`
	IsActive  bool     `json:"is_active"`
	IsGlobal  bool     `json:"is_global"`
}

type overlayUpdateInput struct {
	Name      *string  `json:"name"`
	Title     *string  `json:"title"`
	Type      *string  `json:"type"`
	Content   *string  `json:"content"`
	MediaURL  *string  `json:"media_url"`
	EventID   *uint    `json:"event_id"`
	AdID      *uint    `json:"ad_id"`
	Position  *string  `json:"position"`
	Duration  *int     `json:"duration"`
	X         *float64 `json:"x"`
	Y         *float64 `json:"y"`
	Width     *float64 `json:"width"`
	Height    *float64 `json:"height"`
	Opacity   *float64 `json:"opacity"`
	ZIndex    *int     `json:"z_index"`
	StyleJSON *string  `json:"style_json"`
	DataJSON  *string  `json:"data_json"`
	IsActive  *bool    `json:"is_active"`
	IsGlobal  *bool    `json:"is_global"`
}

func setOverlayActive(c *gin.Context, active bool) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	overlayID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid overlay ID"})
		return
	}

	var overlay models.Overlay
	if err := db.Where("id = ? AND creator_id = ?", overlayID, userID).First(&overlay).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Overlay not found"})
		return
	}

	now := time.Now()
	updates := map[string]interface{}{"is_active": active}
	if active {
		updates["started_at"] = &now
	} else {
		updates["ended_at"] = &now
	}
	if err := db.Model(&overlay).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update overlay"})
		return
	}

	db.First(&overlay, overlayID)
	c.JSON(http.StatusOK, overlay)
}

func creatorOwnsEvent(eventID uint, creatorID uint) bool {
	var event models.Event
	return db.Where("id = ? AND creator_id = ?", eventID, creatorID).First(&event).Error == nil
}

func firstNonEmptyString(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func valueOr(v *float64, fallback float64) float64 {
	if v == nil {
		return fallback
	}
	return *v
}

func intValueOr(v *int, fallback int) int {
	if v == nil {
		return fallback
	}
	return *v
}

func normalizePath(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	return strings.ReplaceAll(trimmed, "\\", "/")
}
>>>>>>> 251cf1257b274753a7f4a9b6df11285a503078a3
