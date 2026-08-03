package aggregate

import (
	"sync"
	"time"

	"trading-stack/internal/store"
	"trading-stack/internal/util"
)

type Tick struct {
	Exchange  string
	Token     string
	LTP       float64
	LastQty   *int64
	CumVolume *int64
	OI        *int64
	Timestamp time.Time
}

type Aggregator struct {
	loc        *time.Location
	flushAfter time.Duration
	mu         sync.Mutex
	buckets    map[string]*bucket
}

type bucket struct {
	startUTC    time.Time
	open        float64
	high        float64
	low         float64
	close       float64
	volume      int64
	cumStart    *int64
	cumLast     *int64
	oi          *int64
	lastUpdated time.Time
}

func New(loc *time.Location, flushAfter time.Duration) *Aggregator {
	return &Aggregator{
		loc:        loc,
		flushAfter: flushAfter,
		buckets:    make(map[string]*bucket),
	}
}

func (a *Aggregator) AddTick(t Tick) []store.Bar {
	a.mu.Lock()
	defer a.mu.Unlock()

	if t.Timestamp.IsZero() {
		t.Timestamp = time.Now().UTC()
	}

	key := t.Exchange + ":" + t.Token
	startUTC := util.MinuteStartUTC(t.Timestamp, a.loc)

	b, ok := a.buckets[key]
	if !ok {
		b = &bucket{startUTC: startUTC, open: t.LTP, high: t.LTP, low: t.LTP, close: t.LTP, lastUpdated: t.Timestamp}
		if t.OI != nil {
			oi := *t.OI
			b.oi = &oi
		}
		a.applyVolume(b, t)
		a.buckets[key] = b
		return nil
	}

	if startUTC.After(b.startUTC) {
		bar := a.finalize(key, b)
		b = &bucket{startUTC: startUTC, open: t.LTP, high: t.LTP, low: t.LTP, close: t.LTP, lastUpdated: t.Timestamp}
		if t.OI != nil {
			oi := *t.OI
			b.oi = &oi
		}
		a.applyVolume(b, t)
		a.buckets[key] = b
		return []store.Bar{bar}
	}

	if startUTC.Before(b.startUTC) {
		return nil
	}

	if t.LTP > b.high {
		b.high = t.LTP
	}
	if t.LTP < b.low {
		b.low = t.LTP
	}
	b.close = t.LTP
	b.lastUpdated = t.Timestamp
	if t.OI != nil {
		oi := *t.OI
		b.oi = &oi
	}
	a.applyVolume(b, t)
	return nil
}

func (a *Aggregator) FlushDue(now time.Time) []store.Bar {
	a.mu.Lock()
	defer a.mu.Unlock()

	currentStart := util.MinuteStartUTC(now, a.loc)
	var bars []store.Bar
	for key, b := range a.buckets {
		if b.startUTC.Before(currentStart) && now.Sub(b.startUTC) >= time.Minute+a.flushAfter {
			bars = append(bars, a.finalize(key, b))
			delete(a.buckets, key)
		}
	}
	return bars
}

func (a *Aggregator) applyVolume(b *bucket, t Tick) {
	if t.CumVolume != nil {
		if b.cumStart == nil {
			start := *t.CumVolume
			b.cumStart = &start
			b.cumLast = &start
		} else {
			last := *t.CumVolume
			b.cumLast = &last
		}
		return
	}
	if t.LastQty != nil {
		b.volume += *t.LastQty
	}
}

func (a *Aggregator) finalize(key string, b *bucket) store.Bar {
	volume := b.volume
	if b.cumStart != nil && b.cumLast != nil {
		diff := *b.cumLast - *b.cumStart
		if diff >= 0 {
			volume = diff
		}
	}
	parts := splitKey(key)
	return store.Bar{
		Ts:          b.startUTC,
		Exchange:    parts.exchange,
		SymbolToken: parts.token,
		Open:        b.open,
		High:        b.high,
		Low:         b.low,
		Close:       b.close,
		Volume:      volume,
		OI:          b.oi,
		Source:      "ws",
	}
}

type keyParts struct {
	exchange string
	token    string
}

func splitKey(key string) keyParts {
	for i := 0; i < len(key); i++ {
		if key[i] == ':' {
			return keyParts{exchange: key[:i], token: key[i+1:]}
		}
	}
	return keyParts{exchange: "", token: key}
}
