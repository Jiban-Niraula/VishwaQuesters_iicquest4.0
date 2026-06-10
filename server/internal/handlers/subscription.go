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

	settings, err := services.GetPlatformSettings(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load platform settings"})
		return
	}

	plan := services.GetCreatorPlan(db, userID)
	c.JSON(http.StatusOK, gin.H{
		"plan":              plan,
		"status":            sub.Status,
		"startedAt":         sub.StartedAt,
		"expiresAt":         sub.ExpiresAt,
		"maxCameras":        services.MaxCamerasForPlan(db, plan),
		"canUploadAds":      plan == "pro",
		"currency":          settings.Currency,
		"proPrice":          settings.ProSubscriptionPrice,
		"billingPeriod":     "month",
		"walletUpgradePath": "/api/subscription/upgrade",
		"directPaymentPath": "/api/subscription/checkout/esewa",
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
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error":          "Insufficient wallet balance",
			"required":       price,
			"currentBalance": wallet.Balance,
			"currency":       wallet.Currency,
		})
		return
	}

	now := time.Now()
	var expiresAt time.Time

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := debitWalletWithDB(tx, wallet.ID, price, "subscription", "Pro subscription upgrade from wallet", "Subscription", 0); err != nil {
			return err
		}

		var adminUser models.User
		if err := tx.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
			adminWallet, err := getOrCreateWalletWithDB(tx, adminUser.ID)
			if err != nil {
				return err
			}
			if err := creditWalletWithDB(tx, adminWallet.ID, price, "subscription", "Creator Pro subscription from wallet", "Subscription", 0); err != nil {
				return err
			}
		}

		var activateErr error
		expiresAt, activateErr = activateProSubscriptionWithDB(tx, userID, now)
		return activateErr
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Upgraded to Pro successfully",
		"plan":       "pro",
		"status":     "active",
		"startedAt":  now,
		"expiresAt":  expiresAt,
		"maxCameras": -1,
		"price":      price,
		"currency":   settings.Currency,
	})
}

func activateProSubscriptionWithDB(tx *gorm.DB, userID uint, startedAt time.Time) (time.Time, error) {
	expiresAt := startedAt.AddDate(0, 1, 0)

	var existing models.Subscription
	err := tx.Where("user_id = ?", userID).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		existing = models.Subscription{UserID: userID}
	} else if err != nil {
		return time.Time{}, err
	}

	if existing.Plan == "pro" && existing.Status == "active" && existing.ExpiresAt != nil && existing.ExpiresAt.After(startedAt) {
		expiresAt = existing.ExpiresAt.AddDate(0, 1, 0)
	}

	existing.Plan = "pro"
	existing.Status = "active"
	existing.StartedAt = startedAt
	existing.ExpiresAt = &expiresAt

	if err := tx.Save(&existing).Error; err != nil {
		return time.Time{}, err
	}

	return expiresAt, nil
}
