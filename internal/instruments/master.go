package instruments

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Instrument struct {
	Exchange       string
	SymbolToken    string
	TradingSymbol  string
	Name           string
	InstrumentType string
	Expiry         *time.Time
	Strike         *float64
	LotSize        *int
	TickSize       *float64
	Raw            json.RawMessage
}

type masterRecord struct {
	Token          string `json:"token"`
	Symbol         string `json:"symbol"`
	Name           string `json:"name"`
	Expiry         string `json:"expiry"`
	Strike         string `json:"strike"`
	LotSize        string `json:"lotsize"`
	InstrumentType string `json:"instrumenttype"`
	ExchangeSeg    string `json:"exch_seg"`
	TickSize       string `json:"tick_size"`
}

func LoadOrDownload(ctx context.Context, cachePath, url string, client *http.Client) ([]Instrument, error) {
	if cachePath == "" {
		return nil, fmt.Errorf("cache path is required")
	}
	if url == "" {
		return nil, fmt.Errorf("instrument master url is required")
	}

	if fresh(cachePath, 24*time.Hour) {
		return loadFromFile(cachePath)
	}

	if err := downloadToFile(ctx, cachePath, url, client); err != nil {
		if os.IsNotExist(err) {
			return nil, err
		}
		// fallback to existing cache if download fails
		if _, statErr := os.Stat(cachePath); statErr == nil {
			return loadFromFile(cachePath)
		}
		return nil, err
	}
	return loadFromFile(cachePath)
}

func fresh(path string, maxAge time.Duration) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return time.Since(info.ModTime()) <= maxAge
}

func loadFromFile(path string) ([]Instrument, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read master: %w", err)
	}
	var records []masterRecord
	if err := json.Unmarshal(raw, &records); err != nil {
		return nil, fmt.Errorf("parse master: %w", err)
	}
	instruments := make([]Instrument, 0, len(records))
	for _, rec := range records {
		normalized, err := normalizeRecord(rec)
		if err != nil {
			continue
		}
		payload, _ := json.Marshal(rec)
		normalized.Raw = payload
		instruments = append(instruments, normalized)
	}
	return instruments, nil
}

func normalizeRecord(rec masterRecord) (Instrument, error) {
	inst := Instrument{
		Exchange:       strings.TrimSpace(rec.ExchangeSeg),
		SymbolToken:    strings.TrimSpace(rec.Token),
		TradingSymbol:  strings.TrimSpace(rec.Symbol),
		Name:           strings.TrimSpace(rec.Name),
		InstrumentType: strings.TrimSpace(rec.InstrumentType),
	}
	if inst.Exchange == "" || inst.SymbolToken == "" || inst.TradingSymbol == "" {
		return Instrument{}, fmt.Errorf("missing required fields")
	}
	if ts := strings.TrimSpace(rec.TickSize); ts != "" {
		if v, err := strconv.ParseFloat(ts, 64); err == nil {
			inst.TickSize = &v
		}
	}
	if ls := strings.TrimSpace(rec.LotSize); ls != "" {
		if v, err := strconv.Atoi(strings.Split(ls, ".")[0]); err == nil {
			inst.LotSize = &v
		}
	}
	if strike := strings.TrimSpace(rec.Strike); strike != "" {
		if v, err := strconv.ParseFloat(strike, 64); err == nil {
			if strings.HasPrefix(strings.ToUpper(inst.InstrumentType), "OPT") {
				v = v / 100
			}
			inst.Strike = &v
		}
	}
	if expiry := strings.TrimSpace(rec.Expiry); expiry != "" {
		if t, err := parseExpiry(expiry); err == nil {
			inst.Expiry = &t
		}
	}
	return inst, nil
}

func parseExpiry(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, fmt.Errorf("empty expiry")
	}
	candidates := []string{trimmed, strings.ToUpper(trimmed)}
	cleaned := strings.ToUpper(strings.NewReplacer("-", "", "/", "", "_", "").Replace(trimmed))
	if cleaned != trimmed {
		candidates = append(candidates, cleaned)
	}
	for _, candidate := range candidates {
		if t, ok := parseDDMonYYYY(candidate); ok {
			return t, nil
		}
	}
	formats := []string{"02JAN2006", "02Jan2006", "2006-01-02", "02-01-2006", "20060102"}
	for _, candidate := range candidates {
		for _, f := range formats {
			if t, err := time.Parse(f, candidate); err == nil {
				return t, nil
			}
		}
	}
	return time.Time{}, fmt.Errorf("unsupported expiry format")
}

func parseDDMonYYYY(value string) (time.Time, bool) {
	if len(value) != 9 {
		return time.Time{}, false
	}
	dayStr := value[:2]
	monStr := value[2:5]
	yearStr := value[5:]
	if !isDigits(dayStr) || !isDigits(yearStr) {
		return time.Time{}, false
	}
	monthMap := map[string]time.Month{
		"JAN": time.January,
		"FEB": time.February,
		"MAR": time.March,
		"APR": time.April,
		"MAY": time.May,
		"JUN": time.June,
		"JUL": time.July,
		"AUG": time.August,
		"SEP": time.September,
		"OCT": time.October,
		"NOV": time.November,
		"DEC": time.December,
	}
	month, ok := monthMap[strings.ToUpper(monStr)]
	if !ok {
		return time.Time{}, false
	}
	day, err := strconv.Atoi(dayStr)
	if err != nil {
		return time.Time{}, false
	}
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		return time.Time{}, false
	}
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC), true
}

func isDigits(value string) bool {
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return value != ""
}

func downloadToFile(ctx context.Context, path, url string, client *http.Client) error {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download master: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download master status: %s", resp.Status)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("mkdir cache dir: %w", err)
	}
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("close temp file: %w", err)
	}
	return os.Rename(tmp, path)
}
