package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestSnapshotOptionChainWithRetryUsesStableIdentityAndRecovers(t *testing.T) {
	wantTs := time.Date(2026, 8, 13, 5, 45, 0, 0, time.UTC)
	calls := 0
	operation := func(_ context.Context, gotTs time.Time, phase string) (int64, error) {
		calls++
		if !gotTs.Equal(wantTs) || phase != "REGULAR" {
			t.Fatalf("retry changed snapshot identity: ts=%s phase=%s", gotTs, phase)
		}
		if calls < 3 {
			return 0, errors.New("temporary database pressure")
		}
		return 2584, nil
	}

	rows, attempts, err := snapshotOptionChainWithRetry(context.Background(), wantTs, "REGULAR", 3, time.Second, time.Millisecond, operation)
	if err != nil || rows != 2584 || attempts != 3 || calls != 3 {
		t.Fatalf("unexpected retry result rows=%d attempts=%d calls=%d err=%v", rows, attempts, calls, err)
	}
}

func TestSnapshotOptionChainWithRetryStopsAtBound(t *testing.T) {
	calls := 0
	operation := func(context.Context, time.Time, string) (int64, error) {
		calls++
		return 0, errors.New("still unavailable")
	}

	_, attempts, err := snapshotOptionChainWithRetry(context.Background(), time.Now(), "REGULAR", 2, time.Second, time.Millisecond, operation)
	if err == nil || attempts != 2 || calls != 2 {
		t.Fatalf("retry was not bounded attempts=%d calls=%d err=%v", attempts, calls, err)
	}
}
