package smartapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"trading-stack/internal/config"
)

type TokenProvider interface {
	Tokens(ctx context.Context) (AuthTokens, error)
	Refresh(ctx context.Context, reason string) (AuthTokens, error)
}

type tokenManager struct {
	cfg     config.SmartAPIConfig
	timeout time.Duration
	static  bool

	mu     sync.RWMutex
	tokens AuthTokens

	refreshGroup singleflight.Group
}

type APIError struct {
	Op         string
	Message    string
	Body       string
	StatusCode int
	Auth       bool
	Throttled  bool
}

func (e *APIError) Error() string {
	if e == nil {
		return ""
	}
	if e.StatusCode > 0 && e.Message != "" {
		return fmt.Sprintf("%s failed (%d): %s", e.Op, e.StatusCode, e.Message)
	}
	if e.Message != "" {
		return fmt.Sprintf("%s failed: %s", e.Op, e.Message)
	}
	if e.Body != "" {
		return fmt.Sprintf("%s failed: %s", e.Op, e.Body)
	}
	return fmt.Sprintf("%s failed", e.Op)
}

type apiEnvelope struct {
	Status    bool            `json:"status"`
	Message   string          `json:"message"`
	ErrorCode string          `json:"errorcode"`
	Data      json.RawMessage `json:"data"`
}

func NewTokenProvider(ctx context.Context, cfg config.SmartAPIConfig, timeout time.Duration) (TokenProvider, error) {
	manager := &tokenManager{
		cfg:     cfg,
		timeout: timeout,
		static:  strings.TrimSpace(cfg.AccessToken) != "" && strings.TrimSpace(cfg.FeedToken) != "",
	}

	tokens, err := Login(ctx, cfg, timeout)
	if err != nil {
		return nil, err
	}
	manager.setTokens(tokens)
	return manager, nil
}

func (m *tokenManager) Tokens(context.Context) (AuthTokens, error) {
	m.mu.RLock()
	tokens := m.tokens
	m.mu.RUnlock()
	if strings.TrimSpace(tokens.AccessToken) == "" || strings.TrimSpace(tokens.FeedToken) == "" {
		return AuthTokens{}, fmt.Errorf("smartapi tokens unavailable")
	}
	return tokens, nil
}

func (m *tokenManager) Refresh(ctx context.Context, reason string) (AuthTokens, error) {
	if m.static {
		return AuthTokens{}, fmt.Errorf("smartapi token refresh unavailable for static access/feed tokens")
	}
	v, err, _ := m.refreshGroup.Do("smartapi-refresh", func() (any, error) {
		tokens, err := loginFresh(ctx, m.cfg, m.timeout)
		if err != nil {
			return AuthTokens{}, fmt.Errorf("smartapi re-login failed (%s): %w", reason, err)
		}
		m.setTokens(tokens)
		return tokens, nil
	})
	if err != nil {
		return AuthTokens{}, err
	}
	tokens, _ := v.(AuthTokens)
	return tokens, nil
}

func (m *tokenManager) setTokens(tokens AuthTokens) {
	m.mu.Lock()
	m.tokens = tokens
	m.mu.Unlock()
}

func withAuthRetry[T any](ctx context.Context, provider TokenProvider, reason string, fn func(AuthTokens) (T, error)) (T, error) {
	var zero T
	tokens, err := provider.Tokens(ctx)
	if err != nil {
		return zero, err
	}
	result, err := fn(tokens)
	if err == nil || !IsAuthError(err) {
		return result, err
	}
	if _, refreshErr := provider.Refresh(ctx, reason); refreshErr != nil {
		return zero, fmt.Errorf("%w; refresh failed: %v", err, refreshErr)
	}
	tokens, err = provider.Tokens(ctx)
	if err != nil {
		return zero, err
	}
	return fn(tokens)
}

func parseAPIEnvelope(label string, statusCode int, raw []byte) (apiEnvelope, error) {
	var envelope apiEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return apiEnvelope{}, &APIError{
			Op:         label,
			StatusCode: statusCode,
			Message:    fmt.Sprintf("parse response: %v", err),
			Body:       strings.TrimSpace(string(raw)),
			Auth:       statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden,
		}
	}
	if statusCode >= 200 && statusCode < 300 && envelope.Status {
		return envelope, nil
	}
	errMessage := strings.TrimSpace(envelope.Message)
	if errMessage == "" {
		errMessage = strings.TrimSpace(string(raw))
	}
	return apiEnvelope{}, &APIError{
		Op:         label,
		StatusCode: statusCode,
		Message:    errMessage,
		Body:       strings.TrimSpace(string(raw)),
		Auth:       statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden || isAuthFailureMessage(errMessage),
		Throttled:  statusCode == http.StatusTooManyRequests || isThrottleMessage(errMessage),
	}
}

func IsAuthError(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Auth
	}
	if err == nil {
		return false
	}
	return isAuthFailureMessage(err.Error())
}

func isAuthFailureMessage(message string) bool {
	message = strings.ToLower(strings.TrimSpace(message))
	if message == "" {
		return false
	}
	return strings.Contains(message, "invalid token") ||
		strings.Contains(message, "token expired") ||
		strings.Contains(message, "jwt") ||
		strings.Contains(message, "session expired") ||
		strings.Contains(message, "access denied") ||
		strings.Contains(message, "unauthorized")
}

func isThrottleMessage(message string) bool {
	message = strings.ToLower(strings.TrimSpace(message))
	if message == "" {
		return false
	}
	return strings.Contains(message, "throttle") ||
		strings.Contains(message, "rate limit") ||
		strings.Contains(message, "too many request")
}
