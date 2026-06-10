package handlers

import (
    "strconv"

    "server/internal/models"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

var db *gorm.DB

func SetDB(database *gorm.DB) {
    db = database
}

// getUserID extracts uint userID from Gin context (set by AuthMiddleware)
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

// getUserRole extracts the user's role from context (set by AuthMiddleware)
func getUserRole(c *gin.Context) (string, bool) {
    val, exists := c.Get("userRole")
    if !exists {
        return "", false
    }
    role, ok := val.(string)
    return role, ok
}

// getOrCreateWallet returns the user's wallet, creating one if it doesn't exist
func getOrCreateWallet(userID uint) (*models.Wallet, error) {
    var wallet models.Wallet
    err := db.Where("user_id = ?", userID).First(&wallet).Error
    if err == gorm.ErrRecordNotFound {
        wallet = models.Wallet{
            UserID:   userID,
            Balance:  0,
            Currency: "NRS",
        }
        if err := db.Create(&wallet).Error; err != nil {
            return nil, err
        }
        return &wallet, nil
    }
    if err != nil {
        return nil, err
    }
    return &wallet, nil
}

// getOrCreateSubscription returns the user's subscription, creating free if doesn't exist
func getOrCreateSubscription(userID uint) (*models.Subscription, error) {
    var sub models.Subscription
    err := db.Where("user_id = ?", userID).First(&sub).Error
    if err == gorm.ErrRecordNotFound {
        sub = models.Subscription{
            UserID:    userID,
            Plan:      "free",
            Status:    "active",
            StartedAt: models.Subscription{}.StartedAt, // will be set by DB default
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

// isPro checks if a user has an active pro subscription
func isPro(userID uint) bool {
    var sub models.Subscription
    if err := db.Where("user_id = ? AND status = ?", userID, "active").First(&sub).Error; err != nil {
        return false
    }
    return sub.Plan == "pro"
}

// getCreatorPlan returns "pro" or "free" for a user
func getCreatorPlan(userID uint) string {
    if isPro(userID) {
        return "pro"
    }
    return "free"
}