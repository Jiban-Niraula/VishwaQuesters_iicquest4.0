package handlers

import (
    "net/http"
    "time"

    "server/internal/models"
    "server/internal/services"

    "github.com/gin-gonic/gin"
)

// ──────────── COMPANY: Create Ad ────────────

func CreateAd(c *gin.Context) {
    userID, ok := getUserID(c)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    role, _ := getUserRole(c)
    if role != "company" {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only companies can create ads"})
        return
    }

    var input struct {
        Title           string `json:"title" binding:"required"`
        Type            string `json:"type" binding:"required,oneof=image video"`
        MediaURL        string `json:"media_url" binding:"required"`
        DurationSeconds int    `json:"duration_seconds"`
        ThumbnailURL    string `json:"thumbnail_url"`
    }

    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Calculate charge
    chargeAmount := services.CalculateAdCharge(input.Type, input.DurationSeconds)
    adminCommission, creatorPayoutPro, creatorPayoutFree := services.CalculateRevenueSplit(chargeAmount)

    // Check company wallet balance
    wallet, err := getOrCreateWallet(userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get wallet"})
        return
    }

    if wallet.Balance < chargeAmount {
        c.JSON(http.StatusPaymentRequired, gin.H{
            "error":          "Insufficient wallet balance",
            "required":       chargeAmount,
            "currentBalance": wallet.Balance,
            "currency":       wallet.Currency,
        })
        return
    }

    // Create ad record
    ad := models.Ad{
        CompanyID:        userID,
        Title:            input.Title,
        Type:             input.Type,
        MediaURL:         input.MediaURL,
        DurationSeconds:  input.DurationSeconds,
        ThumbnailURL:     input.ThumbnailURL,
        Status:           "pending", // admin approves later
        ChargeAmount:     chargeAmount,
        AdminCommission:  adminCommission,
        CreatorPayoutPro: creatorPayoutPro,
        CreatorPayoutFree: creatorPayoutFree,
    }

    if err := db.Create(&ad).Error; err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create ad"})
        return
    }

    // Debit company wallet
    debitWallet(wallet.ID, chargeAmount, "charge", "Ad upload: "+input.Title, "Ad", ad.ID)

    // Credit admin wallet with commission
    var adminUser models.User
    if err := db.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
        adminWallet, _ := getOrCreateWallet(adminUser.ID)
        creditWallet(adminWallet.ID, adminCommission, "commission", "Commission from ad #"+string(rune(ad.ID)), "Ad", ad.ID)
    }

    c.JSON(http.StatusCreated, gin.H{
        "ad":               ad,
        "chargeAmount":     chargeAmount,
        "adminCommission":  adminCommission,
        "creatorPayoutPro": creatorPayoutPro,
        "creatorPayoutFree": creatorPayoutFree,
        "message":          "Ad created. Pending admin approval.",
    })
}

// ──────────── COMPANY: List My Ads ────────────

func ListMyAds(c *gin.Context) {
    userID, ok := getUserID(c)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    var ads []models.Ad
    db.Where("company_id = ?", userID).Order("created_at DESC").Find(&ads)

    c.JSON(http.StatusOK, gin.H{"ads": ads})
}

// ──────────── CREATOR: Browse Ad Marketplace ────────────

func GetAdMarketplace(c *gin.Context) {
    // Only approved ads appear in marketplace
    var ads []models.Ad
    db.Where("status = ?", "approved").Order("created_at DESC").Find(&ads)

    c.JSON(http.StatusOK, gin.H{"ads": ads})
}

// ──────────── CREATOR: Play Sponsored Ad ────────────

func PlayAd(c *gin.Context) {
    userID, ok := getUserID(c)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    role, _ := getUserRole(c)
    if role != "creator" {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only creators can play ads"})
        return
    }

    var input struct {
        AdID    uint `json:"ad_id" binding:"required"`
        EventID uint `json:"event_id"`
    }

    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Get the ad
    var ad models.Ad
    if err := db.First(&ad, input.AdID).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Ad not found"})
        return
    }

    if ad.Status != "approved" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Ad is not approved"})
        return
    }

    // Determine creator's plan
    creatorPlan := getCreatorPlan(userID)
    earnedAmount := services.GetCreatorPayout(ad, creatorPlan)

    // Create ad placement record
    now := time.Now()
    placement := models.AdPlacement{
        AdID:         ad.ID,
        CreatorID:    userID,
        EventID:      input.EventID,
        Status:       "playing",
        EarnedAmount: earnedAmount,
        CreatorTier:  creatorPlan,
        PlayedAt:     &now,
    }

    if err := db.Create(&placement).Error; err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record ad placement"})
        return
    }

    // Credit creator's wallet
    creatorWallet, err := getOrCreateWallet(userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get creator wallet"})
        return
    }

    creditWallet(creatorWallet.ID, earnedAmount, "credit", "Ad playback earning: "+ad.Title, "AdPlacement", placement.ID)

    c.JSON(http.StatusOK, gin.H{
        "placement":     placement,
        "earnedAmount":  earnedAmount,
        "creatorPlan":   creatorPlan,
        "newBalance":    creatorWallet.Balance + earnedAmount,
        "message":       "Ad playing. Earnings credited to your wallet.",
    })
}

// ──────────── CREATOR: Complete Ad Placement ────────────

func CompleteAdPlacement(c *gin.Context) {
    userID, ok := getUserID(c)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    placementID, ok := parseUintParam(c, "id")
    if !ok {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid placement ID"})
        return
    }

    var placement models.AdPlacement
    if err := db.Where("id = ? AND creator_id = ?", placementID, userID).First(&placement).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Placement not found"})
        return
    }

    placement.Status = "completed"
    db.Save(&placement)

    c.JSON(http.StatusOK, gin.H{"message": "Ad placement completed", "placement": placement})
}

// ──────────── CREATOR: Check if can upload own ads ────────────

func CanUploadOwnAd(c *gin.Context) {
    userID, ok := getUserID(c)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    plan := getCreatorPlan(userID)
    canUpload := services.CanUploadAd(plan)

    c.JSON(http.StatusOK, gin.H{
        "canUpload": canUpload,
        "plan":      plan,
        "message": func() string {
            if canUpload {
                return "You can upload unlimited ads with your Pro subscription"
            }
            return "Upgrade to Pro to upload your own ads"
        }(),
    })
}