package strategy

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"trading-stack/internal/store"
)

type instrumentRef struct {
	Exchange      string
	Token         string
	TradingSymbol string
	Underlying    string
}

type optionContract struct {
	Exchange      string
	Token         string
	TradingSymbol string
	Underlying    string
	Expiry        time.Time
	Strike        float64
	Right         string
	Kind          string
}

type dailyBar struct {
	Date   time.Time
	Open   float64
	High   float64
	Low    float64
	Close  float64
	Volume int64
}

type minuteBar struct {
	Ts     time.Time
	Open   float64
	High   float64
	Low    float64
	Close  float64
	Volume int64
}

type instrumentDetail struct {
	Exchange      string
	Token         string
	TradingSymbol string
	Underlying    string
	Kind          string
	Right         string
	Expiry        time.Time
	Strike        float64
}

type equilibriumMean struct {
	Ts         time.Time
	CEMeanNorm *float64
	PEMeanNorm *float64
}
type equilibriumSnapshot struct {
	Underlying string
	Expiry     time.Time
	Strike     float64
	CENorm     *float64
	PENorm     *float64
	CEClose    *float64
	PEClose    *float64
	UpdatedAt  time.Time
}
type instrumentQuote struct {
	Price float64
	Bid   *float64
	Ask   *float64
}

