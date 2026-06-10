package main

import (
	"log"
	"os"

	"server/internal/config"
	"server/internal/handlers"
	"server/internal/middleware"
	"server/internal/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// Load config
	config.Init()

	// Connect to DB
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		log.Fatal("DB_DSN not set in .env")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto-migrate ALL models
	err = db.AutoMigrate(
		&models.User{},
		&models.Wallet{},
		&models.Transaction{},
		&models.Subscription{},
		&models.Event{},
		&models.StreamDestination{},
		&models.Ad{},
		&models.AdPlacement{},
		&models.Overlay{},
	)
	if err != nil {
		log.Fatal("Failed to auto-migrate:", err)
	}
	log.Println("Database migrated successfully")

	// Set DB for handlers that use the package-level db var
	handlers.SetDB(db)

	// Create default admin if none exists
	var adminCount int64
	db.Model(&models.User{}).Where("role = ?", "admin").Count(&adminCount)
	if adminCount == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
		admin := models.User{
			Email:        "admin@streamangle.com",
			Name:         "Admin",
			PasswordHash: string(hash),
			Role:         "admin",
		}
		db.Create(&admin)

		// Create admin wallet
		wallet := models.Wallet{
			UserID:   admin.ID,
			Balance:  0,
			Currency: "NRS",
		}
		db.Create(&wallet)
		log.Println("Default admin created: admin@streamangle.com / admin123")
	}

	// ──── Setup Gin Router ────
	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// ──── Public Routes ────
	r.POST("/api/register", handlers.Register(db))
	r.POST("/api/login", handlers.Login(db))
	r.GET("/api/events/code/:code", handlers.GetPublicEvent(db))

	// ──── Authenticated Routes ────
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())
	{
		// Auth / Profile
		api.GET("/me", handlers.GetMe(db))

		// ──── Events (Creator) ────
		api.POST("/events", handlers.CreateEvent(db))
		api.GET("/events", handlers.ListEvents(db))
		api.GET("/events/:id", handlers.GetEvent(db))
		api.PUT("/events/:id", handlers.UpdateEvent(db))
		api.DELETE("/events/:id", handlers.DeleteEvent(db))

		// ──── Overlays ────
		api.POST("/overlays", handlers.CreateOverlay)
		api.GET("/overlays", handlers.ListOverlays)
		api.PUT("/overlays/:id", handlers.UpdateOverlay)
		api.DELETE("/overlays/:id", handlers.DeleteOverlay)

		// ──── Destinations ────
		api.POST("/destinations", handlers.AddDestination)
		api.GET("/destinations", handlers.ListDestinations)
		api.PUT("/destinations/:id", handlers.UpdateDestination)
		api.DELETE("/destinations/:id", handlers.DeleteDestination)

		// ──── Wallet ────
		api.GET("/wallet/balance", handlers.GetWalletBalance)
		api.POST("/wallet/deposit", handlers.DepositToWallet)
		api.GET("/wallet/transactions", handlers.GetTransactions)

		// ──── Subscription ────
		api.GET("/subscription", handlers.GetSubscription)
		api.POST("/subscription/upgrade", handlers.UpgradeSubscription)

		// ──── Ads ────
		api.GET("/ads/marketplace", handlers.GetAdMarketplace)               // Creator: browse
		api.POST("/ads/play", handlers.PlayAd)                               // Creator: play sponsored ad
		api.PUT("/ads/placement/:id/complete", handlers.CompleteAdPlacement) // Creator: complete
		api.GET("/ads/can-upload", handlers.CanUploadOwnAd)                  // Creator: check permission

		// ──── Ads (Company) ────
		companyAds := api.Group("/")
		companyAds.Use(middleware.RoleMiddleware("company"))
		{
			companyAds.POST("/ads", handlers.CreateAd)
			companyAds.GET("/ads/my", handlers.ListMyAds)
		}

		// ──── Admin ────
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
			admin.PUT("/settings", handlers.AdminUpdateSettings)
		}
	}

	// ──── WebSocket for WebRTC Signaling ────
	// (existing - keep as-is)
	r.GET("/ws", func(c *gin.Context) {
		// your existing WebSocket handler
	})

	// ──── Stream endpoint ────
	// (existing - keep as-is)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Println("Server running on port", port)
	log.Fatal(r.Run(":" + port))
}
