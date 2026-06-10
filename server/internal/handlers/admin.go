package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"server/internal/models"
	"server/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func AdminListUsers(c *gin.Context) {
	var users []models.User
	query := db.Preload("Wallet").Preload("Subscription")
	if roleFilter := c.Query("role"); roleFilter != "" {
		query = query.Where("role = ?", roleFilter)
	}
	query.Order("created_at DESC").Find(&users)
	c.JSON(http.StatusOK, gin.H{"users": users})
}

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

func AdminListTransactions(c *gin.Context) {
	var transactions []models.Transaction
	query := db.Order("created_at DESC")
	if txType := c.Query("type"); txType != "" {
		query = query.Where("type = ?", txType)
	}

	limit := 50
	offset := 0
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	query.Limit(limit).Offset(offset).Find(&transactions)
	var total int64
	db.Model(&models.Transaction{}).Count(&total)
	c.JSON(http.StatusOK, gin.H{"transactions": transactions, "total": total, "limit": limit, "offset": offset})
}

func AdminUpdateAdStatus(c *gin.Context) {
	adID, ok := parseUintParam(c, "id")
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ad ID"})
		return
	}

	var input struct {
		Status string `json:"status" binding:"required,oneof=approved rejected"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var updatedAd models.Ad
	err := db.Transaction(func(tx *gorm.DB) error {
		var ad models.Ad
		if err := tx.First(&ad, adID).Error; err != nil {
			return err
		}
		if ad.Status == "completed" {
			return errors.New("completed campaign status cannot be changed")
		}
		if ad.Status == input.Status {
			updatedAd = ad
			return nil
		}
		if ad.Status == "rejected" {
			return errors.New("rejected campaign cannot be changed")
		}

		if input.Status == "rejected" {
			companyWallet, err := getOrCreateWalletWithDB(tx, ad.CompanyID)
			if err != nil {
				return err
			}
			if err := creditWalletWithDB(tx, companyWallet.ID, ad.ChargeAmount, "refund", "Refund: ad rejected #"+fmt.Sprint(ad.ID), "Ad", ad.ID); err != nil {
				return err
			}

			var adminUser models.User
			if err := tx.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
				adminWallet, err := getOrCreateWalletWithDB(tx, adminUser.ID)
				if err != nil {
					return err
				}
				if err := debitWalletWithDB(tx, adminWallet.ID, ad.AdminCommission, "charge", "Commission reversal: ad rejected #"+fmt.Sprint(ad.ID), "Ad", ad.ID); err != nil {
					return err
				}
			}
		}

		ad.Status = input.Status
		if err := tx.Save(&ad).Error; err != nil {
			return err
		}
		updatedAd = ad
		return nil
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ad not found"})
			return
		}
		if errors.Is(err, ErrInsufficientBalance) {
			c.JSON(http.StatusConflict, gin.H{"error": "Admin wallet does not have enough balance to reverse commission"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ad": updatedAd, "message": "Ad status updated to " + input.Status})
}

func AdminListAds(c *gin.Context) {
	var ads []models.Ad
	query := db.Preload("Company")
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	query.Order("created_at DESC").Find(&ads)
	c.JSON(http.StatusOK, gin.H{"ads": ads})
}

func AdminGetRevenue(c *gin.Context) {
	var totalCommission float64
	db.Model(&models.Transaction{}).Where("type = ?", "commission").Select("COALESCE(SUM(amount), 0)").Scan(&totalCommission)

	var totalSubscription float64
	db.Model(&models.Transaction{}).Where("type = ?", "subscription").Select("COALESCE(SUM(amount), 0)").Scan(&totalSubscription)

	var totalDeposited float64
	db.Model(&models.Transaction{}).Where("type = ?", "deposit").Select("COALESCE(SUM(amount), 0)").Scan(&totalDeposited)

	var totalAdCharges float64
	db.Model(&models.Transaction{}).Where("type = ? AND description LIKE ?", "charge", "%Ad campaign%").Select("COALESCE(SUM(amount), 0)").Scan(&totalAdCharges)

	var totalCreatorPayouts float64
	db.Model(&models.Transaction{}).Where("type = ? AND description LIKE ?", "credit", "%Ad playback earning%").Select("COALESCE(SUM(amount), 0)").Scan(&totalCreatorPayouts)

	var totalUsers, totalCreators, totalCompanies, totalAds, totalPlacements, activeSubscriptions int64
	db.Model(&models.User{}).Count(&totalUsers)
	db.Model(&models.User{}).Where("role = ?", "creator").Count(&totalCreators)
	db.Model(&models.User{}).Where("role = ?", "company").Count(&totalCompanies)
	db.Model(&models.Ad{}).Count(&totalAds)
	db.Model(&models.AdPlacement{}).Count(&totalPlacements)
	db.Model(&models.Subscription{}).Where("plan = ? AND status = ?", "pro", "active").Count(&activeSubscriptions)

	type MonthlyRevenue struct {
		Month         string  `json:"month"`
		Commission    float64 `json:"commission"`
		Subscriptions float64 `json:"subscriptions"`
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
		"totals":         gin.H{"adminCommission": totalCommission, "subscriptionRevenue": totalSubscription, "totalRevenue": totalCommission + totalSubscription, "totalDeposited": totalDeposited, "totalAdCharges": totalAdCharges, "totalCreatorPayouts": totalCreatorPayouts},
		"counts":         gin.H{"totalUsers": totalUsers, "totalCreators": totalCreators, "totalCompanies": totalCompanies, "totalAds": totalAds, "totalAdPlacements": totalPlacements, "activeSubscriptions": activeSubscriptions},
		"monthlyRevenue": monthlyRevenue,
	})
}

func AdminListEvents(c *gin.Context) {
	var events []models.Event
	db.Preload("Creator").Order("created_at DESC").Find(&events)
	c.JSON(http.StatusOK, gin.H{"events": events})
}

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
	if err := creditWallet(wallet.ID, input.Amount, "deposit", description, "", 0); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Deposit failed"})
		return
	}

	var updated models.Wallet
	db.First(&updated, wallet.ID)
	c.JSON(http.StatusOK, gin.H{"message": "Deposit successful", "userId": input.UserID, "amount": input.Amount, "newBalance": updated.Balance})
}

func AdminGetSettings(c *gin.Context) {
	setting, err := services.GetPlatformSettings(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load settings"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"settings": setting})
}

func AdminUpdateSettings(c *gin.Context) {
	var input struct {
		Currency               *string  `json:"currency"`
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

	setting, err := services.GetPlatformSettings(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load settings"})
		return
	}

	updates := map[string]interface{}{}
	if input.Currency != nil {
		updates["currency"] = *input.Currency
	}
	if input.ImageAdCharge != nil {
		if *input.ImageAdCharge < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "image_ad_charge cannot be negative"})
			return
		}
		updates["image_ad_charge"] = *input.ImageAdCharge
	}
	if input.VideoAdPerSecond != nil {
		if *input.VideoAdPerSecond < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "video_ad_per_second cannot be negative"})
			return
		}
		updates["video_ad_per_second"] = *input.VideoAdPerSecond
	}
	if input.AdminCommissionPercent != nil {
		if *input.AdminCommissionPercent < 0 || *input.AdminCommissionPercent > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "admin_commission_percent must be 0-100"})
			return
		}
		updates["admin_commission_percent"] = *input.AdminCommissionPercent
	}
	if input.FreeCreatorPayoutPct != nil {
		if *input.FreeCreatorPayoutPct < 0 || *input.FreeCreatorPayoutPct > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "free_creator_payout_percent must be 0-100"})
			return
		}
		updates["free_creator_payout_pct"] = *input.FreeCreatorPayoutPct
	}
	if input.ProSubscriptionPrice != nil {
		if *input.ProSubscriptionPrice < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "pro_subscription_price cannot be negative"})
			return
		}
		updates["pro_subscription_price"] = *input.ProSubscriptionPrice
	}
	if input.FreeCameraLimit != nil {
		if *input.FreeCameraLimit < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "free_camera_limit must be at least 1"})
			return
		}
		updates["free_camera_limit"] = *input.FreeCameraLimit
	}

	if len(updates) > 0 {
		if err := db.Model(&setting).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
			return
		}
	}
	db.First(&setting, setting.ID)
	c.JSON(http.StatusOK, gin.H{"message": "Settings updated", "settings": setting})
}
