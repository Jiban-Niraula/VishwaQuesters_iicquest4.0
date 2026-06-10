package handlers

import (
	"errors"
	"net/http"
	"time"

	"server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrInsufficientBalance = errors.New("insufficient wallet balance")

func GetWalletBalance(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	wallet, err := getOrCreateWallet(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get wallet"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"balance": wallet.Balance, "currency": wallet.Currency, "walletId": wallet.ID})
}

func DepositToWallet(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{
		"error":   "Online wallet deposit is not enabled yet.",
		"message": "Implement Khalti/eSewa initiate + server-side verify before crediting wallet. Use admin manual deposit for local testing.",
	})
}

func GetTransactions(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	wallet, err := getOrCreateWallet(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get wallet"})
		return
	}

	var transactions []models.Transaction
	db.Where("wallet_id = ?", wallet.ID).Order("created_at DESC").Find(&transactions)

	c.JSON(http.StatusOK, gin.H{"transactions": transactions, "balance": wallet.Balance, "currency": wallet.Currency})
}

func debitWallet(walletID uint, amount float64, txType string, description string, refType string, refID uint) error {
	return db.Transaction(func(tx *gorm.DB) error {
		return debitWalletWithDB(tx, walletID, amount, txType, description, refType, refID)
	})
}

func creditWallet(walletID uint, amount float64, txType string, description string, refType string, refID uint) error {
	return db.Transaction(func(tx *gorm.DB) error {
		return creditWalletWithDB(tx, walletID, amount, txType, description, refType, refID)
	})
}

func debitWalletWithDB(tx *gorm.DB, walletID uint, amount float64, txType string, description string, refType string, refID uint) error {
	if amount <= 0 {
		return nil
	}

	var wallet models.Wallet
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&wallet, walletID).Error; err != nil {
		return err
	}

	if wallet.Balance < amount {
		return ErrInsufficientBalance
	}

	wallet.Balance -= amount
	if err := tx.Model(&wallet).Update("balance", wallet.Balance).Error; err != nil {
		return err
	}

	transaction := models.Transaction{WalletID: walletID, Type: txType, Amount: amount, Description: description, ReferenceType: refType, ReferenceID: refID, CreatedAt: time.Now()}
	return tx.Create(&transaction).Error
}

func creditWalletWithDB(tx *gorm.DB, walletID uint, amount float64, txType string, description string, refType string, refID uint) error {
	if amount <= 0 {
		return nil
	}

	var wallet models.Wallet
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&wallet, walletID).Error; err != nil {
		return err
	}

	wallet.Balance += amount
	if err := tx.Model(&wallet).Update("balance", wallet.Balance).Error; err != nil {
		return err
	}

	transaction := models.Transaction{WalletID: walletID, Type: txType, Amount: amount, Description: description, ReferenceType: refType, ReferenceID: refID, CreatedAt: time.Now()}
	return tx.Create(&transaction).Error
}
