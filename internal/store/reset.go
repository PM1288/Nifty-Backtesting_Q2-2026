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
	for _, table := range []string{"bars_1m", "quote_snapshots", "depth_5_snapshots", "option_greeks"} {
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
			if prev != mig.Checksum {
				mismatches = append(mismatches, mig.Version)
			}
			continue
		}
		pending = append(pending, mig)
	}
	return pending, mismatches
}
