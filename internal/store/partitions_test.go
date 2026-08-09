package store

import "testing"

func TestParsePartitionMonthReadableName(t *testing.T) {
	month, ok := parsePartitionMonth("bars_1m_2026_08")
	if !ok || month.Year() != 2026 || int(month.Month()) != 8 {
		t.Fatalf("unexpected month: %v ok=%v", month, ok)
	}
}

func TestParsePartitionMonthLegacyName(t *testing.T) {
	month, ok := parsePartitionMonth("bars_1m_y2026m08")
	if !ok || month.Year() != 2026 || int(month.Month()) != 8 {
		t.Fatalf("unexpected legacy month: %v ok=%v", month, ok)
	}
}
