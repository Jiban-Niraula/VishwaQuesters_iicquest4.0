package models

import (
	"time"

	"gorm.io/gorm"
)

// ──────────────── USER ────────────────

type User struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	Email        string `gorm:"uniqueIndex;not null" json:"email"`
	Name         string `gorm:"not null" json:"name"`
	PasswordHash string `gorm:"not null" json:"-"`
	Role         string `gorm:"not null;default:'creator'" json:"role"` // creator | company | admin
	Avatar       string `json:"avatar,omitempty"`

	Wallet       *Wallet       `gorm:"foreignKey:UserID" json:"wallet,omitempty"`
	Subscription *Subscription `gorm:"foreignKey:UserID" json:"subscription,omitempty"`
	Events       []Event       `gorm:"foreignKey:CreatorID" json:"events,omitempty"`
	Ads          []Ad          `gorm:"foreignKey:CompanyID" json:"ads,omitempty"`
	AdPlacements []AdPlacement `gorm:"foreignKey:CreatorID" json:"adPlacements,omitempty"`

	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ──────────────── WALLET ────────────────

type Wallet struct {
	ID     uint  `gorm:"primaryKey" json:"id"`
	UserID uint  `gorm:"uniqueIndex;not null" json:"userId"`
	User   *User `gorm:"foreignKey:UserID" json:"-"`

	Balance  float64 `gorm:"not null;default:0" json:"balance"`
	Currency string  `gorm:"not null;default:'NRS'" json:"currency"`

	Transactions []Transaction `gorm:"foreignKey:WalletID" json:"transactions,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ──────────────── TRANSACTION ────────────────

type Transaction struct {
	ID       uint    `gorm:"primaryKey" json:"id"`
	WalletID uint    `gorm:"index;not null" json:"walletId"`
	Wallet   *Wallet `gorm:"foreignKey:WalletID" json:"-"`

	Type        string  `gorm:"not null" json:"type"` // deposit | charge | credit | commission | subscription
	Amount      float64 `gorm:"not null" json:"amount"`
	Description string  `gorm:"type:text" json:"description"`

	ReferenceType string `json:"referenceType,omitempty"` // Ad | AdPlacement | Subscription
	ReferenceID   uint   `json:"referenceId,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
}

// ──────────────── SUBSCRIPTION ────────────────

type Subscription struct {
	ID     uint  `gorm:"primaryKey" json:"id"`
	UserID uint  `gorm:"uniqueIndex;not null" json:"userId"`
	User   *User `gorm:"foreignKey:UserID" json:"-"`

	Plan   string `gorm:"not null;default:'free'" json:"plan"`     // free | pro
	Status string `gorm:"not null;default:'active'" json:"status"` // active | expired | cancelled

	StartedAt time.Time  `gorm:"not null" json:"startedAt"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ──────────────── EVENT ────────────────

type Event struct {
	ID        uint  `gorm:"primaryKey" json:"id"`
	CreatorID uint  `gorm:"index;not null" json:"creatorId"`
	Creator   *User `gorm:"foreignKey:CreatorID" json:"-"`

	Title       string `gorm:"not null" json:"title"`
	Description string `gorm:"type:text" json:"description,omitempty"`
	Code        string `gorm:"uniqueIndex;not null" json:"code"`
	IsLive      bool   `gorm:"default:false" json:"isLive"`
	CameraCount int    `gorm:"default:0" json:"cameraCount"`
	ViewerCount int    `gorm:"default:0" json:"viewerCount"`

	AdPlacements []AdPlacement       `gorm:"foreignKey:EventID" json:"adPlacements,omitempty"`
	Destinations []StreamDestination `gorm:"foreignKey:EventID" json:"destinations,omitempty"`

	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ──────────────── STREAM DESTINATION ────────────────

type StreamDestination struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	EventID uint   `gorm:"index;not null" json:"eventId"`
	Event   *Event `gorm:"foreignKey:EventID" json:"-"`

	Platform  string `gorm:"not null" json:"platform"`
	StreamKey string `gorm:"not null" json:"streamKey"`
	ServerURL string `gorm:"not null" json:"serverUrl"`
	IsActive  bool   `gorm:"default:false" json:"isActive"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ──────────────── AD ────────────────

type Ad struct {
	ID        uint  `gorm:"primaryKey" json:"id"`
	CompanyID uint  `gorm:"index;not null" json:"companyId"`
	Company   *User `gorm:"foreignKey:CompanyID" json:"company,omitempty"`

	Title           string `gorm:"not null" json:"title"`
	Type            string `gorm:"not null" json:"type"` // image | video
	MediaURL        string `gorm:"not null" json:"mediaUrl"`
	DurationSeconds int    `gorm:"default:0" json:"durationSeconds"` // 0 for image
	ThumbnailURL    string `json:"thumbnailUrl,omitempty"`

	Status string `gorm:"not null;default:'pending'" json:"status"` // pending | approved | rejected

	ChargeAmount      float64 `gorm:"not null;default:0" json:"chargeAmount"`
	AdminCommission   float64 `gorm:"not null;default:0" json:"adminCommission"`
	CreatorPayoutPro  float64 `gorm:"not null;default:0" json:"creatorPayoutPro"`
	CreatorPayoutFree float64 `gorm:"not null;default:0" json:"creatorPayoutFree"`

	AdPlacements []AdPlacement `gorm:"foreignKey:AdID" json:"adPlacements,omitempty"`

	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// ──────────────── AD PLACEMENT ────────────────

type AdPlacement struct {
	ID   uint `gorm:"primaryKey" json:"id"`
	AdID uint `gorm:"index;not null" json:"adId"`
	Ad   *Ad  `gorm:"foreignKey:AdID" json:"ad,omitempty"`

	CreatorID uint  `gorm:"index;not null" json:"creatorId"`
	Creator   *User `gorm:"foreignKey:CreatorID" json:"-"`

	EventID uint   `gorm:"index" json:"eventId,omitempty"`
	Event   *Event `gorm:"foreignKey:EventID" json:"-"`

	Status string `gorm:"not null;default:'available'" json:"status"` // available | playing | completed

	EarnedAmount float64 `gorm:"not null;default:0" json:"earnedAmount"`
	CreatorTier  string  `gorm:"not null" json:"creatorTier"` // free | pro

	PlayedAt *time.Time `json:"playedAt,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ──────────────── OVERLAY ────────────────

type Overlay struct {
	ID     uint  `gorm:"primaryKey" json:"id"`
	UserID uint  `gorm:"index;not null" json:"userId"`
	User   *User `gorm:"foreignKey:UserID" json:"-"`

	Name    string `gorm:"not null" json:"name"`
	Type    string `gorm:"not null" json:"type"`
	Content string `gorm:"type:text" json:"content"`

	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
