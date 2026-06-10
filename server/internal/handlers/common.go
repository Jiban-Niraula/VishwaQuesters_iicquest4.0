package handlers

import (
	"strconv"
	"time"

	"server/internal/config"
	"server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var db *gorm.DB

func SetDB(database *gorm.DB) {
	db = database
}

func getUserID(c *gin.Context) (uint, bool) {
	val, exists := c.Get("userID")
	if !exists {
		return 0, false
	}

	switch v := val.(type) {
	case uint:
		return v, true
	case float64:
		return uint(v), true
	case int:
		return uint(v), true
	case string:
		parsed, err := strconv.ParseUint(v, 10, 64)
		if err != nil {
			return 0, false
		}
		return uint(parsed), true
	default:
		return 0, false
	}
}

func getUserRole(c *gin.Context) (string, bool) {
	val, exists := c.Get("userRole")
	if !exists {
		return "", false
	}
	role, ok := val.(string)
	return role, ok
}

func parseUintParam(c *gin.Context, param string) (uint, bool) {
	parsed, err := strconv.ParseUint(c.Param(param), 10, 64)
	if err != nil {
		return 0, false
	}
	return uint(parsed), true
}

func parseUintQuery(c *gin.Context, param string) (uint, bool) {
	val := c.Query(param)
	if val == "" {
		return 0, false
	}
	parsed, err := strconv.ParseUint(val, 10, 64)
	if err != nil {
		return 0, false
	}
	return uint(parsed), true
}

func getOrCreateWallet(userID uint) (*models.Wallet, error) {
	return getOrCreateWalletWithDB(db, userID)
}

func getOrCreateWalletWithDB(tx *gorm.DB, userID uint) (*models.Wallet, error) {
	var wallet models.Wallet
	err := tx.Where("user_id = ?", userID).First(&wallet).Error
	if err == gorm.ErrRecordNotFound {
		wallet = models.Wallet{
			UserID:   userID,
			Balance:  0,
			Currency: config.Env("WALLET_CURRENCY", "NRS"),
		}
		if err := tx.Create(&wallet).Error; err != nil {
			return nil, err
		}
		return &wallet, nil
	}
	if err != nil {
		return nil, err
	}
	return &wallet, nil
}

func getOrCreateSubscription(userID uint) (*models.Subscription, error) {
	var sub models.Subscription
	err := db.Where("user_id = ?", userID).First(&sub).Error
	if err == gorm.ErrRecordNotFound {
		sub = models.Subscription{
			UserID:    userID,
			Plan:      "free",
			Status:    "active",
			StartedAt: time.Now(),
		}
		if err := db.Create(&sub).Error; err != nil {
			return nil, err
		}
		return &sub, nil
	}
	if err != nil {
		return nil, err
	}
	return &sub, nil
}
