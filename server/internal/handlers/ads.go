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
	"server/internal/webrtc"

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
		Title           string  `json:"title" binding:"required"`
		Type            string  `json:"type" binding:"required,oneof=image video"`
		MediaURL        string  `json:"media_url" binding:"required"`
		DurationSeconds int     `json:"duration_seconds"`
		ThumbnailURL    string  `json:"thumbnail_url"`
		CampaignBudget  float64 `json:"campaign_budget"`
		MaxPlays        int     `json:"max_plays"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ad, pricing, err := createCompanyAd(
		userID,
		input.Title,
		input.Type,
		input.MediaURL,
		input.DurationSeconds,
		input.ThumbnailURL,
		input.CampaignBudget,
		input.MaxPlays,
	)

	if err != nil {
		writeCreateAdError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"ad":             ad,
		"campaignBudget": pricing.CampaignBudget,
		"costPerView":    pricing.CostPerView,
		"estimatedViews": pricing.EstimatedViews,
		"message":        "Ad created. Campaign budget reserved from wallet. Pending admin approval.",
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
	campaignBudget := atofDefault(c.PostForm("campaign_budget"), 0)
	maxPlays := atoiDefault(c.PostForm("max_plays"), 1000000)
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

	ad, pricing, err := createCompanyAd(
		userID,
		title,
		adType,
		mediaURL,
		durationSeconds,
		thumbnailURL,
		campaignBudget,
		maxPlays,
	)

	if err != nil {
		writeCreateAdError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"ad":             ad,
		"mediaUrl":       mediaURL,
		"campaignBudget": pricing.CampaignBudget,
		"costPerView":    pricing.CostPerView,
		"estimatedViews": pricing.EstimatedViews,
		"message":        "Ad uploaded. Campaign budget reserved from wallet. Pending admin approval.",
	})
}

func ListMyAds(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var ads []models.Ad
	db.Preload("AdPlacements").Where("company_id = ?", userID).Order("created_at DESC").Find(&ads)

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
	db.Preload("Company").
		Where("status = ? AND completed_plays < max_plays AND remaining_budget >= cost_per_view", "approved").
		Order("created_at DESC").
		Find(&ads)

	items := make([]gin.H, 0, len(ads))
	for _, ad := range ads {
		items = append(items, gin.H{
			"ad":             ad,
			"creatorPlan":    plan,
			"yourPayout":     services.GetCreatorPayout(ad, plan),
			"payoutLabel":    "estimated payout per platform view",
			"costPerView":    ad.CostPerView,
			"estimatedViews": ad.EstimatedViews,
		})
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
		AdID      uint   `json:"ad_id" binding:"required"`
		EventID   *uint  `json:"event_id"`
		EventCode string `json:"event_code"`
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

	if !services.CanAdRun(ad) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ad campaign budget is completed or ad is not approved"})
		return
	}

	eventID, eventCode, err := resolveAdEventForCreator(userID, input.EventID, input.EventCode)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	creatorPlan := services.GetCreatorPlan(db, userID)
	now := time.Now()

	placement := models.AdPlacement{
		AdID:        ad.ID,
		CreatorID:   userID,
		EventID:     eventID,
		Status:      "playing",
		CreatorTier: creatorPlan,
		PlayedAt:    &now,
	}

	if err := db.Create(&placement).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start ad placement"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"placement":              placement,
		"costPerView":            ad.CostPerView,
		"estimatedPayoutPerView": services.GetCreatorPayout(ad, creatorPlan),
		"creatorPlan":            creatorPlan,
		"eventCode":              eventCode,
		"message":                "Sponsored ad started. Complete it to calculate verified platform views and payout.",
	})
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
		YoutubeViews   int `json:"youtube_views"`
		FacebookViews  int `json:"facebook_views"`
	}

	_ = c.ShouldBindJSON(&input)

	var completedPlacement models.AdPlacement
	var updatedAd models.Ad

	err := db.Transaction(func(tx *gorm.DB) error {
		var placement models.AdPlacement
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND creator_id = ?", placementID, userID).
			First(&placement).Error; err != nil {
			return err
		}

		if placement.Status != "playing" {
			return errors.New("placement is not in playing status")
		}

		var ad models.Ad
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&ad, placement.AdID).Error; err != nil {
			return err
		}

		if !services.CanAdRun(ad) {
			return errors.New("ad campaign budget is completed")
		}

		if ad.Type == "video" && input.WatchedSeconds < ad.DurationSeconds {
			return errors.New("video ad must be completed before payout")
		}

		if ad.Type == "image" && input.WatchedSeconds <= 0 {
			input.WatchedSeconds = 1
		}

		platformViews := countPlatformViewsForPlacement(tx, placement)
		youtubeViews := maxInt(0, input.YoutubeViews)
		facebookViews := maxInt(0, input.FacebookViews)

		// MVP rule:
		// Only Vision Cast platform views are billable.
		// YouTube/Facebook views are report-only until API verification exists.
		billableViews := platformViews
		chargedAmount := roundMoney(float64(billableViews) * ad.CostPerView)

		if chargedAmount > ad.RemainingBudget {
			chargedAmount = roundMoney(ad.RemainingBudget)
			if ad.CostPerView > 0 {
				billableViews = int(chargedAmount / ad.CostPerView)
			}
		}

		settings, err := services.GetPlatformSettings(tx)
		if err != nil {
			return err
		}

		adminPercent := clampPercentLocal(settings.AdminCommissionPercent)
		freePayoutPct := clampPercentLocal(settings.FreeCreatorPayoutPct)

		adminCommission := roundMoney(chargedAmount * (adminPercent / 100))
		creatorPool := roundMoney(chargedAmount - adminCommission)

		creatorPayout := creatorPool
		if placement.CreatorTier != "pro" {
			creatorPayout = roundMoney(creatorPool * (freePayoutPct / 100))
		}

		freeTierRemainder := roundMoney(creatorPool - creatorPayout)

		if creatorPayout > 0 {
			creatorWallet, err := getOrCreateWalletWithDB(tx, userID)
			if err != nil {
				return err
			}

			if err := creditWalletWithDB(
				tx,
				creatorWallet.ID,
				creatorPayout,
				"credit",
				"Ad earning from verified platform views: "+ad.Title,
				"AdPlacement",
				placement.ID,
			); err != nil {
				return err
			}
		}

		adminTotal := roundMoney(adminCommission + freeTierRemainder)
		if adminTotal > 0 {
			var adminUser models.User
			if err := tx.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
				adminWallet, err := getOrCreateWalletWithDB(tx, adminUser.ID)
				if err != nil {
					return err
				}

				if err := creditWalletWithDB(
					tx,
					adminWallet.ID,
					adminTotal,
					"commission",
					"Ad platform commission: "+ad.Title,
					"AdPlacement",
					placement.ID,
				); err != nil {
					return err
				}
			}
		}

		now := time.Now()

		placement.Status = "completed"
		placement.WatchedSeconds = input.WatchedSeconds
		placement.PlatformViews = platformViews
		placement.YoutubeViews = youtubeViews
		placement.FacebookViews = facebookViews
		placement.TotalViews = platformViews + youtubeViews + facebookViews
		placement.ChargedAmount = chargedAmount
		placement.AdminCommission = adminCommission
		placement.CreatorPayout = creatorPayout
		placement.FreeTierRemainder = freeTierRemainder
		placement.EarnedAmount = creatorPayout
		placement.CompletedAt = &now

		if err := tx.Save(&placement).Error; err != nil {
			return err
		}

		ad.CompletedPlays += 1
		ad.SpentAmount = roundMoney(ad.SpentAmount + chargedAmount)
		ad.RemainingBudget = roundMoney(ad.RemainingBudget - chargedAmount)
		ad.AdminCommission = roundMoney(ad.AdminCommission + adminCommission + freeTierRemainder)
		ad.PlatformViews += platformViews
		ad.YoutubeViews += youtubeViews
		ad.FacebookViews += facebookViews
		ad.TotalViews = ad.PlatformViews + ad.YoutubeViews + ad.FacebookViews

		if ad.CompletedPlays >= ad.MaxPlays || ad.RemainingBudget < ad.CostPerView {
			ad.Status = "completed"
		}

		if err := tx.Save(&ad).Error; err != nil {
			return err
		}

		completedPlacement = placement
		updatedAd = ad

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

	c.JSON(http.StatusOK, gin.H{
		"message":   "Ad completed. Earnings calculated from verified Vision Cast platform views.",
		"placement": completedPlacement,
		"ad":        updatedAd,
	})
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

func createCompanyAd(
	userID uint,
	title string,
	adType string,
	mediaURL string,
	durationSeconds int,
	thumbnailURL string,
	campaignBudget float64,
	maxPlays int,
) (models.Ad, services.AdPricing, error) {
	pricing, err := services.CalculateAdCampaignPricing(db, adType, durationSeconds, campaignBudget, maxPlays)
	if err != nil {
		return models.Ad{}, services.AdPricing{}, err
	}

	var ad models.Ad

	err = db.Transaction(func(tx *gorm.DB) error {
		wallet, err := getOrCreateWalletWithDB(tx, userID)
		if err != nil {
			return err
		}

		if wallet.Balance < pricing.CampaignBudget {
			return ErrInsufficientBalance
		}

		ad = models.Ad{
			CompanyID:       userID,
			Title:           title,
			Type:            adType,
			MediaURL:        normalizePath(mediaURL),
			DurationSeconds: durationSeconds,
			ThumbnailURL:    normalizePath(thumbnailURL),
			Status:          "pending",

			CampaignBudget:  pricing.CampaignBudget,
			ChargeAmount:    pricing.CampaignBudget,
			SpentAmount:     0,
			RemainingBudget: pricing.CampaignBudget,

			CostPerView:       pricing.CostPerView,
			BaseChargePerPlay: pricing.CostPerView,

			AdminCommission:   0,
			CreatorPayoutPro:  pricing.CreatorPayoutProPerView,
			CreatorPayoutFree: pricing.CreatorPayoutFreePerView,

			MaxPlays:       pricing.MaxPlays,
			CompletedPlays: 0,
			EstimatedViews: pricing.EstimatedViews,
		}

		if err := tx.Create(&ad).Error; err != nil {
			return err
		}

		// Reserve the full campaign budget from company wallet.
		// Admin/creator only receive money when ad gets verified platform views.
		if err := debitWalletWithDB(
			tx,
			wallet.ID,
			pricing.CampaignBudget,
			"charge",
			"Ad campaign budget reserved: "+title,
			"Ad",
			ad.ID,
		); err != nil {
			return err
		}

		return nil
	})

	return ad, pricing, err
}

func resolveAdEventForCreator(creatorID uint, eventID *uint, eventCode string) (uint, string, error) {
	var event models.Event

	if eventID != nil && *eventID != 0 {
		if err := db.Where("id = ? AND creator_id = ?", *eventID, creatorID).First(&event).Error; err != nil {
			return 0, "", errors.New("event not found or not owned by you")
		}
		return event.ID, event.Code, nil
	}

	eventCode = strings.TrimSpace(eventCode)
	if eventCode != "" {
		if err := db.Where("code = ? AND creator_id = ?", eventCode, creatorID).First(&event).Error; err != nil {
			return 0, "", errors.New("event not found or not owned by you")
		}
		return event.ID, event.Code, nil
	}

	return 0, "", nil
}

func countPlatformViewsForPlacement(tx *gorm.DB, placement models.AdPlacement) int {
	if placement.EventID == 0 {
		return 0
	}

	var event models.Event
	if err := tx.First(&event, placement.EventID).Error; err != nil {
		return 0
	}

	code := strings.TrimSpace(event.Code)
	if code == "" {
		return 0
	}

	return webrtc.CountViewers(code)
}

func writeCreateAdError(c *gin.Context, err error) {
	if errors.Is(err, ErrInsufficientBalance) {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Insufficient wallet balance for campaign budget"})
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

func atofDefault(s string, fallback float64) float64 {
	var v float64
	if _, err := fmt.Sscanf(s, "%f", &v); err != nil {
		return fallback
	}
	return v
}

func ensureDir(path string) error {
	return os.MkdirAll(path, 0755)
}

func roundMoney(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

func clampPercentLocal(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
