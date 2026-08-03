package smartapi

import (
	"context"
	"crypto/tls"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type Tick struct {
	Exchange    string
	Token       string
	LTP         float64
	LastQty     *int64
	CumVolume   *int64
	OI          *int64
	OIChangePct *float64
	Timestamp   time.Time
	AvgPrice    *float64
	TotalBuy    *int64
	TotalSell   *int64
	Open        *float64
	High        *float64
	Low         *float64
	Close       *float64
	LastTrade   *time.Time
	UpperCirc   *float64
	LowerCirc   *float64
	WeekHigh    *float64
	WeekLow     *float64
	DepthBuy    []DepthLevel
	DepthSell   []DepthLevel
}

type Streamer struct {
	cfg        config.SmartAPIConfig
	wsCfg      config.WSConfig
	provider   TokenProvider
	logger     *slog.Logger
	connected  atomic.Bool
	lastTickNs atomic.Int64
	writeMu    sync.Mutex
}

func NewStreamer(cfg config.SmartAPIConfig, wsCfg config.WSConfig, provider TokenProvider, logger *slog.Logger) *Streamer {
	return &Streamer{cfg: cfg, wsCfg: wsCfg, provider: provider, logger: logger}
}

func (s *Streamer) Run(ctx context.Context, subs []store.Subscription, out chan<- Tick) error {
	backoff := time.Second
	maxBackoff := time.Duration(s.wsCfg.MaxReconnectBackoffSeconds) * time.Second

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		conn, err := s.connect(ctx)
		if err != nil {
			s.logWarn("ws_connect_failed", "err", err)
			time.Sleep(backoff)
			backoff = minDuration(maxBackoff, backoff*2)
			continue
		}
		backoff = time.Second

		s.connected.Store(true)
		if err := s.subscribeAll(conn, subs); err != nil {
			s.logWarn("ws_subscribe_failed", "err", err)
			_ = conn.Close()
			s.connected.Store(false)
			continue
		}

		err = s.readLoop(ctx, conn, out)
		s.connected.Store(false)
		_ = conn.Close()
		if err != nil && !errors.Is(err, context.Canceled) {
			s.logWarn("ws_read_loop_exit", "err", err)
		}
	}
}

func (s *Streamer) Connected() bool {
	return s.connected.Load()
}

func (s *Streamer) LastTickAt() time.Time {
	ns := s.lastTickNs.Load()
	if ns == 0 {
		return time.Time{}
	}
	return time.Unix(0, ns)
}

func (s *Streamer) connect(ctx context.Context) (*websocket.Conn, error) {
	tokens, err := s.provider.Tokens(ctx)
	if err != nil {
		return nil, err
	}
	conn, err := s.connectOnce(tokens)
	if err == nil || !IsAuthError(err) {
		return conn, err
	}
	if _, refreshErr := s.provider.Refresh(ctx, "ws_connect"); refreshErr != nil {
		return nil, fmt.Errorf("%w; refresh failed: %v", err, refreshErr)
	}
	tokens, err = s.provider.Tokens(ctx)
	if err != nil {
		return nil, err
	}
	return s.connectOnce(tokens)
}

func (s *Streamer) connectOnce(tokens AuthTokens) (*websocket.Conn, error) {
	auth := strings.TrimSpace(tokens.AccessToken)
	wsHost := ""
	if parsed, err := url.Parse(s.cfg.WSURL); err == nil {
		wsHost = parsed.Hostname()
	}
	origin := ""
	if wsHost != "" {
		origin = "https://" + wsHost
	}

	headers := map[string]string{
		"Authorization": auth,
		"x-api-key":     s.cfg.APIKey,
		"x-client-code": s.cfg.ClientCode,
		"x-feed-token":  tokens.FeedToken,
	}
	if origin != "" {
		headers["Origin"] = origin
	}
	header := make(map[string][]string)
	for k, v := range headers {
		header[k] = []string{v}
	}
	header["User-Agent"] = []string{"smartapi-collector"}

	dialer := websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: 10 * time.Second,
	}
	if s.wsCfg.InsecureSkipVerify {
		serverName := wsHost
		if serverName == "" {
			serverName = "smartapisocket.angelone.in"
		}
		dialer.TLSClientConfig = &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         serverName,
		}
	}
	conn, resp, err := dialer.Dial(s.cfg.WSURL, header)
	if err != nil {
		if resp != nil {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			_ = resp.Body.Close()
			msg := strings.TrimSpace(string(body))
			if msg == "" {
				msg = err.Error()
			}
			return nil, &APIError{
				Op:         "ws_connect",
				StatusCode: resp.StatusCode,
				Message:    msg,
				Body:       msg,
				Auth:       resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || isAuthFailureMessage(msg),
			}
		}
		if auth != "" && !strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			header["Authorization"] = []string{"Bearer " + auth}
			conn, resp, err = dialer.Dial(s.cfg.WSURL, header)
			if err != nil {
				if resp != nil {
					body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
					_ = resp.Body.Close()
					msg := strings.TrimSpace(string(body))
					if msg == "" {
						msg = err.Error()
					}
					return nil, &APIError{
						Op:         "ws_connect",
						StatusCode: resp.StatusCode,
						Message:    msg,
						Body:       msg,
						Auth:       resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || isAuthFailureMessage(msg),
					}
				}
				if isAuthFailureMessage(err.Error()) {
					return nil, &APIError{Op: "ws_connect", Message: err.Error(), Auth: true}
				}
				return nil, err
			}
			return conn, nil
		}
		if isAuthFailureMessage(err.Error()) {
			return nil, &APIError{Op: "ws_connect", Message: err.Error(), Auth: true}
		}
		return nil, err
	}
	conn.SetPingHandler(func(appData string) error {
		return conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(5*time.Second))
	})
	conn.SetPongHandler(func(appData string) error {
		conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		return nil
	})
	return conn, nil
}

