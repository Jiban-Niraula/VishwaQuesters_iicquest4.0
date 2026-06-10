package handlers

import (
    "net/http"
    "time"

    "server/internal/config"
    "server/internal/models"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v4"
    "golang.org/x/crypto/bcrypt"
    "gorm.io/gorm"
)

func Register(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        var input struct {
            Email    string `json:"email" binding:"required,email"`
            Password string `json:"password" binding:"required,min=8"`
            Name     string `json:"name" binding:"required"`
            Role     string `json:"role" binding:"required,oneof=creator company admin"`
        }

        if err := c.ShouldBindJSON(&input); err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
            return
        }

        hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
            return
        }

        user := models.User{
            Email:        input.Email,
            Name:         input.Name,
            PasswordHash: string(hash),
            Role:         input.Role,
        }

        if err := db.Create(&user).Error; err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": "Email already exists"})
            return
        }

        // Create wallet for all users
        wallet := models.Wallet{
            UserID:   user.ID,
            Balance:  0,
            Currency: "NRS",
        }
        db.Create(&wallet)

        // Create free subscription for creators
        if user.Role == "creator" {
            sub := models.Subscription{
                UserID:    user.ID,
                Plan:      "free",
                Status:    "active",
                StartedAt: time.Now(),
            }
            db.Create(&sub)
        }

        token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
            "userID": user.ID,
            "role":   user.Role,
            "exp":    time.Now().Add(time.Hour * 24).Unix(),
        })

        tokenString, err := token.SignedString(config.JWTSecret)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
            return
        }

        c.JSON(http.StatusCreated, gin.H{
            "token": tokenString,
            "user": gin.H{
                "id":    user.ID,
                "email": user.Email,
                "name":  user.Name,
                "role":  user.Role,
            },
        })
    }
}

func Login(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        var input struct {
            Email    string `json:"email" binding:"required,email"`
            Password string `json:"password" binding:"required"`
        }

        if err := c.ShouldBindJSON(&input); err != nil {
            c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
            return
        }

        var user models.User
        if err := db.Where("email = ?", input.Email).First(&user).Error; err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
            return
        }

        if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
            return
        }

        token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
            "userID": user.ID,
            "role":   user.Role,
            "exp":    time.Now().Add(time.Hour * 24).Unix(),
        })

        tokenString, err := token.SignedString(config.JWTSecret)
        if err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
            return
        }

        c.JSON(http.StatusOK, gin.H{
            "token": tokenString,
            "user": gin.H{
                "id":    user.ID,
                "email": user.Email,
                "name":  user.Name,
                "role":  user.Role,
            },
        })
    }
}

// GetMe returns the current authenticated user's profile with wallet & subscription
func GetMe(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, ok := getUserID(c)
        if !ok {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
            return
        }

        var user models.User
        if err := db.Preload("Wallet").Preload("Subscription").First(&user, userID).Error; err != nil {
            c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
            return
        }

        c.JSON(http.StatusOK, gin.H{
            "id":           user.ID,
            "email":        user.Email,
            "name":         user.Name,
            "role":         user.Role,
            "avatar":       user.Avatar,
            "wallet":       user.Wallet,
            "subscription": user.Subscription,
        })
    }
}