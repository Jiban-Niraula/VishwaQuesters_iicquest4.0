package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"server/internal/config"
	"server/internal/handlers"
	"server/internal/middleware"
	"server/internal/models"
	"server/internal/services"
	"server/internal/webrtc"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	config.Init()

	dsn := os.Getenv("DB_DSN")
	if strings.TrimSpace(dsn) == "" {
		log.Fatal("DB_DSN not set. Copy .env.example to .env and set DB_DSN.")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.Wallet{},
		&models.Transaction{},
		&models.Subscription{},
		&models.Event{},
		&models.StreamDestination{},
		&models.Ad{},
		&models.AdPlacement{},
		&models.Overlay{},
		&models.PlatformSetting{},
		&models.PaymentIntent{},
	); err != nil {
		log.Fatal("Failed to auto-migrate:", err)
	}

	if err := services.EnsureDefaultPlatformSettings(db); err != nil {
		log.Fatal("Failed to create platform settings:", err)
	}

	handlers.SetDB(db)
	ensureDefaultAdmin(db)

	rtmpService := services.NewRTMPStreamer()
	defer rtmpService.StopAll()

	r := gin.Default()
	r.Use(corsMiddleware())
	r.Static("/uploads", "./uploads")

	r.POST("/api/register", handlers.Register(db))
	r.POST("/api/login", handlers.Login(db))
	r.GET("/api/public/pricing", handlers.GetPublicPricing)
	r.GET("/api/events/code/:code", handlers.GetPublicEvent(db))

	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())
	{
		api.GET("/me", handlers.GetMe(db))

		api.POST("/events", handlers.CreateEvent(db))
		api.GET("/events", handlers.ListEvents(db))
		api.GET("/events/:id", handlers.GetEvent(db))
		api.PUT("/events/:id", handlers.UpdateEvent(db))
		api.DELETE("/events/:id", handlers.DeleteEvent(db))

		api.POST("/overlays", handlers.CreateOverlay)
		api.GET("/overlays", handlers.ListOverlays)
		api.GET("/overlays/library", handlers.ListOverlayLibrary)
		api.POST("/overlays/upload", handlers.UploadOverlayMedia)
		api.POST("/overlays/:id/activate", handlers.ActivateOverlay)
		api.POST("/overlays/:id/deactivate", handlers.DeactivateOverlay)
		api.PUT("/overlays/:id", handlers.UpdateOverlay)
		api.DELETE("/overlays/:id", handlers.DeleteOverlay)

		api.POST("/destinations", handlers.AddDestination)
		api.GET("/destinations", handlers.ListDestinations)
		api.PUT("/destinations/:id", handlers.UpdateDestination)
		api.DELETE("/destinations/:id", handlers.DeleteDestination)

		api.GET("/wallet/balance", handlers.GetWalletBalance)
		api.POST("/wallet/deposit", handlers.DepositToWallet)
		api.GET("/wallet/transactions", handlers.GetTransactions)

		api.GET("/subscription", handlers.GetSubscription)
		api.POST("/subscription/upgrade", handlers.UpgradeSubscription)
		api.POST("/subscription/checkout/esewa", handlers.InitiateSubscriptionEsewaPayment)

		api.GET("/ads/marketplace", handlers.GetAdMarketplace)
		api.POST("/ads/play", handlers.PlayAd)
		api.PUT("/ads/placement/:id/complete", handlers.CompleteAdPlacement)
		api.GET("/ads/can-upload", handlers.CanUploadOwnAd)

		api.POST("/stream/start", handlers.StartStream(rtmpService))
		api.POST("/stream/stop", handlers.StopStream(rtmpService))

		api.POST("/payments/esewa/initiate", handlers.InitiateEsewaPayment)
		api.GET("/payments/esewa/verify", handlers.VerifyEsewaPayment)
		api.GET("/payments/:paymentRef/status", handlers.GetPaymentStatus)

		companyAds := api.Group("/")
		companyAds.Use(middleware.RoleMiddleware("company"))
		{
			companyAds.POST("/ads", handlers.CreateAd)
			companyAds.POST("/ads/upload", handlers.UploadAd)
			companyAds.GET("/ads/my", handlers.ListMyAds)
		}

		admin := api.Group("/admin")
		admin.Use(middleware.RoleMiddleware("admin"))
		{
			admin.GET("/users", handlers.AdminListUsers)
			admin.GET("/users/:id", handlers.AdminGetUser)
			admin.GET("/transactions", handlers.AdminListTransactions)
			admin.GET("/ads", handlers.AdminListAds)
			admin.PUT("/ads/:id/status", handlers.AdminUpdateAdStatus)
			admin.GET("/revenue", handlers.AdminGetRevenue)
			admin.GET("/events", handlers.AdminListEvents)
			admin.POST("/deposit", handlers.AdminDepositToUser)
			admin.GET("/settings", handlers.AdminGetSettings)
			admin.PUT("/settings", handlers.AdminUpdateSettings)
		}
	}

	r.GET("/ws", webrtc.HandleWebSocket(db))
	r.GET("/ws/:code", webrtc.HandleWebSocket(db))
	r.GET("/api/stream/ws", webrtc.HandleStreamWebSocket(db, rtmpService))

	r.GET("/ping", func(ctx *gin.Context) {
		ctx.JSON(200, gin.H{
			"message": "I am alive",
		})
	})
	port := config.Env("PORT", "8080")
	log.Println("Server running on port", port)
	log.Fatal(r.Run(":" + port))
}

func ensureDefaultAdmin(db *gorm.DB) {
	var adminCount int64
	db.Model(&models.User{}).Where("role = ?", "admin").Count(&adminCount)
	if adminCount > 0 {
		return
	}

	email := config.Env("ADMIN_EMAIL", "admin@visioncast.local")
	password := config.Env("ADMIN_PASSWORD", "change_this_admin_password")
	if password == "admin123" || password == "change_this_admin_password" {
		log.Println("WARNING: using weak/default admin password. Change ADMIN_PASSWORD in .env before real use.")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal("Failed to hash admin password:", err)
	}

	admin := models.User{Email: email, Name: "Admin", PasswordHash: string(hash), Role: "admin"}
	if err := db.Create(&admin).Error; err != nil {
		log.Fatal("Failed to create default admin:", err)
	}

	_ = db.Create(&models.Wallet{UserID: admin.ID, Balance: 0, Currency: config.Env("WALLET_CURRENCY", "NRS")}).Error
	log.Printf("Default admin created: %s", email)
}

func corsMiddleware() gin.HandlerFunc {
	allowedOrigins := config.CorsOrigins()
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if isAllowedOrigin(origin, allowedOrigins) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Header("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func isAllowedOrigin(origin string, allowed []string) bool {
	if origin == "" {
		return true
	}
	for _, item := range allowed {
		if item == "*" || item == origin {
			return true
		}
	}
	return false
}
