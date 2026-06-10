package services

import (
    "server/internal/config"
    "server/internal/models"
)

// CalculateAdCharge computes the charge for a company uploading an ad
// Image: fixed IMAGE_AD_CHARGE (NRS 50)
// Video: DURATION_SECONDS × VIDEO_AD_PER_SECOND (NRS 10/sec)
func CalculateAdCharge(adType string, durationSeconds int) float64 {
    if adType == "image" {
        return config.ImageAdCharge
    }
    // video
    return float64(durationSeconds) * config.VideoAdPerSecond
}

// CalculateRevenueSplit breaks down the company charge into admin commission + creator pools
// Returns: adminCommission, creatorPayoutPro, creatorPayoutFree
func CalculateRevenueSplit(chargeAmount float64) (float64, float64, float64) {
    adminCommission := chargeAmount * (config.AdminCommissionPercent / 100.0)
    creatorPool := chargeAmount - adminCommission

    // Pro creator gets 100% of the pool
    creatorPayoutPro := creatorPool

    // Free creator gets FreeCreatorPayoutPct% of the pool
    creatorPayoutFree := creatorPool * (config.FreeCreatorPayoutPct / 100.0)

    return adminCommission, creatorPayoutPro, creatorPayoutFree
}

// GetCreatorPayout returns the payout for a creator based on their subscription tier
func GetCreatorPayout(ad models.Ad, creatorPlan string) float64 {
    if creatorPlan == "pro" {
        return ad.CreatorPayoutPro
    }
    return ad.CreatorPayoutFree
}

// CanUploadAd checks if a creator can upload their own ad overlay
// Free creators: CANNOT upload ads
// Pro creators: CAN upload unlimited ads for free
func CanUploadAd(creatorPlan string) bool {
    return creatorPlan == "pro"
}

// CanConnectCamera checks if the creator can add another camera
// Free: max 4 cameras
// Pro: unlimited
func CanConnectCamera(creatorPlan string, currentCameraCount int) bool {
    if creatorPlan == "pro" {
        return true
    }
    return currentCameraCount < config.FreeCameraLimit
}

// MaxCamerasForPlan returns the max cameras for a plan
// Returns -1 for unlimited
func MaxCamerasForPlan(plan string) int {
    if plan == "pro" {
        return -1 // unlimited
    }
    return config.FreeCameraLimit
}