package store

import (
	"context"
	"fmt"
	"strings"
)

func (s *Store) ResetSchema(ctx context.Context) error {
	lockKey := fmt.Sprintf("%s:reset", s.Schema)
	return s.withAdvisoryLock(ctx, lockKey, func() error {
		drop := fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", quoteIdent(s.Schema))
		if _, err := s.exec(ctx, "drop_schema", drop); err != nil {
			return err
		}
		return s.migrateUnlocked(ctx)
	})
}

func (s *Store) migrateUnlocked(ctx context.Context) error {
	if err := s.ensureSchema(ctx); err != nil {
		return err
	}
	if err := s.ensureMigrationTable(ctx); err != nil {
		return err
	}
	applied, err := s.listAppliedMigrations(ctx)
	if err != nil {
		return err
	}
	pending, mismatches := planMigrations(buildMigrations(s.Schema), applied)
	for _, mig := range pending {
		if _, err := s.exec(ctx, "migration_"+mig.Version, mig.SQL); err != nil {
			return fmt.Errorf("apply migration %s: %w", mig.Version, err)
		}
		insertSQL := fmt.Sprintf(`INSERT INTO %s.schema_migrations (version, checksum) VALUES ($1,$2)`, quoteIdent(s.Schema))
		if _, err := s.exec(ctx, "migration_record_"+mig.Version, insertSQL, mig.Version, mig.Checksum); err != nil {
			return fmt.Errorf("record migration %s: %w", mig.Version, err)
		}
	}
	for _, table := range []string{"bars_1m", "quote_snapshots", "depth_5_snapshots", "option_greeks", "market_ticks", "depth_5_metrics", "smartapi_option_chain_snapshots"} {
		if err := s.EnsureFuturePartitions(ctx, table, 2); err != nil {
			return err
		}
	}
	if len(mismatches) > 0 {
		return fmt.Errorf("migration checksum mismatch: %s", strings.Join(mismatches, ","))
	}
	return nil
}

func planMigrations(migrations []migration, applied map[string]string) ([]migration, []string) {
	pending := make([]migration, 0, len(migrations))
	mismatches := make([]string, 0)
	for _, mig := range migrations {
		if prev, ok := applied[mig.Version]; ok {
			if prev != mig.Checksum && !knownLegacyMigrationChecksum(mig.Version, prev) {
				mismatches = append(mismatches, mig.Version)
			}
			continue
		}
		pending = append(pending, mig)
	}
	return pending, mismatches
}

// These exact checksums identify migrations already applied by the protected
// runtime before the source/runtime mirror was reconciled. Accepting only the
// observed immutable hashes keeps drift detection enabled for every other
// checksum and avoids rewriting production migration history.
func knownLegacyMigrationChecksum(version, checksum string) bool {
	legacy := map[string]string{
		"005_strategy":              "effa7153677a034727912505f70c29fa4f144c2e794c27806b43084d0b48b286",
		"024_derivative_token_plan": "037a137adec4f826dd67d43c72003f6d5947a2743d9656872982965397576a10",
	}
	expected, ok := legacy[version]
	return ok && expected == checksum
}
