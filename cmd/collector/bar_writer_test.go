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

func TestTickWriterDrainsQueuedBatchesAndRetriesAtShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	input := make(chan store.MarketTick, 7)
	for i := 0; i < 7; i++ {
		input <- store.MarketTick{SequenceNo: int64(i)}
	}
	close(input)
	attempts, saved := 0, 0
	err := runBoundedBatchWriter(ctx, input, func(writeCtx context.Context, rows []store.MarketTick) error {
		if writeCtx.Err() != nil {
			t.Fatal("cancelled drain context")
		}
		if len(rows) > 3 {
			t.Fatal("unbounded batch")
		}
		attempts++
		if attempts == 1 {
			return errors.New("temporary failure")
		}
		for _, row := range rows {
			if row.SequenceNo != int64(saved) {
				t.Fatalf("sequence=%d expected=%d", row.SequenceNo, saved)
			}
			saved++
		}
		return nil
	}, nil, "market_tick_archive", 3, time.Millisecond)
	if err != nil || saved != 7 || attempts != 4 {
		t.Fatalf("err=%v saved=%d attempts=%d", err, saved, attempts)
	}
}

func TestBatchWriterClosedInputRetriesFinalPartialBatch(t *testing.T) {
	input := make(chan int, 1)
	input <- 42
	close(input)
	attempts := 0
	err := runBoundedBatchWriter(context.Background(), input, func(ctx context.Context, rows []int) error {
		attempts++
		if len(rows) != 1 || rows[0] != 42 {
			t.Fatal("lost final row")
		}
		if attempts == 1 {
			return errors.New("temporary failure")
		}
		return nil
	}, nil, "test", 3, time.Millisecond)
	if err != nil || attempts != 2 {
		t.Fatalf("err=%v attempts=%d", err, attempts)
	}
}

func TestBatchWriterShutdownDeadlineBoundsFailedDrain(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	input := make(chan int, 1)
	input <- 1
	close(input)
	started := time.Now()
	err := runBoundedBatchWriter(ctx, input, func(writeCtx context.Context, rows []int) error {
		<-writeCtx.Done()
		return writeCtx.Err()
	}, nil, "test", 2, time.Millisecond)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err=%v", err)
	}
	if elapsed := time.Since(started); elapsed > 7*time.Second {
		t.Fatalf("unbounded shutdown: %s", elapsed)
	}
}
