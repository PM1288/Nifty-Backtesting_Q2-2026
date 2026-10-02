package main

import (
	"context"
	"errors"
	"testing"
	"time"
	"trading-stack/internal/store"
)

func TestBarWriterRetriesWithoutLosingBatch(t *testing.T) {
	input := make(chan store.Bar, 250)
	for i := 0; i < 250; i++ {
		input <- store.Bar{Ts: time.Unix(int64(i), 0)}
	}
	close(input)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	attempts, stored := 0, 0
	err := runBarWriter(ctx, input, func(ctx context.Context, rows []store.Bar) error {
		attempts++
		if len(rows) > 200 {
			t.Fatal("unbounded batch")
		}
		if attempts == 1 {
			return errors.New("temporary outage")
		}
		stored += len(rows)
		return nil
	}, nil)
	if err != nil || stored != 250 || attempts != 3 {
		t.Fatalf("err=%v stored=%d attempts=%d", err, stored, attempts)
	}
}
func TestBarWriterDrainsWithUncancelledShutdownContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	input := make(chan store.Bar, 1)
	input <- store.Bar{}
	close(input)
	stored := 0
	err := runBarWriter(ctx, input, func(writeCtx context.Context, rows []store.Bar) error {
		if writeCtx.Err() != nil {
			t.Fatal("shutdown used cancelled context")
		}
		stored += len(rows)
		return nil
	}, nil)
	if err != nil || stored != 1 {
		t.Fatalf("err=%v stored=%d", err, stored)
	}
}
