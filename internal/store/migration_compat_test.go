package store

import "testing"

func TestKnownLegacyMigrationChecksumsAreExact(t *testing.T) {
	if !knownLegacyMigrationChecksum("005_strategy", "effa7153677a034727912505f70c29fa4f144c2e794c27806b43084d0b48b286") {
		t.Fatal("known deployed strategy migration must remain accepted")
	}
	if knownLegacyMigrationChecksum("005_strategy", "changed") || knownLegacyMigrationChecksum("999_unknown", "") {
		t.Fatal("unknown checksum must fail closed")
	}
}
