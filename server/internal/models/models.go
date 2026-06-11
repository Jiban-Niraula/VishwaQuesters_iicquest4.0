package models

import (
	"time"

	"gorm.io/gorm"
)

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

type Transaction struct {
	ID       uint    `gorm:"primaryKey" json:"id"`
	WalletID uint    `gorm:"index;not null" json:"walletId"`
	Wallet   *Wallet `gorm:"foreignKey:WalletID" json:"-"`

	Type        string  `gorm:"not null" json:"type"` // deposit | charge | credit | commission | subscription | refund
	Amount      float64 `gorm:"not null" json:"amount"`
	Description string  `gorm:"type:text" json:"description"`

	ReferenceType string `json:"referenceType,omitempty"`
	ReferenceID   uint   `json:"referenceId,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
}

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

type Event struct {
	ID        uint  `gorm:"primaryKey" json:"id"`
	CreatorID uint  `gorm:"index;not null" json:"creatorId"`
	Creator   *User `gorm:"foreignKey:CreatorID" json:"creator,omitempty"`

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

type StreamDestination struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	EventID uint   `gorm:"index;not null" json:"eventId"`
	Event   *Event `gorm:"foreignKey:EventID" json:"event,omitempty"`

	Platform  string `gorm:"not null" json:"platform"`
	StreamKey string `gorm:"not null" json:"-"`
	ServerURL string `gorm:"not null" json:"serverUrl"`
	IsActive  bool   `gorm:"default:false" json:"isActive"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Ad struct {
	ID uint `gorm:"primaryKey" json:"id"`

	CompanyID uint  `gorm:"index;not null" json:"companyId"`
	Company   *User `gorm:"foreignKey:CompanyID" json:"company,omitempty"`

	Title           string `gorm:"not null" json:"title"`
	Type            string `gorm:"not null" json:"type"` // image | video
	MediaURL        string `gorm:"not null" json:"mediaUrl"`
	DurationSeconds int    `gorm:"default:0" json:"durationSeconds"`
	ThumbnailURL    string `json:"thumbnailUrl,omitempty"`

	Status string `gorm:"not null;default:'pending'" json:"status"` // pending | approved | rejected | completed

	// Campaign / pricing fields
	CampaignBudget float64 `gorm:"not null;default:0" json:"campaignBudget"`
	ChargeAmount   float64 `gorm:"not null;default:0" json:"chargeAmount"`
	SpentAmount    float64 `gorm:"not null;default:0" json:"spentAmount"`

	CostPerView       float64 `gorm:"not null;default:0" json:"costPerView"`
	BaseChargePerPlay float64 `gorm:"not null;default:0" json:"baseChargePerPlay"`

	AdminCommission   float64 `gorm:"not null;default:0" json:"adminCommission"`
	CreatorPayoutPro  float64 `gorm:"not null;default:0" json:"creatorPayoutPro"`
	CreatorPayoutFree float64 `gorm:"not null;default:0" json:"creatorPayoutFree"`

	MaxPlays        int     `gorm:"not null;default:1000000" json:"maxPlays"`
	CompletedPlays  int     `gorm:"not null;default:0" json:"completedPlays"`
	RemainingBudget float64 `gorm:"not null;default:0" json:"remainingBudget"`
	EstimatedViews  int     `gorm:"not null;default:0" json:"estimatedViews"`

	PlatformViews int `gorm:"not null;default:0" json:"platformViews"`
	YoutubeViews  int `gorm:"not null;default:0" json:"youtubeViews"`
	FacebookViews int `gorm:"not null;default:0" json:"facebookViews"`
	TotalViews    int `gorm:"not null;default:0" json:"totalViews"`

	// AI moderation fields
	AIModerationStatus string     `gorm:"not null;default:'pending'" json:"aiModerationStatus"` // approved | pending | rejected
	AIRiskScore        float64    `gorm:"not null;default:0" json:"aiRiskScore"`
	AIModerationReason string     `gorm:"type:text" json:"aiModerationReason,omitempty"`
	AIModerationLabels string     `gorm:"type:text" json:"aiModerationLabels,omitempty"` // JSON string
	AIModerationBy     string     `gorm:"not null;default:'local-ai-moderator'" json:"aiModerationBy"`
	AIModeratedAt      *time.Time `json:"aiModeratedAt,omitempty"`

	AdPlacements []AdPlacement `gorm:"foreignKey:AdID" json:"adPlacements,omitempty"`

	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type AdPlacement struct {
	ID   uint `gorm:"primaryKey" json:"id"`
	AdID uint `gorm:"index;not null" json:"adId"`
	Ad   *Ad  `gorm:"foreignKey:AdID" json:"ad,omitempty"`

	CreatorID uint  `gorm:"index;not null" json:"creatorId"`
	Creator   *User `gorm:"foreignKey:CreatorID" json:"-"`

	EventID uint   `gorm:"index" json:"eventId,omitempty"`
	Event   *Event `gorm:"foreignKey:EventID" json:"-"`

	Status string `gorm:"not null;default:'playing'" json:"status"` // playing | completed | cancelled

	CreatorTier    string  `gorm:"not null" json:"creatorTier"` // free | pro
	WatchedSeconds int     `gorm:"default:0" json:"watchedSeconds"`
	EarnedAmount   float64 `gorm:"not null;default:0" json:"earnedAmount"`

	// Analytics for this placement
	PlatformViews int `gorm:"not null;default:0" json:"platformViews"`
	YoutubeViews  int `gorm:"not null;default:0" json:"youtubeViews"`
	FacebookViews int `gorm:"not null;default:0" json:"facebookViews"`
	TotalViews    int `gorm:"not null;default:0" json:"totalViews"`

	// Money split for this placement
	ChargedAmount     float64 `gorm:"not null;default:0" json:"chargedAmount"`
	AdminCommission   float64 `gorm:"not null;default:0" json:"adminCommission"`
	CreatorPayout     float64 `gorm:"not null;default:0" json:"creatorPayout"`
	FreeTierRemainder float64 `gorm:"not null;default:0" json:"freeTierRemainder"`

	PlayedAt    *time.Time `json:"playedAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Overlay struct {
	ID uint `gorm:"primaryKey" json:"id"`

	CreatorID uint  `gorm:"index;not null" json:"creatorId"`
	Creator   *User `gorm:"foreignKey:CreatorID" json:"-"`

	EventID *uint  `gorm:"index" json:"eventId,omitempty"`
	Event   *Event `gorm:"foreignKey:EventID" json:"-"`

	AdID *uint `gorm:"index" json:"adId,omitempty"`
	Ad   *Ad   `gorm:"foreignKey:AdID" json:"ad,omitempty"`

	Title    string `gorm:"not null" json:"title"`
	Type     string `gorm:"not null" json:"type"` // text | image | video | scoreboard | timer | sponsored_ad | ad | replay | video-link
	Content  string `gorm:"type:text" json:"content,omitempty"`
	MediaURL string `json:"mediaUrl,omitempty"`
	Position string `gorm:"not null;default:'top-right'" json:"position"`
	Duration int    `gorm:"not null;default:0" json:"duration"`

	X       float64 `gorm:"default:0" json:"x"`
	Y       float64 `gorm:"default:0" json:"y"`
	Width   float64 `gorm:"default:360" json:"width"`
	Height  float64 `gorm:"default:120" json:"height"`
	Opacity float64 `gorm:"default:1" json:"opacity"`
	ZIndex  int     `gorm:"default:1" json:"zIndex"`

	StyleJSON string `gorm:"type:text" json:"styleJson,omitempty"`
	DataJSON  string `gorm:"type:text" json:"dataJson,omitempty"`

	IsActive bool `gorm:"default:false" json:"isActive"`
	IsGlobal bool `gorm:"default:false" json:"isGlobal"`

	StartedAt *time.Time `json:"startedAt,omitempty"`
	EndedAt   *time.Time `json:"endedAt,omitempty"`

	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type PlatformSetting struct {
	ID uint `gorm:"primaryKey" json:"id"`

	Currency               string  `gorm:"not null;default:'NRS'" json:"currency"`
	ImageAdCharge          float64 `gorm:"not null;default:50" json:"imageAdCharge"`
	VideoAdPerSecond       float64 `gorm:"not null;default:10" json:"videoAdPerSecond"`
	AdminCommissionPercent float64 `gorm:"not null;default:30" json:"adminCommissionPercent"`
	FreeCreatorPayoutPct   float64 `gorm:"not null;default:50" json:"freeCreatorPayoutPercent"`
	ProSubscriptionPrice   float64 `gorm:"not null;default:999" json:"proSubscriptionPrice"`
	FreeCameraLimit        int     `gorm:"not null;default:4" json:"freeCameraLimit"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type PaymentIntent struct {
	ID uint `gorm:"primaryKey" json:"id"`

	UserID uint  `gorm:"index;not null" json:"userId"`
	User   *User `gorm:"foreignKey:UserID" json:"-"`

	WalletID uint    `gorm:"index;not null" json:"walletId"`
	Wallet   *Wallet `gorm:"foreignKey:WalletID" json:"-"`

	Provider        string     `gorm:"not null;default:'esewa'" json:"provider"`
	Purpose         string     `gorm:"not null;default:'wallet_topup'" json:"purpose"`
	PaymentRef      string     `gorm:"uniqueIndex;not null" json:"paymentRef"`
	TransactionUUID string     `gorm:"uniqueIndex;not null" json:"transactionUuid"`
	Amount          float64    `gorm:"not null" json:"amount"`
	Currency        string     `gorm:"not null;default:'NRS'" json:"currency"`
	Status          string     `gorm:"not null;default:'initiated'" json:"status"` // initiated | pending | complete | failed | ambiguous | cancelled
	ProviderRef     string     `json:"providerRef,omitempty"`
	RawResponse     string     `gorm:"type:text" json:"rawResponse,omitempty"`
	VerifiedAt      *time.Time `json:"verifiedAt,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
