package main

import (
	"math"
	"testing"
	"time"

	"trading-stack/internal/smartapi"
)

func TestTickArchiveSamplerIsPerTokenAndBoundedByTime(t *testing.T) {
	sampler := newTickArchiveSampler(1000)
	base := time.Date(2026, 8, 10, 9, 15, 0, 0, time.UTC)
	first := smartapi.Tick{Exchange: "NSE", Token: "1", ReceivedAt: base}
	if !sampler.Accept(first) {
		t.Fatal("first tick must be accepted")
	}
	first.ReceivedAt = base.Add(500 * time.Millisecond)
	if sampler.Accept(first) {
		t.Fatal("same token inside sample interval must be rejected")
	}
	if !sampler.Accept(smartapi.Tick{Exchange: "NSE", Token: "2", ReceivedAt: base.Add(500 * time.Millisecond)}) {
		t.Fatal("another token must have an independent interval")
	}
	first.ReceivedAt = base.Add(time.Second)
	if !sampler.Accept(first) {
		t.Fatal("tick at sample interval must be accepted")
	}
}

func TestWSHealthTrackerCountsSequenceGaps(t *testing.T) {
	tracker := newWSHealthTracker()
	now := time.Now().UTC()
	tracker.Mark(smartapi.Tick{ConnectionID: "ws-1", Exchange: "NSE", Token: "1", Sequence: 10, ReceivedAt: now})
	tracker.Mark(smartapi.Tick{ConnectionID: "ws-1", Exchange: "NSE", Token: "2", Sequence: 100, ReceivedAt: now.Add(500 * time.Millisecond)})
	tracker.Mark(smartapi.Tick{ConnectionID: "ws-1", Exchange: "NSE", Token: "1", Sequence: 13, ReceivedAt: now.Add(time.Second)})
	rows := tracker.Snapshot(now.Add(2*time.Second), 200)
	if len(rows) != 1 || rows[0].SequenceGaps != 2 || rows[0].TicksReceived != 3 {
		t.Fatalf("unexpected health snapshot: %+v", rows)
	}
}

func TestDepthMetric(t *testing.T) {
	metric := calculateDepthMetric("NFO", "10", time.Now(), "REGULAR",
		[]smartapi.DepthLevel{{Price: 100, Quantity: 20}, {Price: 99, Quantity: 10}},
		[]smartapi.DepthLevel{{Price: 102, Quantity: 10}, {Price: 103, Quantity: 20}})
	if metric.BestBid == nil || *metric.BestBid != 100 || metric.BestAsk == nil || *metric.BestAsk != 102 {
		t.Fatalf("unexpected top of book: %+v", metric)
	}
	if metric.Midpoint == nil || *metric.Midpoint != 101 || metric.Spread == nil || *metric.Spread != 2 {
		t.Fatalf("unexpected spread: %+v", metric)
	}
	if metric.DepthImbalance == nil || math.Abs(*metric.DepthImbalance) > 1e-12 {
		t.Fatalf("unexpected imbalance: %+v", metric.DepthImbalance)
	}
	if metric.Microprice == nil || math.Abs(*metric.Microprice-101.3333333333) > 1e-8 {
		t.Fatalf("unexpected microprice: %v", metric.Microprice)
	}
}
