package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"strings"
	"time"

	"trading-stack/internal/config"
)

type Client struct {
	url               string
	discordURL        string
	timeout           time.Duration
	enabled           bool
	headers           map[string]string
	telegramEnabled   bool
	telegramBotToken  string
	telegramChatID    string
	telegramParseMode string
}

type payload struct {
	Title   string `json:"title"`
	Message string `json:"message"`
}

type discordPayload struct {
	Content string `json:"content"`
}

type telegramPayload struct {
	ChatID                string `json:"chat_id"`
	Text                  string `json:"text"`
	ParseMode             string `json:"parse_mode,omitempty"`
	DisableWebPagePreview bool   `json:"disable_web_page_preview"`
}

func NewClient(cfg config.AlertsConfig) *Client {
	headers := map[string]string{}
	for key, value := range cfg.WebhookHeaders {
		if strings.TrimSpace(key) == "" {
			continue
		}
		headers[key] = value
	}
	return &Client{
		url:               strings.TrimSpace(cfg.WebhookURL),
		discordURL:        strings.TrimSpace(cfg.DiscordWebhookURL),
		timeout:           time.Duration(cfg.WebhookTimeoutSeconds) * time.Second,
		enabled:           cfg.EnableWebhook,
		headers:           headers,
		telegramEnabled:   cfg.TelegramEnable,
		telegramBotToken:  strings.TrimSpace(cfg.TelegramBotToken),
		telegramChatID:    strings.TrimSpace(cfg.TelegramChatID),
		telegramParseMode: strings.TrimSpace(cfg.TelegramParseMode),
	}
}

func (c *Client) Send(ctx context.Context, title, message string) error {
	if c == nil {
		return nil
	}
	webhookEnabled := c.enabled && (c.url != "" || c.discordURL != "")
	if !webhookEnabled && !c.telegramEnabled {
		return nil
	}
	title = stripLegacyD4Prefix(strings.TrimSpace(title))
	message = stripLegacyD4Prefix(strings.TrimSpace(message))
	client := &http.Client{Timeout: c.timeout}
	var firstErr error
	if c.enabled && c.url != "" {
		msg := message
		if len(msg) > 140 {
			msg = msg[:140]
		}
		if err := sendWebhook(ctx, client, c.url, c.headers, payload{Title: title, Message: msg}); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if c.enabled && c.discordURL != "" {
		content := strings.TrimSpace(title)
		if content != "" {
			if message != "" {
				content = content + " - " + message
			}
		} else {
			content = message
		}
		if len(content) > 1900 {
			content = content[:1900]
		}
		if err := sendWebhook(ctx, client, c.discordURL, nil, discordPayload{Content: content}); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if c.telegramEnabled && c.telegramBotToken != "" && c.telegramChatID != "" {
		body := telegramPayload{
			ChatID:                c.telegramChatID,
			Text:                  buildTelegramContent(title, message),
			ParseMode:             c.telegramParseMode,
			DisableWebPagePreview: true,
		}
		url := "https://api.telegram.org/bot" + c.telegramBotToken + "/sendMessage"
		if err := sendWebhook(ctx, client, url, nil, body); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func stripLegacyD4Prefix(value string) string {
	clean := strings.TrimSpace(value)
	clean = strings.TrimPrefix(clean, "D4 ")
	clean = strings.TrimPrefix(clean, "D4_")
	clean = strings.TrimPrefix(clean, "D4-")
	return strings.TrimSpace(clean)
}

func sendWebhook(ctx context.Context, client *http.Client, url string, headers map[string]string, body any) error {
	if strings.TrimSpace(url) == "" || client == nil {
		return nil
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		if strings.TrimSpace(key) == "" {
			continue
		}
		req.Header.Set(key, value)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		bodyRaw, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		body := strings.TrimSpace(string(bodyRaw))
		if parsed, parseErr := neturl.Parse(url); parseErr == nil {
			if body != "" {
				return fmt.Errorf("notify %s status %d: %s", parsed.Host, resp.StatusCode, body)
			}
			return fmt.Errorf("notify %s status %d", parsed.Host, resp.StatusCode)
		}
		if body != "" {
			return fmt.Errorf("notify status %d: %s", resp.StatusCode, body)
		}
		return fmt.Errorf("notify status %d", resp.StatusCode)
	}
	return nil
}

func buildTelegramContent(title, message string) string {
	title = strings.TrimSpace(title)
	message = strings.TrimSpace(message)
	if title == "" {
		return message
	}
	if message == "" {
		return title
	}
	return title + "\n" + message
}
