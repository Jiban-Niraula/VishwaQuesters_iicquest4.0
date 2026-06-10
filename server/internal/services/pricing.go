package services

import (
	"errors"
	"math"
	"time"

	"server/internal/config"
	"server/internal/models"

	"gorm.io/gorm"
)

type AdPricing struct {
	CostPerView              float64
	CampaignBudget           float64
	EstimatedViews           int
	AdminCommissionPercent   float64
	FreeCreatorPayoutPct     float64
	CreatorPayoutProPerView  float64
	CreatorPayoutFreePerView float64
	MaxPlays                 int
	Settings                 models.PlatformSetting
}

func EnsureDefaultPlatformSettings(db *gorm.DB) error {
	var count int64
	if err := db.Model(&models.PlatformSetting{}).Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		return nil
	}

	setting := models.PlatformSetting{
		Currency:               config.Env("WALLET_CURRENCY", "NRS"),
		ImageAdCharge:          config.EnvFloat("IMAGE_AD_CHARGE", 50),
		VideoAdPerSecond:       config.EnvFloat("VIDEO_AD_PER_SECOND", 10),
		AdminCommissionPercent: config.EnvFloat("ADMIN_COMMISSION_PERCENT", 30),
		FreeCreatorPayoutPct:   config.EnvFloat("FREE_CREATOR_PAYOUT_PERCENT", 50),
		ProSubscriptionPrice:   config.EnvFloat("PRO_SUBSCRIPTION_PRICE", 999),
		FreeCameraLimit:        config.EnvInt("FREE_CAMERA_LIMIT", 4),
	}

	return db.Create(&setting).Error
}

func GetPlatformSettings(db *gorm.DB) (models.PlatformSetting, error) {
	if err := EnsureDefaultPlatformSettings(db); err != nil {
		return models.PlatformSetting{}, err
	}

	var setting models.PlatformSetting
	err := db.Order("id ASC").First(&setting).Error
	return setting, err
}

// New model:
// ImageAdCharge = price per 100 platform views for image ad.
// VideoAdPerSecond = price per 100 platform views per video second.
// Example:
// image_ad_charge = 50 => NRS 0.50 per verified platform view
// video_ad_per_second = 10 and duration 15s => NRS 1.50 per verified platform view
func CalculateAdCampaignPricing(db *gorm.DB, adType string, durationSeconds int, campaignBudget float64, maxPlays int) (AdPricing, error) {
	if adType != "image" && adType != "video" {
		return AdPricing{}, errors.New("invalid ad type")
	}

	if adType == "video" && durationSeconds <= 0 {
		return AdPricing{}, errors.New("duration_seconds is required for video ads")
	}

	if campaignBudget < 10 {
		return AdPricing{}, errors.New("campaign_budget must be at least 10")
	}

	if maxPlays <= 0 {
		maxPlays = 1000000
	}

	setting, err := GetPlatformSettings(db)
	if err != nil {
		return AdPricing{}, err
	}

	ratePer100Views := setting.ImageAdCharge
	if adType == "video" {
		ratePer100Views = float64(durationSeconds) * setting.VideoAdPerSecond
	}

	costPerView := ratePer100Views / 100
	if costPerView <= 0 {
		return AdPricing{}, errors.New("invalid cost per view from platform settings")
	}

	adminPercent := clampPercent(setting.AdminCommissionPercent)
	freePayoutPct := clampPercent(setting.FreeCreatorPayoutPct)

	creatorPoolPerView := costPerView * ((100 - adminPercent) / 100)
	proPayoutPerView := creatorPoolPerView
	freePayoutPerView := creatorPoolPerView * (freePayoutPct / 100)

	estimatedViews := int(math.Floor(campaignBudget / costPerView))

	return AdPricing{
		CostPerView:              round2(costPerView),
		CampaignBudget:           round2(campaignBudget),
		EstimatedViews:           estimatedViews,
		AdminCommissionPercent:   adminPercent,
		FreeCreatorPayoutPct:     freePayoutPct,
		CreatorPayoutProPerView:  round2(proPayoutPerView),
		CreatorPayoutFreePerView: round2(freePayoutPerView),
		MaxPlays:                 maxPlays,
		Settings:                 setting,
	}, nil
}

// Backward-compatible wrapper for old callers.
// It converts old max_plays pricing into a campaign budget.
func CalculateAdPricing(db *gorm.DB, adType string, durationSeconds int, maxPlays int) (AdPricing, error) {
	if maxPlays <= 0 {
		maxPlays = 1
	}

	setting, err := GetPlatformSettings(db)
	if err != nil {
		return AdPricing{}, err
	}

	base := setting.ImageAdCharge
	if adType == "video" {
		if durationSeconds <= 0 {
			return AdPricing{}, errors.New("duration_seconds is required for video ads")
		}
		base = float64(durationSeconds) * setting.VideoAdPerSecond
	}

	return CalculateAdCampaignPricing(db, adType, durationSeconds, base*float64(maxPlays), maxPlays)
}

func GetCreatorPayout(ad models.Ad, creatorPlan string) float64 {
	if creatorPlan == "pro" {
		return ad.CreatorPayoutPro
	}
	return ad.CreatorPayoutFree
}

func GetReservedCreatorPoolPerPlay(ad models.Ad) float64 {
	return ad.CostPerView
}

func CanAdRun(ad models.Ad) bool {
	return ad.Status == "approved" &&
		ad.CompletedPlays < ad.MaxPlays &&
		ad.RemainingBudget >= ad.CostPerView &&
		ad.CostPerView > 0
}

func CanUploadAd(creatorPlan string) bool {
	return creatorPlan == "pro"
}

func GetCreatorPlan(db *gorm.DB, userID uint) string {
	var sub models.Subscription
	err := db.Where("user_id = ? AND status = ?", userID, "active").First(&sub).Error
	if err != nil {
		return "free"
	}

	if sub.Plan != "pro" {
		return "free"
	}

	if sub.ExpiresAt != nil && sub.ExpiresAt.Before(time.Now()) {
		db.Model(&sub).Updates(map[string]interface{}{
			"status": "expired",
			"plan":   "free",
		})
		return "free"
	}

	return "pro"
}

func MaxCamerasForPlan(db *gorm.DB, plan string) int {
	if plan == "pro" {
		return -1
	}

	setting, err := GetPlatformSettings(db)
	if err != nil || setting.FreeCameraLimit <= 0 {
		return 4
	}
	return setting.FreeCameraLimit
}

func CanConnectCamera(db *gorm.DB, plan string, nextCameraCount int) bool {
	limit := MaxCamerasForPlan(db, plan)
	return limit < 0 || nextCameraCount <= limit
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func clampPercent(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
