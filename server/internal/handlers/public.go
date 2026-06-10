package handlers

import (
	"net/http"

	"server/internal/services"

	"github.com/gin-gonic/gin"
)

func GetPublicPricing(c *gin.Context) {
	settings, err := services.GetPlatformSettings(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load pricing"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"currency":             settings.Currency,
		"proSubscriptionPrice": settings.ProSubscriptionPrice,
		"freeCameraLimit":      settings.FreeCameraLimit,
		"billingPeriod":        "month",
	})
}
