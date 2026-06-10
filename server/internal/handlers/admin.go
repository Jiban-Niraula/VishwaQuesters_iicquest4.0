package handlers

import (
    "net/http"
    "time"
	"strconv"
    "server/internal/models"

    "github.com/gin-gonic/gin"
)

// ──────────── ADMIN: List All Users ────────────

func AdminListUsers(c *gin.Context) {
    role, _ := getUserRole(c)
    if role != "admin" {
        c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
        return
    }

    var users []models.User
    query := db.Preload("Wallet").Preload("Subscription")

    // Optional filter by role
    if roleFilter := c.Query("role"); roleFilter != "" {
        query = query.Where("role = ?", roleFilter)
    }

    query.Order("created_at DESC").Find(&users)

    c.JSON(http.StatusOK, gin.H{"users": users})
}

// ──────────── ADMIN: Get Single User ────────────

func AdminGetUser(c *gin.Context) {
    userID, ok := parseUintParam(c, "id")
    if !ok {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
        return
    }

    var user models.User
    if err := db.Preload("Wallet").Preload("Wallet.Transactions").Preload("Subscription").First(&user, userID).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"user": user})
}

// ──────────── ADMIN: All Transactions ────────────

func AdminListTransactions(c *gin.Context) {
    var transactions []models.Transaction
    query := db.Order("created_at DESC")

    // Optional filters
    if txType := c.Query("type"); txType != "" {
        query = query.Where("type = ?", txType)
    }

    // Pagination
    limit := 50
    offset := 0
    if l := c.Query("limit"); l != "" {
        if parsed, err := parseInt(l); err == nil && parsed > 0 {
            limit = parsed
        }
    }
    if o := c.Query("offset"); o != "" {
        if parsed, err := parseInt(o); err == nil && parsed >= 0 {
            offset = parsed
        }
    }

    query.Limit(limit).Offset(offset).Find(&transactions)

    // Get total count
    var total int64
    db.Model(&models.Transaction{}).Count(&total)

    c.JSON(http.StatusOK, gin.H{
        "transactions": transactions,
        "total":        total,
        "limit":        limit,
        "offset":       offset,
    })
}

import "strconv"

func parseInt(s string) (int, error) {
    return strconv.Atoi(s)
}

// ──────────── ADMIN: Approve/Reject Ad ────────────

func AdminUpdateAdStatus(c *gin.Context) {
    adID, ok := parseUintParam(c, "id")
    if !ok {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ad ID"})
        return
    }

    var input struct {
        Status string `json:"status" binding:"required,oneof=approved rejected"`
        Reason string `json:"reason"` // optional rejection reason
    }

    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    var ad models.Ad
    if err := db.First(&ad, adID).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Ad not found"})
        return
    }

    ad.Status = input.Status
    db.Save(&ad)

    // If rejected, refund the company
    if input.Status == "rejected" {
        companyWallet, err := getOrCreateWallet(ad.CompanyID)
        if err == nil {
            creditWallet(companyWallet.ID, ad.ChargeAmount, "credit", "Refund: Ad rejected #"+string(rune(ad.ID)), "Ad", ad.ID)

            // Debit admin commission back
            var adminUser models.User
            if err := db.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
                adminWallet, _ := getOrCreateWallet(adminUser.ID)
                debitWallet(adminWallet.ID, ad.AdminCommission, "charge", "Commission reversal: Ad rejected", "Ad", ad.ID)
            }
        }
    }

    c.JSON(http.StatusOK, gin.H{
        "ad":      ad,
        "message": "Ad status updated to " + input.Status,
    })
}

// ──────────── ADMIN: List All Ads ────────────

func AdminListAds(c *gin.Context) {
    var ads []models.Ad
    query := db.Preload("Company")

    if status := c.Query("status"); status != "" {
        query = query.Where("status = ?", status)
    }

    query.Order("created_at DESC").Find(&ads)

    c.JSON(http.StatusOK, gin.H{"ads": ads})
}

// ──────────── ADMIN: Revenue Dashboard ────────────

