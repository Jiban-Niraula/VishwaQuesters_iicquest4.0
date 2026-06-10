package config

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

var JWTSecret []byte

func Init() {
	_ = godotenv.Load()

	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" || secret == "fallback_secret_change_me" || secret == "replace_with_a_long_random_secret" {
		log.Fatal("JWT_SECRET is required. Copy .env.example to .env and set a strong JWT_SECRET.")
	}

	JWTSecret = []byte(secret)
}

func Env(key, fallback string) string {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	return val
}

func EnvFloat(key string, fallback float64) float64 {
	val := strings.TrimSpace(os.Getenv(key))
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

func EnvInt(key string, fallback int) int {
	val := strings.TrimSpace(os.Getenv(key))
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

func CorsOrigins() []string {
	raw := Env("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:3000")
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			origins = append(origins, p)
		}
	}
	return origins
}
