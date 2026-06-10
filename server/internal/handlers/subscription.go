package handlers

import (
	"net/http"
	"time"

	"server/internal/models"
	"server/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

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

	plan := services.GetCreatorPlan(db, userID)
	c.JSON(http.StatusOK, gin.H{
		"plan":         plan,
		"status":       sub.Status,
		"startedAt":    sub.StartedAt,
		"expiresAt":    sub.ExpiresAt,
		"maxCameras":   services.MaxCamerasForPlan(db, plan),
		"canUploadAds": plan == "pro",
	})
}

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

	if services.GetCreatorPlan(db, userID) == "pro" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Already on Pro plan"})
		return
	}

	wallet, err := getOrCreateWallet(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get wallet"})
		return
	}

	settings, err := services.GetPlatformSettings(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load platform settings"})
		return
	}

	price := settings.ProSubscriptionPrice
	if wallet.Balance < price {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Insufficient wallet balance", "required": price, "currentBalance": wallet.Balance, "currency": wallet.Currency})
		return
	}

	now := time.Now()
	expiresAt := now.AddDate(0, 1, 0)

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := debitWalletWithDB(tx, wallet.ID, price, "subscription", "Pro subscription upgrade", "Subscription", 0); err != nil {
			return err
		}

		var adminUser models.User
		if err := tx.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
			adminWallet, err := getOrCreateWalletWithDB(tx, adminUser.ID)
			if err != nil {
				return err
			}
			if err := creditWalletWithDB(tx, adminWallet.ID, price, "subscription", "Creator Pro subscription", "Subscription", 0); err != nil {
				return err
			}
		}

		var sub models.Subscription
		err := tx.Where("user_id = ?", userID).First(&sub).Error
		if err == gorm.ErrRecordNotFound {
			sub = models.Subscription{UserID: userID}
		} else if err != nil {
			return err
		}
		sub.Plan = "pro"
		sub.Status = "active"
		sub.StartedAt = now
		sub.ExpiresAt = &expiresAt
		return tx.Save(&sub).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Upgraded to Pro successfully", "plan": "pro", "status": "active", "startedAt": now, "expiresAt": expiresAt, "maxCameras": -1})
}
