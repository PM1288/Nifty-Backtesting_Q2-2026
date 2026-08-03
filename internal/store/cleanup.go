package store

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"

	"trading-stack/internal/config"
)

func (s *Store) CleanupRetention(ctx context.Context, cfg config.RetentionConfig, loc *time.Location) (map[string]int64, error) {
	results := map[string]int64{}
	if !cfg.EnableCleanup {
		return results, nil
	}
	lockKey := fmt.Sprintf("%s:cleanup", s.Schema)
	err := s.withAdvisoryLock(ctx, lockKey, func() error {
		for _, table := range []string{"bars_1m", "quote_snapshots", "depth_5_snapshots", "option_greeks"} {
			if err := s.EnsureFuturePartitions(ctx, table, 2); err != nil {
				return err
			}
		}
		barsCutoff := cutoffUTC(time.Now().In(loc), cfg.Bars1mDays, loc)
		snapsCutoff := cutoffUTC(time.Now().In(loc), cfg.QuoteSnapshotsDays, loc)
		quoteCutoff := snapsCutoff
		if cfg.QuoteSnapshotsHours > 0 {
			quoteCutoff = cutoffHoursUTC(time.Now().In(loc), cfg.QuoteSnapshotsHours, loc)
		}
		oiCutoff := snapsCutoff
		if cfg.OISnapshotsHours > 0 {
			oiCutoff = cutoffHoursUTC(time.Now().In(loc), cfg.OISnapshotsHours, loc)
		}
		depthCutoff := cutoffUTC(time.Now().In(loc), cfg.Depth5Days, loc)
		if cfg.Depth5Hours > 0 {
			depthCutoff = cutoffHoursUTC(time.Now().In(loc), cfg.Depth5Hours, loc)
		}
		greeksCutoff := cutoffUTC(time.Now().In(loc), cfg.OptionGreeksDays, loc)

		count, err := s.cleanupTable(ctx, "bars_1m", "ts", barsCutoff, cfg.DryRun)
		if err != nil {
			return err
		}
		results["bars_1m"] = count

		for _, table := range []string{"pcr_snapshots", "gainers_losers_snapshots", "oibuildup_snapshots", "putcallratio_snapshots", "symbol_perf_snapshot"} {
			count, err := s.cleanupTable(ctx, table, "ts", snapsCutoff, cfg.DryRun)
			if err != nil {
				return err
			}
			results[table] = count
		}
		count, err = s.cleanupTable(ctx, "quote_snapshots", "ts", quoteCutoff, cfg.DryRun)
		if err != nil {
			return err
		}
		results["quote_snapshots"] = count

		for _, table := range []string{"oi_snapshots_equity", "oi_snapshots_futures", "oi_snapshots_options"} {
			count, err := s.cleanupTable(ctx, table, "ts", oiCutoff, cfg.DryRun)
			if err != nil {
				return err
			}
			results[table] = count
		}

		// Keep index OI on existing day-based snapshot retention unless separately changed.
		count, err = s.cleanupTable(ctx, "oi_snapshots_index", "ts", snapsCutoff, cfg.DryRun)
		if err != nil {
			return err
		}
		results["oi_snapshots_index"] = count

		count, err = s.cleanupDepth5(ctx, depthCutoff, cfg.DryRun)
		if err != nil {
			return err
		}
		results["depth_5_snapshots"] = count

		if cfg.Depth5MaxGB > 0 {
			droppedByCap, err := s.enforcePartitionedTableCapGB(ctx, "depth_5_snapshots", cfg.Depth5MaxGB, cfg.DryRun)
			if err != nil {
				return err
			}
			results["depth_5_snapshots_cap"] = droppedByCap
		}

		count, err = s.cleanupTable(ctx, "option_greeks", "ts", greeksCutoff, cfg.DryRun)
		if err != nil {
			return err
		}
		results["option_greeks"] = count

		return nil
	})
	return results, err
}

func cutoffUTC(now time.Time, days int, loc *time.Location) time.Time {
	if days < 1 {
		days = 1
	}
	cutoff := now.In(loc).AddDate(0, 0, -days)
	return time.Date(cutoff.Year(), cutoff.Month(), cutoff.Day(), 0, 0, 0, 0, time.UTC)
}

func cutoffHoursUTC(now time.Time, hours int, loc *time.Location) time.Time {
	if hours < 1 {
		hours = 1
	}
	return now.In(loc).Add(-time.Duration(hours) * time.Hour).UTC()
}

func (s *Store) cleanupTable(ctx context.Context, table, column string, cutoff time.Time, dryRun bool) (int64, error) {
	partitioned, err := s.isPartitionedTable(ctx, table)
	if err != nil {
		return 0, err
	}
	if partitioned {
		return s.dropOldPartitions(ctx, table, cutoff, dryRun)
	}
	return s.deleteByCutoff(ctx, table, column, cutoff, dryRun)
}

// cleanupDepth5 enforces cutoff within active partitions and drops full partitions older than cutoff month.
func (s *Store) cleanupDepth5(ctx context.Context, cutoff time.Time, dryRun bool) (int64, error) {
	parts, err := s.listPartitions(ctx, "depth_5_snapshots")
	if err != nil {
		return 0, err
	}
	cutoffMonth := time.Date(cutoff.Year(), cutoff.Month(), 1, 0, 0, 0, 0, time.UTC)
	var total int64
	for _, part := range parts {
		partMonth, ok := parsePartitionMonth(part)
		if !ok {
			continue
		}
		if partMonth.Before(cutoffMonth) {
			if s.Logger != nil {
				s.Logger.Info("cleanup_partition", "table", "depth_5_snapshots", "partition", part, "cutoff", cutoffMonth.Format("2006-01-02"), "dry_run", dryRun)
			}
			if dryRun {
				total++
				continue
			}
			stmt := fmt.Sprintf("DROP TABLE IF EXISTS %s.%s", quoteIdent(s.Schema), pgxIdentifier(part))
			if _, err := s.exec(ctx, "drop_partition_depth_5_snapshots", stmt); err != nil {
				return total, err
			}
			total++
			continue
		}

		// Enforce exact day-based retention within active partitions (e.g., current month).
		deleted, err := s.deleteByCutoff(ctx, part, "ts", cutoff, dryRun)
		if err != nil {
			return total, err
		}
		total += deleted
	}
	return total, nil
}

