package handlers

import (
	"net/http"

	"server/internal/models"

	"github.com/gin-gonic/gin"
)

func CreateOverlay(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var input struct {
		Name    string `json:"name" binding:"required"`
		Type    string `json:"type" binding:"required"`
		Content string `json:"content" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	overlay := models.Overlay{
		UserID:  userID,
		Name:    input.Name,
		Type:    input.Type,
		Content: input.Content,
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

	var overlays []models.Overlay
	db.Where("user_id = ?", userID).Order("created_at DESC").Find(&overlays)

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
	if err := db.Where("id = ? AND user_id = ?", overlayID, userID).First(&overlay).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Overlay not found"})
		return
	}

	var input struct {
		Name    *string `json:"name"`
		Type    *string `json:"type"`
		Content *string `json:"content"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if input.Name != nil {
		updates["name"] = *input.Name
	}
	if input.Type != nil {
		updates["type"] = *input.Type
	}
	if input.Content != nil {
		updates["content"] = *input.Content
	}

	db.Model(&overlay).Updates(updates)
	db.Where("id = ?", overlayID).First(&overlay)

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
	if err := db.Where("id = ? AND user_id = ?", overlayID, userID).First(&overlay).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Overlay not found"})
		return
	}

	db.Delete(&overlay)
	c.JSON(http.StatusOK, gin.H{"message": "Overlay deleted"})
}
