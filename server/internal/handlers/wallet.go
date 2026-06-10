package handlers

import (
    "net/http"
    "time"

    "server/internal/models"

    "github.com/gin-gonic/gin"
)

// GetWalletBalance returns the authenticated user's wallet balance
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

    c.JSON(http.StatusOK, gin.H{
        "balance":  wallet.Balance,
        "currency": wallet.Currency,
        "walletId": wallet.ID,
    })
}

// DepositToWallet adds funds to the authenticated user's wallet
// In production, this would integrate with Khalti/eSewa payment gateway
func DepositToWallet(c *gin.Context) {
    userID, ok := getUserID(c)
    if !ok {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    var input struct {
        Amount        float64 `json:"amount" binding:"required,gt=0"`
        PaymentMethod string  `json:"payment_method" binding:"required,oneof=khalti esewa manual"`
        PaymentRef    string  `json:"payment_ref"` // reference from payment gateway
    }

    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    wallet, err := getOrCreateWallet(userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get wallet"})
        return
    }

    // TODO: Verify payment with Khalti/eSewa API before crediting
    // For now, we trust the deposit (admin can also manually deposit)

    // Credit wallet
    newBalance := wallet.Balance + input.Amount
    if err := db.Model(&wallet).Update("balance", newBalance).Error; err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update wallet"})
        return
    }

    // Record transaction
    transaction := models.Transaction{
        WalletID:    wallet.ID,
        Type:        "deposit",
        Amount:      input.Amount,
        Description: "Deposit via " + input.PaymentMethod + " ref:" + input.PaymentRef,
    }
    db.Create(&transaction)

    c.JSON(http.StatusOK, gin.H{
        "balance":     newBalance,
        "currency":    wallet.Currency,
        "transaction": transaction,
    })
}

// GetTransactions returns the authenticated user's transaction history
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

    c.JSON(http.StatusOK, gin.H{
        "transactions": transactions,
        "balance":      wallet.Balance,
        "currency":     wallet.Currency,
    })
}

// ──── Internal wallet operations (used by other handlers) ────

// debitWallet deducts amount from a wallet and records a transaction
func debitWallet(walletID uint, amount float64, txType string, description string, refType string, refID uint) error {
    var wallet models.Wallet
    if err := db.First(&wallet, walletID).Error; err != nil {
        return err
    }

    if wallet.Balance < amount {
        return ErrInsufficientBalance
    }

    newBalance := wallet.Balance - amount
    if err := db.Model(&wallet).Update("balance", newBalance).Error; err != nil {
        return err
    }

    transaction := models.Transaction{
        WalletID:      walletID,
        Type:          txType,
        Amount:        amount,
        Description:   description,
        ReferenceType: refType,
        ReferenceID:   refID,
    }
    db.Create(&transaction)

    return nil
}

// creditWallet adds amount to a wallet and records a transaction
func creditWallet(walletID uint, amount float64, txType string, description string, refType string, refID uint) error {
    var wallet models.Wallet
    if err := db.First(&wallet, walletID).Error; err != nil {
        return err
    }

    newBalance := wallet.Balance + amount
    if err := db.Model(&wallet).Update("balance", newBalance).Error; err != nil {
        return err
    }

    transaction := models.Transaction{
        WalletID:      walletID,
        Type:          txType,
        Amount:        amount,
        Description:   description,
        ReferenceType: refType,
        ReferenceID:   refID,
        CreatedAt:     time.Now(),
    }
    db.Create(&transaction)

    return nil
}

// Custom errors
var ErrInsufficientBalance = &InsufficientBalanceError{}

type InsufficientBalanceError struct{}

func (e *InsufficientBalanceError) Error() string {
    return "Insufficient wallet balance"
}