func (s *Store) dropOldPartitions(ctx context.Context, table string, cutoff time.Time, dryRun bool) (int64, error) {
	parts, err := s.listPartitions(ctx, table)
	if err != nil {
		return 0, err
	}
	var dropped int64
	cutoffMonth := time.Date(cutoff.Year(), cutoff.Month(), 1, 0, 0, 0, 0, time.UTC)
	for _, part := range parts {
		partMonth, ok := parsePartitionMonth(part)
		if !ok {
			continue
		}
		if !partMonth.Before(cutoffMonth) {
			continue
		}
		if s.Logger != nil {
			s.Logger.Info("cleanup_partition", "table", table, "partition", part, "cutoff", cutoffMonth.Format("2006-01-02"), "dry_run", dryRun)
		}
		if dryRun {
			dropped++
			continue
		}
		stmt := fmt.Sprintf("DROP TABLE IF EXISTS %s.%s", quoteIdent(s.Schema), pgxIdentifier(part))
		if _, err := s.exec(ctx, "drop_partition_"+table, stmt); err != nil {
			return dropped, err
		}
		dropped++
	}
	return dropped, nil
}

func (s *Store) deleteByCutoff(ctx context.Context, table, column string, cutoff time.Time, dryRun bool) (int64, error) {
	var total int64
	qualified := fmt.Sprintf("%s.%s", quoteIdent(s.Schema), pgxIdentifier(table))
	for {
		if dryRun {
			if s.Logger != nil {
				s.Logger.Info("cleanup_delete_dry_run", "table", table, "cutoff", cutoff.Format(time.RFC3339))
			}
			break
		}
		stmt := fmt.Sprintf(`
WITH rows AS (
  SELECT ctid FROM %s WHERE %s < $1 LIMIT 10000
)
DELETE FROM %s WHERE ctid IN (SELECT ctid FROM rows)
`, qualified, column, qualified)
		tag, err := s.exec(ctx, "cleanup_delete_"+table, stmt, cutoff)
		if err != nil {
			return total, err
		}
		affected := tag.RowsAffected()
		total += affected
		if affected == 0 {
			break
		}
	}
	if !dryRun {
		analyze := fmt.Sprintf("ANALYZE %s", qualified)
		_, _ = s.exec(ctx, "cleanup_analyze_"+table, analyze)
	}
	return total, nil
}

func pgxIdentifier(value string) string {
	return pgx.Identifier{value}.Sanitize()
}

func (s *Store) enforcePartitionedTableCapGB(ctx context.Context, table string, maxGB int, dryRun bool) (int64, error) {
	if maxGB <= 0 {
		return 0, nil
	}
	var partitioned bool
	checkStmt := `
SELECT EXISTS (
  SELECT 1
  FROM pg_partitioned_table pt
  JOIN pg_class c ON c.oid = pt.partrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = $1
    AND c.relname = $2
)`
	if err := s.Pool.QueryRow(ctx, checkStmt, s.Schema, table).Scan(&partitioned); err != nil {
		return 0, err
	}
	if !partitioned {
		return 0, nil
	}

	type partitionSize struct {
		name  string
		size  int64
		month time.Time
	}
	const q = `
SELECT c.relname, pg_total_relation_size(c.oid)
FROM pg_inherits i
JOIN pg_class c ON c.oid = i.inhrelid
JOIN pg_class p ON p.oid = i.inhparent
JOIN pg_namespace n ON n.oid = p.relnamespace
WHERE n.nspname = $1
  AND p.relname = $2`
	rows, err := s.Pool.Query(ctx, q, s.Schema, table)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var total int64
	parts := make([]partitionSize, 0, 16)
	for rows.Next() {
		var name string
		var size int64
		if err := rows.Scan(&name, &size); err != nil {
			return 0, err
		}
		month, ok := parsePartitionMonth(name)
		if !ok {
			continue
		}
		total += size
		parts = append(parts, partitionSize{name: name, size: size, month: month})
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	maxBytes := int64(maxGB) * 1024 * 1024 * 1024
	if total <= maxBytes {
		return 0, nil
	}

	sort.Slice(parts, func(i, j int) bool {
		return parts[i].month.Before(parts[j].month)
	})

	var dropped int64
	currentMonth := time.Date(time.Now().UTC().Year(), time.Now().UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
	for _, part := range parts {
		if total <= maxBytes {
			break
		}
		if !part.month.Before(currentMonth) {
			continue
		}
		if s.Logger != nil {
			s.Logger.Info("cleanup_partition_size_cap", "table", table, "partition", part.name, "partition_bytes", part.size, "total_bytes_before", total, "max_bytes", maxBytes, "dry_run", dryRun)
		}
		if dryRun {
			total -= part.size
			dropped++
			continue
		}
		stmt := fmt.Sprintf("DROP TABLE IF EXISTS %s.%s", quoteIdent(s.Schema), pgxIdentifier(part.name))
		if _, err := s.exec(ctx, "drop_partition_cap_"+table, stmt); err != nil {
			return dropped, err
		}
		total -= part.size
		dropped++
	}
	return dropped, nil
}
