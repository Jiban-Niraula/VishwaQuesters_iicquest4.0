package handlers

import (
	"net/http"
	"time"

	"server/internal/config"
	"server/internal/services"

	"github.com/gin-gonic/gin"
)

// GetSubscription returns the authenticated creator's current subscription
func GetSubscription(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	sub, err := getOrCreateSubscription(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get subscription"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":         sub.Plan,
		"status":       sub.Status,
		"startedAt":    sub.StartedAt,
		"expiresAt":    sub.ExpiresAt,
		"maxCameras":   services.MaxCamerasForPlan(sub.Plan),
		"canUploadAds": sub.Plan == "pro",
	})
}

// UpgradeSubscription upgrades a creator from free to pro
func UpgradeSubscription(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	role, _ := getUserRole(c)
	if role != "creator" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only creators can have subscriptions"})
		return
	}

	sub, err := getOrCreateSubscription(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get subscription"})
		return
	}

	if sub.Plan == "pro" && sub.Status == "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Already on Pro plan"})
		return
	}

	wallet, err := getOrCreateWallet(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get wallet"})
		return
	}

	price := config.ProSubscriptionPrice
	if wallet.Balance < price {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error":          "Insufficient wallet balance",
			"required":       price,
			"currentBalance": wallet.Balance,
			"currency":       wallet.Currency,
		})
		return
	}

	if err := debitWallet(wallet.ID, price, "subscription", "Pro subscription upgrade", "Subscription", 0); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment failed"})
		return
	}

	now := time.Now()
	expiresAt := now.AddDate(0, 1, 0)
	sub.Plan = "pro"
	sub.Status = "active"
	sub.StartedAt = now
	sub.ExpiresAt = &expiresAt
	db.Save(sub)

	c.JSON(http.StatusOK, gin.H{
		"message":    "Upgraded to Pro successfully",
		"plan":       "pro",
		"status":     "active",
		"startedAt":  now,
		"expiresAt":  expiresAt,
		"maxCameras": -1,
	})
}
