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
	BaseChargePerPlay float64
	ChargeAmount      float64
	AdminCommission   float64
	CreatorPayoutPro  float64
	CreatorPayoutFree float64
	RemainingBudget   float64
	MaxPlays          int
	Settings          models.PlatformSetting
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

func CalculateAdPricing(db *gorm.DB, adType string, durationSeconds int, maxPlays int) (AdPricing, error) {
	if adType != "image" && adType != "video" {
		return AdPricing{}, errors.New("invalid ad type")
	}

	if adType == "video" && durationSeconds <= 0 {
		return AdPricing{}, errors.New("duration_seconds is required for video ads")
	}

	if maxPlays <= 0 {
		maxPlays = 1
	}

	setting, err := GetPlatformSettings(db)
	if err != nil {
		return AdPricing{}, err
	}

	base := setting.ImageAdCharge
	if adType == "video" {
		base = float64(durationSeconds) * setting.VideoAdPerSecond
	}

	totalCharge := base * float64(maxPlays)
	adminCommissionPerPlay := base * (setting.AdminCommissionPercent / 100)
	creatorPoolPerPlay := base - adminCommissionPerPlay
	freePayoutPerPlay := creatorPoolPerPlay * (setting.FreeCreatorPayoutPct / 100)

	return AdPricing{
		BaseChargePerPlay: round2(base),
		ChargeAmount:      round2(totalCharge),
		AdminCommission:   round2(adminCommissionPerPlay * float64(maxPlays)),
		CreatorPayoutPro:  round2(creatorPoolPerPlay),
		CreatorPayoutFree: round2(freePayoutPerPlay),
		RemainingBudget:   round2(creatorPoolPerPlay * float64(maxPlays)),
		MaxPlays:          maxPlays,
		Settings:          setting,
	}, nil
}

func GetCreatorPayout(ad models.Ad, creatorPlan string) float64 {
	if creatorPlan == "pro" {
		return ad.CreatorPayoutPro
	}
	return ad.CreatorPayoutFree
}

func GetReservedCreatorPoolPerPlay(ad models.Ad) float64 {
	return ad.CreatorPayoutPro
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
	if plan == "pro" {
		return true
	}

	limit := MaxCamerasForPlan(db, plan)
	return nextCameraCount <= limit
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
