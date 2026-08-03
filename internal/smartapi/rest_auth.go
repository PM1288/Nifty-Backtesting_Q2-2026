package smartapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"trading-stack/internal/config"
)

type AuthTokens struct {
	AccessToken  string
	FeedToken    string
	RefreshToken string
}

type loginRequest struct {
	ClientCode string `json:"clientcode"`
	Password   string `json:"password"`
	TOTP       string `json:"totp"`
}

type loginResponse struct {
	Status bool `json:"status"`
	Data   struct {
		JWTToken     string `json:"jwtToken"`
		FeedToken    string `json:"feedToken"`
		RefreshToken string `json:"refreshToken"`
	} `json:"data"`
	Message string `json:"message"`
}

func Login(ctx context.Context, cfg config.SmartAPIConfig, timeout time.Duration) (AuthTokens, error) {
	if cfg.AccessToken != "" && cfg.FeedToken != "" {
		return AuthTokens{AccessToken: cfg.AccessToken, FeedToken: cfg.FeedToken}, nil
	}
	return loginFresh(ctx, cfg, timeout)
}

func loginFresh(ctx context.Context, cfg config.SmartAPIConfig, timeout time.Duration) (AuthTokens, error) {
	totpValue, err := resolveTOTPValue(cfg, time.Now())
	if err != nil {
		return AuthTokens{}, err
	}

	password := selectLoginPassword(cfg)

	payload := loginRequest{
		ClientCode: cfg.ClientCode,
		Password:   password,
		TOTP:       totpValue,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return AuthTokens{}, fmt.Errorf("encode login payload: %w", err)
	}

	client := &http.Client{Timeout: timeout}
	url := cfg.RestBaseURL + "/rest/auth/angelbroking/user/v1/loginByPassword"
	req, err := newRequest(ctx, cfg, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return AuthTokens{}, fmt.Errorf("build login request: %w", err)
	}
	headers := buildHeaders(cfg.APIKey)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return AuthTokens{}, fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return AuthTokens{}, fmt.Errorf("read login response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return AuthTokens{}, fmt.Errorf("login status %s: %s", resp.Status, string(raw))
	}

	var parsed loginResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return AuthTokens{}, fmt.Errorf("parse login response: %w", err)
	}
	if !parsed.Status {
		return AuthTokens{}, fmt.Errorf("login failed: %s", parsed.Message)
	}
	if parsed.Data.JWTToken == "" || parsed.Data.FeedToken == "" {
		return AuthTokens{}, fmt.Errorf("login missing tokens")
	}
	return AuthTokens{
		AccessToken:  parsed.Data.JWTToken,
		FeedToken:    parsed.Data.FeedToken,
		RefreshToken: parsed.Data.RefreshToken,
	}, nil
}

var sixDigitCode = regexp.MustCompile(`^\d{6}$`)

func selectLoginPassword(cfg config.SmartAPIConfig) string {
	password := strings.TrimSpace(cfg.MPIN)
	if password == "" {
		password = strings.TrimSpace(cfg.Password)
	}
	return password
}

func resolveTOTPValue(cfg config.SmartAPIConfig, now time.Time) (string, error) {
	if code := strings.TrimSpace(cfg.TOTPCode); code != "" {
		if !sixDigitCode.MatchString(code) {
			return "", fmt.Errorf("totp_code must be a 6-digit value")
		}
		return code, nil
	}
	if raw := strings.TrimSpace(cfg.TOTPSecret); raw != "" {
		if sixDigitCode.MatchString(raw) {
			return raw, nil
		}
		value, err := generateTOTP(raw, now)
		if err != nil {
			return "", fmt.Errorf("totp generation failed: %w", err)
		}
		return value, nil
	}
	return "", nil
}

func buildHeaders(apiKey string) map[string]string {
	localIP := resolveLocalIP()
	publicIP := resolvePublicIP(localIP)
	mac := resolveMAC()
	return map[string]string{
		"X-PrivateKey":     apiKey,
		"X-UserType":       "USER",
		"X-SourceID":       "WEB",
		"X-ClientLocalIP":  localIP,
		"X-ClientPublicIP": publicIP,
		"X-MACAddress":     mac,
	}
}

func resolveLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok {
			if ipnet.IP == nil || ipnet.IP.IsLoopback() {
				continue
			}
			if ip := ipnet.IP.To4(); ip != nil {
				return ip.String()
			}
		}
	}
	return "127.0.0.1"
}

func resolvePublicIP(fallback string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.ipify.org", nil)
	if err != nil {
		return fallback
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fallback
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fallback
	}
	ip := string(bytes.TrimSpace(raw))
	if ip == "" {
		return fallback
	}
	return ip
}

func resolveMAC() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "00:00:00:00:00:00"
	}
	for _, iface := range ifaces {
		if len(iface.HardwareAddr) == 0 {
			continue
		}
		return iface.HardwareAddr.String()
	}
	return "00:00:00:00:00:00"
}

func generateTOTP(secret string, now time.Time) (string, error) {
	secret = strings.ReplaceAll(strings.ToUpper(secret), " ", "")
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return "", err
	}
	counter := uint64(now.Unix() / 30)
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, key)
	if _, err := mac.Write(buf[:]); err != nil {
		return "", err
	}
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (int(sum[offset])&0x7f)<<24 |
		(int(sum[offset+1])&0xff)<<16 |
		(int(sum[offset+2])&0xff)<<8 |
		(int(sum[offset+3]) & 0xff)
	code = code % 1000000
	return fmt.Sprintf("%06d", code), nil
}

func HashToken(value string) string {
	sum := sha1.Sum([]byte(value))
	return hex.EncodeToString(sum[:])
}
