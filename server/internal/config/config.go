package config

import (
    "log"
    "os"
    "strconv"

    "github.com/joho/godotenv"
)

var (
    JWTSecret              []byte
    ImageAdCharge          float64
    VideoAdPerSecond       float64
    AdminCommissionPercent float64
    FreeCreatorPayoutPct   float64
    ProSubscriptionPrice   float64
    FreeCameraLimit        int
)

func Init() {
    godotenv.Load()

    secret := os.Getenv("JWT_SECRET")
    if secret == "" {
        secret = "fallback_secret_change_me"
        log.Println("WARNING: JWT_SECRET not set, using fallback")
    }
    JWTSecret = []byte(secret)

    ImageAdCharge = getEnvFloat("IMAGE_AD_CHARGE", 50)
    VideoAdPerSecond = getEnvFloat("VIDEO_AD_PER_SECOND", 10)
    AdminCommissionPercent = getEnvFloat("ADMIN_COMMISSION_PERCENT", 30)
    FreeCreatorPayoutPct = getEnvFloat("FREE_CREATOR_PAYOUT_PERCENT", 50)
    ProSubscriptionPrice = getEnvFloat("PRO_SUBSCRIPTION_PRICE", 999)
    FreeCameraLimit = getEnvInt("FREE_CAMERA_LIMIT", 4)

    log.Println("Config loaded: ImageAdCharge=", ImageAdCharge,
        " VideoAdPerSec=", VideoAdPerSecond,
        " AdminComm%=", AdminCommissionPercent,
        " FreePayout%=", FreeCreatorPayoutPct,
        " ProPrice=", ProSubscriptionPrice,
        " FreeCamLimit=", FreeCameraLimit)
}

func getEnvFloat(key string, fallback float64) float64 {
    val := os.Getenv(key)
    if val == "" {
        return fallback
    }
    f, err := strconv.ParseFloat(val, 64)
    if err != nil {
        log.Printf("WARNING: invalid %s, using default %.2f", key, fallback)
        return fallback
    }
    return f
}

func getEnvInt(key string, fallback int) int {
    val := os.Getenv(key)
    if val == "" {
        return fallback
    }
    i, err := strconv.Atoi(val)
    if err != nil {
        log.Printf("WARNING: invalid %s, using default %d", key, fallback)
        return fallback
    }
    return i
}