func (s *Streamer) subscribeAll(conn *websocket.Conn, subs []store.Subscription) error {
	if len(subs) == 0 {
		return fmt.Errorf("no subscriptions")
	}
	return s.sendSubscription(conn, subs, 1)
}

func (s *Streamer) unsubscribeAll(conn *websocket.Conn, subs []store.Subscription) error {
	if len(subs) == 0 {
		return nil
	}
	return s.sendSubscription(conn, subs, 0)
}

func (s *Streamer) sendSubscription(conn *websocket.Conn, subs []store.Subscription, action int) error {
	modes := map[string]int{
		"LTP":        1,
		"QUOTE":      2,
		"SNAPQUOTE":  3,
		"SNAP_QUOTE": 3,
	}

	byModeExchange := map[int]map[int][]string{}
	for _, sub := range subs {
		modeVal, ok := modes[stringsUpper(sub.Mode)]
		if !ok {
			modeVal = 1
		}
		exchType := exchangeType(sub.Exchange)
		if byModeExchange[modeVal] == nil {
			byModeExchange[modeVal] = map[int][]string{}
		}
		byModeExchange[modeVal][exchType] = append(byModeExchange[modeVal][exchType], sub.SymbolToken)
	}

	for modeVal, exchTokens := range byModeExchange {
		tokenList := []map[string]interface{}{}
		for exchType, tokens := range exchTokens {
			tokenList = append(tokenList, map[string]interface{}{
				"exchangeType": exchType,
				"tokens":       tokens,
			})
		}
		req := map[string]interface{}{
			"correlationID": "collector",
			"action":        action,
			"params": map[string]interface{}{
				"mode":      modeVal,
				"tokenList": tokenList,
			},
		}
		s.writeMu.Lock()
		err := conn.WriteJSON(req)
		s.writeMu.Unlock()
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Streamer) readLoop(ctx context.Context, conn *websocket.Conn, out chan<- Tick) error {
	pingTicker := time.NewTicker(10 * time.Second)
	defer pingTicker.Stop()
	pingErr := make(chan error, 1)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-pingTicker.C:
				s.writeMu.Lock()
				err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second))
				s.writeMu.Unlock()
				if err != nil {
					pingErr <- err
					return
				}
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-pingErr:
			return err
		default:
			conn.SetReadDeadline(time.Now().Add(45 * time.Second))
			msgType, data, err := conn.ReadMessage()
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					s.logDebug("ws_read_timeout")
					continue
				}
				return err
			}
			if msgType == websocket.TextMessage {
				if string(data) == "pong" {
					continue
				}
				if isAuthFailureMessage(string(data)) {
					return &APIError{Op: "ws_read", Message: string(data), Auth: true}
				}
				continue
			}
			if msgType != websocket.BinaryMessage {
				continue
			}
			tick, ok := parseBinaryTick(data)
			if !ok {
				continue
			}
			s.lastTickNs.Store(time.Now().UnixNano())
			out <- tick
		}
	}
}