func fetchUniverse(ctx context.Context, st *store.Store, universe string) ([]instrumentRef, error) {
	query := fmt.Sprintf(`SELECT exchange, symbol_token, tradingsymbol, COALESCE(underlying, '')
FROM %s WHERE universe_name = $1 AND active_to IS NULL`, pgx.Identifier{st.Schema, "instrument_universe"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, universe)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []instrumentRef
	for rows.Next() {
		var ref instrumentRef
		if err := rows.Scan(&ref.Exchange, &ref.Token, &ref.TradingSymbol, &ref.Underlying); err != nil {
			return nil, err
		}
		out = append(out, ref)
	}
	return out, rows.Err()
}

func fetchDailyBars(ctx context.Context, st *store.Store, exchange string, tokens []string, start time.Time) (map[string][]dailyBar, error) {
	if len(tokens) == 0 {
		return map[string][]dailyBar{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, trade_date, open, high, low, close, volume
FROM %s
WHERE exchange = $1 AND symbol_token = ANY($2) AND trade_date >= $3
ORDER BY symbol_token, trade_date ASC`, pgx.Identifier{st.Schema, "bars_1d"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, exchange, tokens, start)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string][]dailyBar, len(tokens))
	for rows.Next() {
		var token string
		var bar dailyBar
		if err := rows.Scan(&token, &bar.Date, &bar.Open, &bar.High, &bar.Low, &bar.Close, &bar.Volume); err != nil {
			return nil, err
		}
		out[token] = append(out[token], bar)
	}
	return out, rows.Err()
}

func fetchMinuteBars(ctx context.Context, st *store.Store, exchange string, tokens []string, start time.Time) (map[string][]minuteBar, error) {
	if len(tokens) == 0 {
		return map[string][]minuteBar{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, ts, open, high, low, close, volume
FROM %s
WHERE exchange = $1 AND symbol_token = ANY($2) AND ts >= $3
ORDER BY symbol_token, ts ASC`, pgx.Identifier{st.Schema, "bars_1m"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, exchange, tokens, start.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string][]minuteBar, len(tokens))
	for rows.Next() {
		var token string
		var bar minuteBar
		if err := rows.Scan(&token, &bar.Ts, &bar.Open, &bar.High, &bar.Low, &bar.Close, &bar.Volume); err != nil {
			return nil, err
		}
		out[token] = append(out[token], bar)
	}
	return out, rows.Err()
}

func fetchMinuteCloseMinMax(ctx context.Context, st *store.Store, exchange string, token string, start time.Time) (min float64, max float64, ok bool, err error) {
	if strings.TrimSpace(exchange) == "" || strings.TrimSpace(token) == "" {
		return 0, 0, false, nil
	}
	query := fmt.Sprintf(`SELECT min(close)::float8, max(close)::float8
FROM %s
WHERE exchange = $1 AND symbol_token = $2 AND ts >= $3`, pgx.Identifier{st.Schema, "bars_1m"}.Sanitize())
	var minV pgtype.Float8
	var maxV pgtype.Float8
	if err := st.Pool.QueryRow(ctx, query, exchange, token, start.UTC()).Scan(&minV, &maxV); err != nil {
		return 0, 0, false, err
	}
	if !minV.Valid || !maxV.Valid {
		return 0, 0, false, nil
	}
	return minV.Float64, maxV.Float64, true, nil
}

func fetchInstrumentPrices(ctx context.Context, st *store.Store, exchange string, tokens []string) (map[string]float64, error) {
	if len(tokens) == 0 {
		return map[string]float64{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, COALESCE(last_price, 0)
FROM %s
WHERE exchange = $1 AND symbol_token = ANY($2)`, pgx.Identifier{st.Schema, "instrument_state"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, exchange, tokens)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]float64{}
	for rows.Next() {
		var token string
		var price float64
		if err := rows.Scan(&token, &price); err != nil {
			return nil, err
		}
		out[token] = price
	}
	return out, rows.Err()
}

func fetchInstrumentPricesMulti(ctx context.Context, st *store.Store, tokensByExchange map[string][]string) (map[string]float64, error) {
	out := map[string]float64{}
	for exchange, tokens := range tokensByExchange {
		if len(tokens) == 0 {
			continue
		}
		prices, err := fetchInstrumentPrices(ctx, st, exchange, tokens)
		if err != nil {
			return nil, err
		}
		for token, price := range prices {
			out[token] = price
		}
	}
	return out, nil
}
func fetchInstrumentQuotes(ctx context.Context, st *store.Store, exchange string, tokens []string) (map[string]instrumentQuote, error) {
	if len(tokens) == 0 {
		return map[string]instrumentQuote{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, COALESCE(last_price, 0), last_bid, last_ask
FROM %s
WHERE exchange = $1 AND symbol_token = ANY($2)`, pgx.Identifier{st.Schema, "instrument_state"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, exchange, tokens)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]instrumentQuote{}
	for rows.Next() {
		var token string
		var price float64
		var bid *float64
		var ask *float64
		if err := rows.Scan(&token, &price, &bid, &ask); err != nil {
			return nil, err
		}
		out[token] = instrumentQuote{Price: price, Bid: bid, Ask: ask}
	}
	return out, rows.Err()
}

func fetchInstrumentQuotesMulti(ctx context.Context, st *store.Store, tokensByExchange map[string][]string) (map[string]instrumentQuote, error) {
	out := map[string]instrumentQuote{}
	for exchange, tokens := range tokensByExchange {
		if len(tokens) == 0 {
			continue
		}
		quotes, err := fetchInstrumentQuotes(ctx, st, exchange, tokens)
		if err != nil {
			return nil, err
		}
		for token, quote := range quotes {
			out[token] = quote
		}
	}
	return out, nil
}

func fetchInstrumentLotSizes(ctx context.Context, st *store.Store, tokens []string) (map[string]int, error) {
	if len(tokens) == 0 {
		return map[string]int{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, COALESCE(lotsize, 0)
FROM %s
WHERE symbol_token = ANY($1)`, pgx.Identifier{st.Schema, "instruments"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, tokens)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var token string
		var lot int
		if err := rows.Scan(&token, &lot); err != nil {
			return nil, err
		}
		out[token] = lot
	}
	return out, rows.Err()
}
func fetchOptionUnderlyings(ctx context.Context, st *store.Store) (map[string]struct{}, error) {
	query := fmt.Sprintf(`SELECT DISTINCT upper(underlying) FROM %s WHERE active = true AND kind LIKE 'OPT%%'`, pgx.Identifier{st.Schema, "subscriptions"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]struct{}{}
	for rows.Next() {
		var underlying string
		if err := rows.Scan(&underlying); err != nil {
			return nil, err
		}
		if strings.TrimSpace(underlying) != "" {
			out[underlying] = struct{}{}
		}
	}
	return out, rows.Err()
}

func fetchOptionContracts(ctx context.Context, st *store.Store, underlyings []string) (map[string][]optionContract, error) {
	if len(underlyings) == 0 {
		return map[string][]optionContract{}, nil
	}
	query := fmt.Sprintf(`SELECT exchange, symbol_token, tradingsymbol, upper(underlying), expiry, strike, "right", kind
FROM %s
WHERE active = true
  AND kind LIKE 'OPT%%'
  AND upper(underlying) = ANY($1)
  AND expiry IS NOT NULL
  AND strike IS NOT NULL
  AND "right" IN ('CE','PE')
ORDER BY expiry ASC, strike ASC`, pgx.Identifier{st.Schema, "subscriptions"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, underlyings)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]optionContract{}
	for rows.Next() {
		var row optionContract
		if err := rows.Scan(&row.Exchange, &row.Token, &row.TradingSymbol, &row.Underlying, &row.Expiry, &row.Strike, &row.Right, &row.Kind); err != nil {
			return nil, err
		}
		key := strings.ToUpper(strings.TrimSpace(row.Underlying))
		out[key] = append(out[key], row)
	}
	return out, rows.Err()
}

func fetchOptionUnderlyingByTokens(ctx context.Context, st *store.Store, tokens []string) (map[string]string, error) {
	if len(tokens) == 0 {
		return map[string]string{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, upper(underlying)
FROM %s
WHERE symbol_token = ANY($1)
  AND kind LIKE 'OPT%%'`, pgx.Identifier{st.Schema, "subscriptions"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, tokens)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var token, underlying string
		if err := rows.Scan(&token, &underlying); err != nil {
			return nil, err
		}
		out[token] = strings.TrimSpace(underlying)
	}
	return out, rows.Err()
}

func fetchCooldowns(ctx context.Context, st *store.Store, strategy string) (map[string]time.Time, error) {
	query := fmt.Sprintf(`SELECT exchange, symbol_token, cooldown_until FROM %s WHERE strategy = $1`, pgx.Identifier{st.Schema, "strategy_cooldowns"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, strategy)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]time.Time{}
	for rows.Next() {
		var exchange, token string
		var until time.Time
		if err := rows.Scan(&exchange, &token, &until); err != nil {
			return nil, err
		}
		out[cooldownKey(strategy, exchange, token)] = until
	}
	return out, rows.Err()
}

func fetchInstrumentDetails(ctx context.Context, st *store.Store, tokens []string) (map[string]instrumentDetail, error) {
	if len(tokens) == 0 {
		return map[string]instrumentDetail{}, nil
	}
	query := fmt.Sprintf(`SELECT exchange, symbol_token, tradingsymbol, COALESCE(upper(underlying),''), COALESCE(kind,''), COALESCE("right",''), COALESCE(expiry, '0001-01-01'), COALESCE(strike, 0)
FROM %s
WHERE symbol_token = ANY($1)`, pgx.Identifier{st.Schema, "subscriptions"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, tokens)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]instrumentDetail{}
	for rows.Next() {
		var row instrumentDetail
		if err := rows.Scan(&row.Exchange, &row.Token, &row.TradingSymbol, &row.Underlying, &row.Kind, &row.Right, &row.Expiry, &row.Strike); err != nil {
			return nil, err
		}
		out[row.Token] = row
	}
	return out, rows.Err()
}

func fetchLatestEquilibriumMean(ctx context.Context, st *store.Store, underlying string, expiry time.Time) (*equilibriumMean, error) {
	table := pgx.Identifier{st.Schema, "equilibrium_mean_series"}.Sanitize()
	query := fmt.Sprintf(`SELECT ts, ce_mean_norm, pe_mean_norm
FROM %s
WHERE upper(underlying) = $1
  AND expiry = $2
ORDER BY ts DESC
LIMIT 1`, table)
	var row equilibriumMean
	if err := st.Pool.QueryRow(ctx, query, strings.ToUpper(strings.TrimSpace(underlying)), expiry).Scan(&row.Ts, &row.CEMeanNorm, &row.PEMeanNorm); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

func fetchCurrentEquilibriumSnapshot(ctx context.Context, st *store.Store, underlying string, expiry time.Time) (*equilibriumSnapshot, error) {
	table := pgx.Identifier{st.Schema, "equilibrium_current_snapshot"}.Sanitize()
	query := fmt.Sprintf(`SELECT underlying, expiry, strike, ce_norm, pe_norm, ce_close, pe_close, updated_at
FROM %s
WHERE upper(underlying) = $1 AND expiry = $2
ORDER BY updated_at DESC
LIMIT 1`, table)
	var row equilibriumSnapshot
	if err := st.Pool.QueryRow(ctx, query, strings.ToUpper(strings.TrimSpace(underlying)), expiry).Scan(
		&row.Underlying,
		&row.Expiry,
		&row.Strike,
		&row.CENorm,
		&row.PENorm,
		&row.CEClose,
		&row.PEClose,
		&row.UpdatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

func filterOptionContractsByKind(contracts []optionContract, kind string) []optionContract {
	trimmed := strings.ToUpper(strings.TrimSpace(kind))
	if trimmed == "" {
		return contracts
	}
	out := make([]optionContract, 0, len(contracts))
	for _, c := range contracts {
		if strings.ToUpper(strings.TrimSpace(c.Kind)) == trimmed {
			out = append(out, c)
		}
	}
	return out
}

func positionKey(exchange, token string) string {
	return strings.ToUpper(exchange) + ":" + token
}

func cooldownKey(strategy, exchange, token string) string {
	return strings.ToUpper(strategy) + ":" + positionKey(exchange, token)
}

func extractCloses(bars []dailyBar) []float64 {
	out := make([]float64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.Close)
	}
	return out
}

func averageVolume(bars []dailyBar, window int) float64 {
	if window <= 0 || len(bars) == 0 {
		return 0
	}
	if len(bars) < window {
		window = len(bars)
	}
	var sum int64
	for _, bar := range bars[len(bars)-window:] {
		sum += bar.Volume
	}
	return float64(sum) / float64(window)
}

func extractMinuteCloses(bars []minuteBar) []float64 {
	out := make([]float64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.Close)
	}
	return out
}

func extractMinuteHighs(bars []minuteBar) []float64 {
	out := make([]float64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.High)
	}
	return out
}

func extractMinuteLows(bars []minuteBar) []float64 {
	out := make([]float64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.Low)
	}
	return out
}

func extractMinuteVolumes(bars []minuteBar) []int64 {
	out := make([]int64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.Volume)
	}
	return out
}

func averageMinuteVolume(bars []minuteBar, window int) float64 {
	if len(bars) == 0 {
		return 0
	}
	if window <= 0 || len(bars) < window {
		window = len(bars)
	}
	var sum int64
	for _, bar := range bars[len(bars)-window:] {
		sum += bar.Volume
	}
	return float64(sum) / float64(window)
}

func aggregateBars(bars []minuteBar, minutes int, loc *time.Location) []minuteBar {
	if minutes <= 1 {
		return bars
	}
	out := make([]minuteBar, 0, len(bars)/minutes)
	bucketMap := map[time.Time]*minuteBar{}
	var keys []time.Time
	for _, bar := range bars {
		key := bucketStart(bar.Ts, minutes, loc)
		entry, ok := bucketMap[key]
		if !ok {
			entry = &minuteBar{Ts: key, Open: bar.Open, High: bar.High, Low: bar.Low, Close: bar.Close, Volume: bar.Volume}
			bucketMap[key] = entry
			keys = append(keys, key)
			continue
		}
		if bar.High > entry.High {
			entry.High = bar.High
		}
		if bar.Low < entry.Low {
			entry.Low = bar.Low
		}
		entry.Close = bar.Close
		entry.Volume += bar.Volume
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].Before(keys[j]) })
	for _, key := range keys {
		out = append(out, *bucketMap[key])
	}
	return out
}

func bucketStart(ts time.Time, minutes int, loc *time.Location) time.Time {
	local := ts.In(loc)
	truncated := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), local.Minute(), 0, 0, loc)
	offset := truncated.Minute() % minutes
	bucket := truncated.Add(-time.Duration(offset) * time.Minute)
	return bucket.UTC()
}

func dailyStart(emaSlow int, now time.Time) time.Time {
	days := emaSlow*3 + 10
	start := now.AddDate(0, 0, -days)
	return time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
}
