package store

import "testing"

func TestPlanMigrationsAppliesPendingEvenWithChecksumDrift(t *testing.T) {
	migrations := []migration{
		{Version: "001_init", Checksum: "a"},
		{Version: "002_second", Checksum: "b"},
		{Version: "003_third", Checksum: "c"},
	}

	applied := map[string]string{
		"001_init":   "different",
		"002_second": "b",
	}

	pending, mismatches := planMigrations(migrations, applied)
	if len(mismatches) != 1 || mismatches[0] != "001_init" {
		t.Fatalf("unexpected mismatches: %#v", mismatches)
	}
	if len(pending) != 1 || pending[0].Version != "003_third" {
		t.Fatalf("unexpected pending migrations: %#v", pending)
	}
}
