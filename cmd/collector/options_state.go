package main

import (
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"trading-stack/internal/store"
	"trading-stack/internal/universe"
)

type optionState struct {
	Underlying string
	Expiry     time.Time
	Step       float64
	LastATM    float64
	LastBuilt  time.Time
}

type optionStateIndex struct {
	mu     sync.RWMutex
	states map[string]optionState
}

func newOptionStateIndex() *optionStateIndex {
	return &optionStateIndex{states: map[string]optionState{}}
}

func (o *optionStateIndex) Update(states map[string]optionState) {
	o.mu.Lock()
	o.states = states
	o.mu.Unlock()
}

func (o *optionStateIndex) Snapshot() []optionState {
	o.mu.RLock()
	defer o.mu.RUnlock()
	out := make([]optionState, 0, len(o.states))
	for _, state := range o.states {
		out = append(out, state)
	}
	return out
}

func buildOptionStates(subs []store.Subscription, prices *priceCache, now time.Time) map[string]optionState {
	strikesByUnderlying := map[string]map[float64]struct{}{}
	expiryByUnderlying := map[string]time.Time{}
	for _, sub := range subs {
		if !strings.HasPrefix(strings.ToUpper(sub.Kind), "OPT") || sub.Strike == nil || sub.Expiry == nil {
			continue
		}
		if strikesByUnderlying[sub.Underlying] == nil {
			strikesByUnderlying[sub.Underlying] = map[float64]struct{}{}
		}
		strikesByUnderlying[sub.Underlying][*sub.Strike] = struct{}{}
		if existing, ok := expiryByUnderlying[sub.Underlying]; !ok || sub.Expiry.Before(existing) {
			expiryByUnderlying[sub.Underlying] = *sub.Expiry
		}
	}

	states := map[string]optionState{}
	for underlying, strikeSet := range strikesByUnderlying {
		strikes := make([]float64, 0, len(strikeSet))
		for strike := range strikeSet {
			strikes = append(strikes, strike)
		}
		sort.Float64s(strikes)
		step := universe.InferStrikeStep(strikes)
		if step <= 0 {
			continue
		}
		price, ok := prices.Get(underlying)
		if !ok || price <= 0 {
			continue
		}
		atm := universe.RoundToStep(price, step)
		states[underlying] = optionState{
			Underlying: underlying,
			Expiry:     expiryByUnderlying[underlying],
			Step:       step,
			LastATM:    atm,
			LastBuilt:  now,
		}
	}
	return states
}

func (o optionState) NeedsRefresh(prices *priceCache, shiftSteps int) bool {
	if shiftSteps <= 0 || o.Step <= 0 {
		return false
	}
	price, ok := prices.Get(o.Underlying)
	if !ok || price <= 0 {
		return false
	}
	atm := universe.RoundToStep(price, o.Step)
	return math.Abs(atm-o.LastATM) >= float64(shiftSteps)*o.Step
}
