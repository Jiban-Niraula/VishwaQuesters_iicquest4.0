package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"server/internal/config"
	"server/internal/models"
	"server/internal/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	paymentPurposeWalletTopup     = "wallet_topup"
	paymentPurposeSubscriptionPro = "subscription_pro"
)

type esewaSuccessPayload struct {
	TransactionCode string      `json:"transaction_code"`
	Status          string      `json:"status"`
	TotalAmount     interface{} `json:"total_amount"`
	TransactionUUID string      `json:"transaction_uuid"`
	ProductCode     string      `json:"product_code"`
	SignedFields    string      `json:"signed_field_names"`
	Signature       string      `json:"signature"`
}

type esewaStatusResponse struct {
	ProductCode     string      `json:"product_code"`
	TransactionUUID string      `json:"transaction_uuid"`
	TotalAmount     interface{} `json:"total_amount"`
	Status          string      `json:"status"`
	RefID           string      `json:"ref_id"`
	ErrorMessage    string      `json:"error_message"`
}

func InitiateEsewaPayment(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var input struct {
		Amount  float64 `json:"amount" binding:"required"`
		Purpose string  `json:"purpose"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.Amount < 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Minimum top-up amount is NRS 10"})
		return
	}

	purpose := strings.TrimSpace(input.Purpose)
	if purpose == "" {
		purpose = paymentPurposeWalletTopup
	}

	if purpose != paymentPurposeWalletTopup {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported payment purpose for this endpoint"})
		return
	}

	payment, err := createEsewaPaymentIntent(c, userID, input.Amount, paymentPurposeWalletTopup)
	if err != nil {
		writeEsewaInitiateError(c, err)
		return
	}

	c.JSON(http.StatusOK, payment)
}

func InitiateSubscriptionEsewaPayment(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	role, _ := getUserRole(c)
	if role != "creator" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only creators can buy Pro subscription"})
		return
	}

	settings, err := services.GetPlatformSettings(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load platform settings"})
		return
	}

	price := roundAmount(settings.ProSubscriptionPrice)
	if price < 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pro subscription price must be at least NRS 10"})
		return
	}

	payment, err := createEsewaPaymentIntent(c, userID, price, paymentPurposeSubscriptionPro)
	if err != nil {
		writeEsewaInitiateError(c, err)
		return
	}

	payment["purpose"] = paymentPurposeSubscriptionPro
	payment["amount"] = price
	payment["currency"] = settings.Currency
	payment["billingPeriod"] = "month"

	c.JSON(http.StatusOK, payment)
}

func VerifyEsewaPayment(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	encodedData := c.Query("data")
	if encodedData == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing eSewa response data"})
		return
	}

	payloadBytes, err := base64.StdEncoding.DecodeString(encodedData)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid eSewa response data"})
		return
	}

	var payload esewaSuccessPayload
	decoder := json.NewDecoder(bytes.NewReader(payloadBytes))
	decoder.UseNumber()

	if err := decoder.Decode(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid eSewa response payload"})
		return
	}

	productCode := config.Env("ESEWA_PRODUCT_CODE", "EPAYTEST")
	secretKey := config.Env("ESEWA_SECRET_KEY", "")

	if secretKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ESEWA_SECRET_KEY is not configured"})
		return
	}

	if payload.ProductCode != productCode {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product code in eSewa response"})
		return
	}

	if !verifyEsewaResponseSignature(payload, secretKey) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid eSewa response signature"})
		return
	}

	var intent models.PaymentIntent
	if err := db.Where("transaction_uuid = ? AND user_id = ?", payload.TransactionUUID, userID).First(&intent).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment intent not found"})
		return
	}

	if intent.Status == "complete" {
		c.JSON(http.StatusOK, gin.H{
			"message": messageForCompletedPurpose(intent.Purpose),
			"payment": intent,
		})
		return
	}

	statusResp, err := checkEsewaStatus(productCode, intent.TransactionUUID, formatEsewaAmount(intent.Amount))
	if err != nil {
		db.Model(&intent).Updates(map[string]interface{}{
			"status":       "pending",
			"raw_response": string(payloadBytes),
		})

		c.JSON(http.StatusAccepted, gin.H{
			"message": "Payment response received, but status check failed. Try again.",
			"payment": intent,
		})
		return
	}

	if statusResp.Status != "COMPLETE" || payload.Status != "COMPLETE" {
		newStatus := strings.ToLower(statusResp.Status)
		if newStatus == "" {
			newStatus = strings.ToLower(payload.Status)
		}
		if newStatus == "" {
			newStatus = "failed"
		}

		db.Model(&intent).Updates(map[string]interface{}{
			"status":       newStatus,
			"provider_ref": statusResp.RefID,
			"raw_response": string(payloadBytes),
		})

		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "Payment is not complete",
			"status": newStatus,
		})
		return
	}

	now := time.Now()
	var subscriptionExpiresAt *time.Time

	err = db.Transaction(func(tx *gorm.DB) error {
		var locked models.PaymentIntent

		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", intent.ID).
			First(&locked).Error; err != nil {
			return err
		}

		if locked.Status == "complete" {
			intent = locked
			return nil
		}

		switch locked.Purpose {
		case paymentPurposeSubscriptionPro:
			expiresAt, err := activateProSubscriptionWithDB(tx, locked.UserID, now)
			if err != nil {
				return err
			}
			subscriptionExpiresAt = &expiresAt

			var adminUser models.User
			if err := tx.Where("role = ?", "admin").First(&adminUser).Error; err == nil {
				adminWallet, err := getOrCreateWalletWithDB(tx, adminUser.ID)
				if err != nil {
					return err
				}
				if err := creditWalletWithDB(
					tx,
					adminWallet.ID,
					locked.Amount,
					"subscription",
					"Creator Pro subscription direct payment",
					"payment_intent",
					locked.ID,
				); err != nil {
					return err
				}
			}

		case paymentPurposeWalletTopup:
			if err := creditWalletWithDB(
				tx,
				locked.WalletID,
				locked.Amount,
				"deposit",
				"eSewa wallet top-up",
				"payment_intent",
				locked.ID,
			); err != nil {
				return err
			}

		default:
			return fmt.Errorf("unsupported payment purpose: %s", locked.Purpose)
		}

		updates := map[string]interface{}{
			"status":       "complete",
			"provider_ref": firstNonEmpty(statusResp.RefID, payload.TransactionCode),
			"raw_response": string(payloadBytes),
			"verified_at":  &now,
		}

		if err := tx.Model(&locked).Updates(updates).Error; err != nil {
			return err
		}

		return tx.First(&intent, locked.ID).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize payment"})
		return
	}

	response := gin.H{
		"message": messageForCompletedPurpose(intent.Purpose),
		"payment": intent,
	}
	if subscriptionExpiresAt != nil {
		response["subscription"] = gin.H{
			"plan":      "pro",
			"status":    "active",
			"expiresAt": subscriptionExpiresAt,
		}
	}

	c.JSON(http.StatusOK, response)
}

func GetPaymentStatus(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	ref := c.Param("paymentRef")

	var intent models.PaymentIntent
	if err := db.Where("payment_ref = ? AND user_id = ?", ref, userID).First(&intent).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"payment": intent})
}

func createEsewaPaymentIntent(c *gin.Context, userID uint, amount float64, purpose string) (gin.H, error) {
	wallet, err := getOrCreateWallet(userID)
	if err != nil {
		return nil, fmt.Errorf("wallet: %w", err)
	}

	productCode := config.Env("ESEWA_PRODUCT_CODE", "EPAYTEST")
	secretKey := config.Env("ESEWA_SECRET_KEY", "")
	formURL := config.Env("ESEWA_FORM_URL", "https://rc-epay.esewa.com.np/api/epay/main/v2/form")
	frontendURL := strings.TrimRight(config.Env("FRONTEND_URL", "http://localhost:5173"), "/")

	if secretKey == "" {
		return nil, fmt.Errorf("missing_esewa_secret")
	}

	now := time.Now()
	txUUID := fmt.Sprintf("SA-%d-%d", userID, now.UnixNano())
	paymentRef := fmt.Sprintf("PAY-%d-%d", userID, now.UnixNano())
	roundedAmount := roundAmount(amount)
	amountStr := formatEsewaAmount(roundedAmount)

	intent := models.PaymentIntent{
		UserID:          userID,
		WalletID:        wallet.ID,
		Provider:        "esewa",
		Purpose:         purpose,
		PaymentRef:      paymentRef,
		TransactionUUID: txUUID,
		Amount:          roundedAmount,
		Currency:        wallet.Currency,
		Status:          "initiated",
	}

	if err := db.Create(&intent).Error; err != nil {
		return nil, fmt.Errorf("create_intent: %w", err)
	}

	signedFields := "total_amount,transaction_uuid,product_code"
	message := fmt.Sprintf("total_amount=%s,transaction_uuid=%s,product_code=%s", amountStr, txUUID, productCode)
	signature := hmacSHA256Base64(message, secretKey)

	fields := gin.H{
		"amount":                  amountStr,
		"tax_amount":              "0",
		"total_amount":            amountStr,
		"transaction_uuid":        txUUID,
		"product_code":            productCode,
		"product_service_charge":  "0",
		"product_delivery_charge": "0",
		"success_url":             frontendURL + "/payment/esewa/success",
		"failure_url":             frontendURL + "/payment/esewa/failure",
		"signed_field_names":      signedFields,
		"signature":               signature,
	}

	return gin.H{
		"paymentRef":      paymentRef,
		"transactionUuid": txUUID,
		"formUrl":         formURL,
		"fields":          fields,
	}, nil
}

func writeEsewaInitiateError(c *gin.Context, err error) {
	msg := err.Error()

	if strings.Contains(msg, "missing_esewa_secret") {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ESEWA_SECRET_KEY is not configured"})
		return
	}

	if strings.Contains(msg, "wallet:") {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get wallet"})
		return
	}

	if strings.Contains(msg, "create_intent:") {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment intent"})
		return
	}

	c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to initiate eSewa payment"})
}

func messageForCompletedPurpose(purpose string) string {
	switch purpose {
	case paymentPurposeSubscriptionPro:
		return "Payment verified and Pro subscription activated"
	case paymentPurposeWalletTopup:
		return "Payment verified and wallet credited"
	default:
		return "Payment verified"
	}
}

func verifyEsewaResponseSignature(payload esewaSuccessPayload, secret string) bool {
	fields := strings.Split(payload.SignedFields, ",")
	parts := make([]string, 0, len(fields))

	for _, field := range fields {
		field = strings.TrimSpace(field)

		var value string

		switch field {
		case "transaction_code":
			value = payload.TransactionCode
		case "status":
			value = payload.Status
		case "total_amount":
			value = normalizeAmountValue(payload.TotalAmount)
		case "transaction_uuid":
			value = payload.TransactionUUID
		case "product_code":
			value = payload.ProductCode
		case "signed_field_names":
			value = payload.SignedFields
		default:
			continue
		}

		parts = append(parts, fmt.Sprintf("%s=%s", field, value))
	}

	message := strings.Join(parts, ",")
	expected := hmacSHA256Base64(message, secret)

	return hmac.Equal([]byte(expected), []byte(payload.Signature))
}

func checkEsewaStatus(productCode string, transactionUUID string, totalAmount string) (esewaStatusResponse, error) {
	statusURL := config.Env("ESEWA_STATUS_URL", "https://rc.esewa.com.np/api/epay/transaction/status/")

	u, err := url.Parse(statusURL)
	if err != nil {
		return esewaStatusResponse{}, err
	}

	q := u.Query()
	q.Set("product_code", productCode)
	q.Set("total_amount", totalAmount)
	q.Set("transaction_uuid", transactionUUID)
	u.RawQuery = q.Encode()

	client := &http.Client{Timeout: 15 * time.Second}

	resp, err := client.Get(u.String())
	if err != nil {
		return esewaStatusResponse{}, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return esewaStatusResponse{}, fmt.Errorf("eSewa status check failed: %s", string(body))
	}

	var result esewaStatusResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return esewaStatusResponse{}, err
	}

	if result.ErrorMessage != "" {
		return result, fmt.Errorf(result.ErrorMessage)
	}

	return result, nil
}

func hmacSHA256Base64(message string, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func formatEsewaAmount(amount float64) string {
	return fmt.Sprintf("%.2f", roundAmount(amount))
}

func roundAmount(amount float64) float64 {
	return float64(int(amount*100+0.5)) / 100
}

func normalizeAmountValue(v interface{}) string {
	switch t := v.(type) {
	case float64:
		return formatEsewaAmount(t)
	case json.Number:
		return t.String()
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}

	return ""
}
