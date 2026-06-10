package handlers

import (
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"server/internal/config"
	"server/internal/models"
	"server/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

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
		MaxPlays        int    `json:"max_plays"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ad, pricing, err := createCompanyAd(userID, input.Title, input.Type, input.MediaURL, input.DurationSeconds, input.ThumbnailURL, input.MaxPlays)
	if err != nil {
		writeCreateAdError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"ad":                ad,
		"chargeAmount":      pricing.ChargeAmount,
		"adminCommission":   pricing.AdminCommission,
		"creatorPayoutPro":  pricing.CreatorPayoutPro,
		"creatorPayoutFree": pricing.CreatorPayoutFree,
		"message":           "Ad created. Pending admin approval.",
	})
}

func UploadAd(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	role, _ := getUserRole(c)
	if role != "company" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only companies can upload ads"})
		return
	}

	title := strings.TrimSpace(c.PostForm("title"))
	adType := strings.TrimSpace(c.PostForm("type"))
	durationSeconds := atoiDefault(c.PostForm("duration_seconds"), 0)
	maxPlays := atoiDefault(c.PostForm("max_plays"), 1)
	thumbnailURL := strings.TrimSpace(c.PostForm("thumbnail_url"))

	if title == "" || (adType != "image" && adType != "video") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title and valid type are required"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	if err := validateAdFile(file, adType); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	uploadDir := config.Env("UPLOAD_DIR", "uploads")
	folder := filepath.Join(uploadDir, "ads")
	filename := fmt.Sprintf("%d_%d_%s", userID, time.Now().UnixNano(), filepath.Base(file.Filename))
	savePath := filepath.Join(folder, filename)

	if err := ensureDir(folder); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare upload folder"})
		return
	}

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file"})
		return
	}

	mediaURL := "/uploads/ads/" + filename
	ad, pricing, err := createCompanyAd(userID, title, adType, mediaURL, durationSeconds, thumbnailURL, maxPlays)
	if err != nil {
		writeCreateAdError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"ad":                ad,
		"mediaUrl":          mediaURL,
		"chargeAmount":      pricing.ChargeAmount,
		"adminCommission":   pricing.AdminCommission,
		"creatorPayoutPro":  pricing.CreatorPayoutPro,
		"creatorPayoutFree": pricing.CreatorPayoutFree,
		"message":           "Ad uploaded. Pending admin approval.",
	})
}

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

func GetAdMarketplace(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	plan := services.GetCreatorPlan(db, userID)
	var ads []models.Ad
	db.Preload("Company").Where("status = ? AND completed_plays < max_plays AND remaining_budget > 0", "approved").Order("created_at DESC").Find(&ads)

	items := make([]gin.H, 0, len(ads))
	for _, ad := range ads {
		items = append(items, gin.H{"ad": ad, "yourPayout": services.GetCreatorPayout(ad, plan), "creatorPlan": plan})
	}

	c.JSON(http.StatusOK, gin.H{"ads": items, "creatorPlan": plan})
}

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

	var ad models.Ad
	if err := db.First(&ad, input.AdID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ad not found"})
		return
	}
	if ad.Status != "approved" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ad is not approved"})
		return
	}
	if ad.CompletedPlays >= ad.MaxPlays || ad.RemainingBudget < services.GetReservedCreatorPoolPerPlay(ad) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ad campaign budget is completed"})
		return
	}

	if input.EventID != 0 {
		var event models.Event
		if err := db.Where("id = ? AND creator_id = ?", input.EventID, userID).First(&event).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Event not found or not owned by you"})
			return
		}
	}

	creatorPlan := services.GetCreatorPlan(db, userID)
	earnedAmount := services.GetCreatorPayout(ad, creatorPlan)
	now := time.Now()
	placement := models.AdPlacement{AdID: ad.ID, CreatorID: userID, EventID: input.EventID, Status: "playing", EarnedAmount: earnedAmount, CreatorTier: creatorPlan, PlayedAt: &now}

	if err := db.Create(&placement).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record ad placement"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"placement": placement, "earnedAmount": earnedAmount, "creatorPlan": creatorPlan, "message": "Ad placement started. Complete it to receive payout."})
}

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

	var input struct {
		WatchedSeconds int `json:"watched_seconds"`
	}
	_ = c.ShouldBindJSON(&input)

	var completedPlacement models.AdPlacement
	err := db.Transaction(func(tx *gorm.DB) error {
		var placement models.AdPlacement
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND creator_id = ?", placementID, userID).First(&placement).Error; err != nil {
			return err
		}
		if placement.Status != "playing" {
			return errors.New("placement is not in playing status")
		}

		var ad models.Ad
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&ad, placement.AdID).Error; err != nil {
			return err
		}

		if ad.Type == "video" && input.WatchedSeconds < ad.DurationSeconds {
			return errors.New("video ad must be completed before payout")
		}
		if ad.Type == "image" && input.WatchedSeconds <= 0 {
			input.WatchedSeconds = 1
		}

		reservedPool := services.GetReservedCreatorPoolPerPlay(ad)
		if ad.Status != "approved" || ad.CompletedPlays >= ad.MaxPlays || ad.RemainingBudget < reservedPool {
			return errors.New("ad campaign budget is completed")
		}

		creatorWallet, err := getOrCreateWalletWithDB(tx, userID)
		if err != nil {
			return err
		}
		if err := creditWalletWithDB(tx, creatorWallet.ID, placement.EarnedAmount, "credit", "Ad playback earning: "+ad.Title, "AdPlacement", placement.ID); err != nil {
			return err
		}

		adminExtra := reservedPool - placement.EarnedAmount
		if adminExtra > 0 {
			var adminUser models.User
			if err := tx.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
				adminWallet, err := getOrCreateWalletWithDB(tx, adminUser.ID)
				if err != nil {
					return err
				}
				if err := creditWalletWithDB(tx, adminWallet.ID, adminExtra, "commission", "Free creator payout remainder: "+ad.Title, "AdPlacement", placement.ID); err != nil {
					return err
				}
			}
		}

		now := time.Now()
		placement.Status = "completed"
		placement.WatchedSeconds = input.WatchedSeconds
		placement.CompletedAt = &now
		if err := tx.Save(&placement).Error; err != nil {
			return err
		}

		ad.CompletedPlays += 1
		ad.RemainingBudget -= reservedPool
		if ad.CompletedPlays >= ad.MaxPlays || ad.RemainingBudget <= 0 {
			ad.Status = "completed"
		}
		if err := tx.Save(&ad).Error; err != nil {
			return err
		}

		completedPlacement = placement
		return nil
	})

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Placement not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Ad placement completed. Earnings credited.", "placement": completedPlacement})
}

func CanUploadOwnAd(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	plan := services.GetCreatorPlan(db, userID)
	canUpload := services.CanUploadAd(plan)
	message := "Upgrade to Pro to upload your own ads"
	if canUpload {
		message = "You can upload unlimited ads with your Pro subscription"
	}

	c.JSON(http.StatusOK, gin.H{"canUpload": canUpload, "plan": plan, "message": message})
}

func createCompanyAd(userID uint, title string, adType string, mediaURL string, durationSeconds int, thumbnailURL string, maxPlays int) (models.Ad, services.AdPricing, error) {
	pricing, err := services.CalculateAdPricing(db, adType, durationSeconds, maxPlays)
	if err != nil {
		return models.Ad{}, services.AdPricing{}, err
	}

	var ad models.Ad
	err = db.Transaction(func(tx *gorm.DB) error {
		wallet, err := getOrCreateWalletWithDB(tx, userID)
		if err != nil {
			return err
		}
		if wallet.Balance < pricing.ChargeAmount {
			return ErrInsufficientBalance
		}

		ad = models.Ad{
			CompanyID:         userID,
			Title:             title,
			Type:              adType,
			MediaURL:          mediaURL,
			DurationSeconds:   durationSeconds,
			ThumbnailURL:      thumbnailURL,
			Status:            "pending",
			BaseChargePerPlay: pricing.BaseChargePerPlay,
			ChargeAmount:      pricing.ChargeAmount,
			AdminCommission:   pricing.AdminCommission,
			CreatorPayoutPro:  pricing.CreatorPayoutPro,
			CreatorPayoutFree: pricing.CreatorPayoutFree,
			MaxPlays:          pricing.MaxPlays,
			CompletedPlays:    0,
			RemainingBudget:   pricing.RemainingBudget,
		}
		if err := tx.Create(&ad).Error; err != nil {
			return err
		}

		if err := debitWalletWithDB(tx, wallet.ID, pricing.ChargeAmount, "charge", "Ad campaign: "+title, "Ad", ad.ID); err != nil {
			return err
		}

		var adminUser models.User
		if err := tx.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
			adminWallet, err := getOrCreateWalletWithDB(tx, adminUser.ID)
			if err != nil {
				return err
			}
			if err := creditWalletWithDB(tx, adminWallet.ID, pricing.AdminCommission, "commission", "Commission from ad campaign: "+title, "Ad", ad.ID); err != nil {
				return err
			}
		}

		return nil
	})

	return ad, pricing, err
}

func writeCreateAdError(c *gin.Context, err error) {
	if errors.Is(err, ErrInsufficientBalance) {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Insufficient wallet balance"})
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
}

func validateAdFile(file *multipart.FileHeader, adType string) error {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	imageExt := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
	videoExt := map[string]bool{".mp4": true, ".webm": true, ".mov": true}

	if adType == "image" && !imageExt[ext] {
		return errors.New("image ads must be jpg, jpeg, png, webp, or gif")
	}
	if adType == "video" && !videoExt[ext] {
		return errors.New("video ads must be mp4, webm, or mov")
	}
	if file.Size > 100*1024*1024 {
		return errors.New("file too large; max 100MB")
	}
	return nil
}

func atoiDefault(s string, fallback int) int {
	var v int
	if _, err := fmt.Sscanf(s, "%d", &v); err != nil {
		return fallback
	}
	return v
}

func ensureDir(path string) error {
	return os.MkdirAll(path, 0755)
}