func parseBinaryTick(data []byte) (Tick, bool) {
	if len(data) < 51 {
		return Tick{}, false
	}
	mode := data[0]
	_ = mode
	exchType := data[1]
	token := parseToken(data[2:27])
	if token == "" {
		return Tick{}, false
	}
	exchange := exchangeName(exchType)
	exchangeTS := readInt64(data[35:43])
	ts := parseTimestamp(exchangeTS)
	ltpRaw := readInt64(data[43:51])
	ltp := normalizePrice(ltpRaw)

	tick := Tick{Exchange: exchange, Token: token, LTP: ltp, Timestamp: ts}

	if len(data) >= 59 {
		qty := readInt64(data[51:59])
		tick.LastQty = &qty
	}
	if len(data) >= 67 {
		avg := normalizePrice(readInt64(data[59:67]))
		tick.AvgPrice = &avg
	}
	if len(data) >= 75 {
		vol := readInt64(data[67:75])
		tick.CumVolume = &vol
	}
	if len(data) >= 83 {
		if total := floatToIntPtr(readFloat64(data[75:83])); total != nil {
			tick.TotalBuy = total
		}
	}
	if len(data) >= 91 {
		if total := floatToIntPtr(readFloat64(data[83:91])); total != nil {
			tick.TotalSell = total
		}
	}
	if len(data) >= 99 {
		open := normalizePrice(readInt64(data[91:99]))
		tick.Open = &open
	}
	if len(data) >= 107 {
		high := normalizePrice(readInt64(data[99:107]))
		tick.High = &high
	}
	if len(data) >= 115 {
		low := normalizePrice(readInt64(data[107:115]))
		tick.Low = &low
	}
	if len(data) >= 123 {
		closeVal := normalizePrice(readInt64(data[115:123]))
		tick.Close = &closeVal
	}
	if len(data) >= 131 {
		lt := parseTimestamp(readInt64(data[123:131]))
		tick.LastTrade = &lt
	}
	if len(data) >= 139 {
		oi := readInt64(data[131:139])
		tick.OI = &oi
	}
	if len(data) >= 147 {
		change := float64(readInt64(data[139:147]))
		tick.OIChangePct = &change
	}
	if len(data) >= 347 {
		tick.DepthBuy, tick.DepthSell = parseDepthLevels(data[147:347])
	}
	if len(data) >= 355 {
		upper := normalizePrice(readInt64(data[347:355]))
		tick.UpperCirc = &upper
	}
	if len(data) >= 363 {
		lower := normalizePrice(readInt64(data[355:363]))
		tick.LowerCirc = &lower
	}
	if len(data) >= 371 {
		high := normalizePrice(readInt64(data[363:371]))
		tick.WeekHigh = &high
	}
	if len(data) >= 379 {
		low := normalizePrice(readInt64(data[371:379]))
		tick.WeekLow = &low
	}

	return tick, true
}

func normalizePrice(value int64) float64 {
	return float64(value) / 100.0
}

func parseToken(raw []byte) string {
	out := make([]byte, 0, len(raw))
	for _, b := range raw {
		if b == 0x00 {
			break
		}
		out = append(out, b)
	}
	return string(out)
}

func readInt64(data []byte) int64 {
	if len(data) < 8 {
		return 0
	}
	return int64(binary.LittleEndian.Uint64(data))
}

func readFloat64(data []byte) float64 {
	if len(data) < 8 {
		return 0
	}
	return math.Float64frombits(binary.LittleEndian.Uint64(data))
}

func floatToIntPtr(value float64) *int64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return nil
	}
	out := int64(value)
	return &out
}

func parseTimestamp(value int64) time.Time {
	if value <= 0 {
		return time.Now().UTC()
	}
	if value > 1e12 {
		return time.Unix(0, value*int64(time.Millisecond))
	}
	return time.Unix(value, 0)
}

func parseDepthLevels(data []byte) ([]DepthLevel, []DepthLevel) {
	if len(data) < 200 {
		return nil, nil
	}
	buy := make([]DepthLevel, 0, 5)
	sell := make([]DepthLevel, 0, 5)
	for i := 0; i < 10; i++ {
		offset := i * 20
		if len(data) < offset+20 {
			break
		}
		flag := int16(binary.LittleEndian.Uint16(data[offset : offset+2]))
		qty := readInt64(data[offset+2 : offset+10])
		price := normalizePrice(readInt64(data[offset+10 : offset+18]))
		orders := int64(int16(binary.LittleEndian.Uint16(data[offset+18 : offset+20])))
		level := DepthLevel{Price: price, Quantity: qty, Orders: orders}
		if flag == 1 {
			buy = append(buy, level)
		} else {
			sell = append(sell, level)
		}
	}
	return buy, sell
}

func exchangeType(exchange string) int {
	switch stringsUpper(exchange) {
	case "NSE":
		return 1
	case "NFO":
		return 2
	case "BSE":
		return 3
	case "BFO":
		return 4
	case "MCX":
		return 5
	case "NCX":
		return 7
	case "CDE":
		return 13
	default:
		return 1
	}
}

func exchangeName(exchangeType byte) string {
	switch exchangeType {
	case 1:
		return "NSE"
	case 2:
		return "NFO"
	case 3:
		return "BSE"
	case 4:
		return "BFO"
	case 5:
		return "MCX"
	case 7:
		return "NCX"
	case 13:
		return "CDE"
	default:
		return "NSE"
	}
}

func stringsUpper(value string) string {
	if value == "" {
		return value
	}
	return strings.ToUpper(value)
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}

func (s *Streamer) logWarn(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Warn(msg, args...)
	}
}

func (s *Streamer) logDebug(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Debug(msg, args...)
	}
}
