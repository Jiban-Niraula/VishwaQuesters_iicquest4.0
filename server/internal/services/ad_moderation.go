package services

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"time"
)

type AdModerationInput struct {
	Title           string
	Type            string
	MediaURL        string
	FileName        string
	ContentType     string
	FileSize        int64
	DurationSeconds int
}

type AdModerationResult struct {
	Status    string    `json:"status"` // approved | pending
	RiskScore float64   `json:"riskScore"`
	Reason    string    `json:"reason"`
	Labels    []string  `json:"labels"`
	Provider  string    `json:"provider"`
	CheckedAt time.Time `json:"checkedAt"`
}

func ModerateAd(input AdModerationInput) AdModerationResult {
	now := time.Now()

	score := 0.0
	labels := []string{}
	reasons := []string{}

	title := strings.ToLower(strings.TrimSpace(input.Title))
	mediaURL := strings.ToLower(strings.TrimSpace(input.MediaURL))
	fileName := strings.ToLower(strings.TrimSpace(input.FileName))
	contentType := strings.ToLower(strings.TrimSpace(input.ContentType))
	adType := strings.ToLower(strings.TrimSpace(input.Type))

	fullText := title + " " + mediaURL + " " + fileName

	if strings.TrimSpace(input.Title) == "" {
		score += 20
		labels = append(labels, "missing_title")
		reasons = append(reasons, "Ad title is missing.")
	}

	if adType != "image" && adType != "video" {
		score += 80
		labels = append(labels, "invalid_ad_type")
		reasons = append(reasons, "Ad type must be image or video.")
	}

	if adType == "video" && input.DurationSeconds <= 0 {
		score += 25
		labels = append(labels, "missing_video_duration")
		reasons = append(reasons, "Video ad duration is missing.")
	}

	if input.FileSize > 100*1024*1024 {
		score += 60
		labels = append(labels, "file_too_large")
		reasons = append(reasons, "Uploaded media file is larger than 100MB.")
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	if adType == "image" && fileName != "" {
		if !inList(ext, []string{".jpg", ".jpeg", ".png", ".webp", ".gif"}) {
			score += 50
			labels = append(labels, "suspicious_image_extension")
			reasons = append(reasons, "Image ad file extension is not in the allowed list.")
		}
	}

	if adType == "video" && fileName != "" {
		if !inList(ext, []string{".mp4", ".webm", ".mov"}) {
			score += 50
			labels = append(labels, "suspicious_video_extension")
			reasons = append(reasons, "Video ad file extension is not in the allowed list.")
		}
	}

	if contentType != "" {
		if adType == "image" && !strings.HasPrefix(contentType, "image/") {
			score += 35
			labels = append(labels, "content_type_mismatch")
			reasons = append(reasons, "Uploaded file content type does not match image ad.")
		}

		if adType == "video" && !strings.HasPrefix(contentType, "video/") {
			score += 35
			labels = append(labels, "content_type_mismatch")
			reasons = append(reasons, "Uploaded file content type does not match video ad.")
		}
	}

	riskyKeywords := map[string]string{
		"casino":            "gambling",
		"betting":           "gambling",
		"bet ":              "gambling",
		"lottery":           "gambling",
		"alcohol":           "restricted_product",
		"beer":              "restricted_product",
		"wine":              "restricted_product",
		"vodka":             "restricted_product",
		"whisky":            "restricted_product",
		"vape":              "restricted_product",
		"cigarette":         "restricted_product",
		"tobacco":           "restricted_product",
		"weapon":            "restricted_product",
		"gun":               "restricted_product",
		"adult":             "adult_content",
		"nsfw":              "adult_content",
		"drug":              "restricted_product",
		"weed":              "restricted_product",
		"crypto scam":       "financial_risk",
		"guaranteed profit": "financial_risk",
	}

	seenLabels := map[string]bool{}
	for keyword, label := range riskyKeywords {
		if strings.Contains(fullText, keyword) {
			score += 35
			if !seenLabels[label] {
				labels = append(labels, label)
				seenLabels[label] = true
			}
			reasons = append(reasons, "Detected risky keyword/category: "+label+".")
		}
	}

	if score == 0 {
		labels = append(labels, "safe")
		reasons = append(reasons, "No unsafe category was detected by AI moderation.")
	}

	if score > 100 {
		score = 100
	}

	status := "approved"
	if score >= 30 {
		status = "pending"
	}

	return AdModerationResult{
		Status:    status,
		RiskScore: roundModerationScore(score),
		Reason:    strings.Join(uniqueStrings(reasons), " "),
		Labels:    uniqueStrings(labels),
		Provider:  "local-ai-moderator",
		CheckedAt: now,
	}
}

func ModerationLabelsJSON(labels []string) string {
	b, err := json.Marshal(labels)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func inList(value string, items []string) bool {
	for _, item := range items {
		if value == item {
			return true
		}
	}
	return false
}

func uniqueStrings(items []string) []string {
	seen := map[string]bool{}
	out := []string{}

	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
	}

	return out
}

func roundModerationScore(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