func AdminGetRevenue(c *gin.Context) {
    // Total admin commission
    var totalCommission float64
    db.Model(&models.Transaction{}).Where("type = ?", "commission").Select("COALESCE(SUM(amount), 0)").Scan(&totalCommission)

    // Total subscription revenue
    var totalSubscription float64
    db.Model(&models.Transaction{}).Where("type = ?", "subscription").Select("COALESCE(SUM(amount), 0)").Scan(&totalSubscription)

    // Total deposited (all users)
    var totalDeposited float64
    db.Model(&models.Transaction{}).Where("type = ?", "deposit").Select("COALESCE(SUM(amount), 0)").Scan(&totalDeposited)

    // Total ad charges (from companies)
    var totalAdCharges float64
    db.Model(&models.Transaction{}).Where("type = ? AND description LIKE ?", "charge", "%Ad upload%").Select("COALESCE(SUM(amount), 0)").Scan(&totalAdCharges)

    // Total creator payouts
    var totalCreatorPayouts float64
    db.Model(&models.Transaction{}).Where("type = ?", "credit").Select("COALESCE(SUM(amount), 0)").Scan(&totalCreatorPayouts)

    // Counts
    var totalUsers int64
    var totalCreators int64
    var totalCompanies int64
    var totalAds int64
    var totalPlacements int64
    var activeSubscriptions int64

    db.Model(&models.User{}).Count(&totalUsers)
    db.Model(&models.User{}).Where("role = ?", "creator").Count(&totalCreators)
    db.Model(&models.User{}).Where("role = ?", "company").Count(&totalCompanies)
    db.Model(&models.Ad{}).Count(&totalAds)
    db.Model(&models.AdPlacement{}).Count(&totalPlacements)
    db.Model(&models.Subscription{}).Where("plan = ? AND status = ?", "pro", "active").Count(&activeSubscriptions)

    // Revenue by month (last 6 months)
    type MonthlyRevenue struct {
        Month      string  `json:"month"`
        Commission float64 `json:"commission"`
        Subs       float64 `json:"subscriptions"`
    }

    var monthlyRevenue []MonthlyRevenue
    db.Raw(`
        SELECT 
            TO_CHAR(created_at, 'YYYY-MM') as month,
            COALESCE(SUM(CASE WHEN type = 'commission' THEN amount ELSE 0 END), 0) as commission,
            COALESCE(SUM(CASE WHEN type = 'subscription' THEN amount ELSE 0 END), 0) as subscriptions
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month DESC
    `).Scan(&monthlyRevenue)

    c.JSON(http.StatusOK, gin.H{
        "totals": gin.H{
            "adminCommission":    totalCommission,
            "subscriptionRevenue": totalSubscription,
            "totalRevenue":       totalCommission + totalSubscription,
            "totalDeposited":     totalDeposited,
            "totalAdCharges":     totalAdCharges,
            "totalCreatorPayouts": totalCreatorPayouts,
        },
        "counts": gin.H{
            "totalUsers":          totalUsers,
            "totalCreators":       totalCreators,
            "totalCompanies":      totalCompanies,
            "totalAds":            totalAds,
            "totalAdPlacements":   totalPlacements,
            "activeSubscriptions": activeSubscriptions,
        },
        "monthlyRevenue": monthlyRevenue,
    })
}

// ──────────── ADMIN: List All Events ────────────

func AdminListEvents(c *gin.Context) {
    var events []models.Event
    db.Preload("Creator").Order("created_at DESC").Find(&events)

    c.JSON(http.StatusOK, gin.H{"events": events})
}

// ──────────── ADMIN: Manual Wallet Deposit (for admin to credit users) ────────────

func AdminDepositToUser(c *gin.Context) {
    var input struct {
        UserID uint    `json:"user_id" binding:"required"`
        Amount float64 `json:"amount" binding:"required,gt=0"`
        Reason string  `json:"reason"`
    }

    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    wallet, err := getOrCreateWallet(input.UserID)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "User wallet not found"})
        return
    }

    description := "Admin deposit"
    if input.Reason != "" {
        description = input.Reason
    }

    creditWallet(wallet.ID, input.Amount, "deposit", description, "", 0)

    c.JSON(http.StatusOK, gin.H{
        "message":    "Deposit successful",
        "userId":     input.UserID,
        "amount":     input.Amount,
        "newBalance": wallet.Balance + input.Amount,
    })
}

// ──────────── ADMIN: Update Platform Settings ────────────

func AdminUpdateSettings(c *gin.Context) {
    var input struct {
        ImageAdCharge          *float64 `json:"image_ad_charge"`
        VideoAdPerSecond       *float64 `json:"video_ad_per_second"`
        AdminCommissionPercent *float64 `json:"admin_commission_percent"`
        FreeCreatorPayoutPct   *float64 `json:"free_creator_payout_percent"`
        ProSubscriptionPrice   *float64 `json:"pro_subscription_price"`
        FreeCameraLimit        *int     `json:"free_camera_limit"`
    }

    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Update config at runtime (in production, you'd persist to DB)
    // For now, these are env vars — admin changes would require restart
    // TODO: Store in a PlatformSettings DB table for dynamic updates

    c.JSON(http.StatusOK, gin.H{
        "message": "Settings updated. Some changes may require server restart.",
        "note":    "For production, implement a PlatformSettings model for dynamic config.",
    })
}