package store

// Retention never provisions partitions. Unverified families fail closed.
import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"regexp"
	"time"
	"trading-stack/internal/config"
)

type retentionRule struct {
	Table, Column string
	Days          int
}

func retentionRules(cfg config.RetentionConfig) []retentionRule {
	return []retentionRule{
		{"bars_1m", "ts", cfg.Bars1mDays}, {"market_ticks", "exchange_ts", cfg.Bars1mDays},
		{"depth_5_metrics", "ts", cfg.Bars1mDays}, {"depth_5_snapshots", "ts", cfg.Depth5Days},
		{"quote_snapshots", "ts", cfg.QuoteSnapshotsDays},
		{"smartapi_option_chain_snapshots", "ts", cfg.OptionGreeksDays}, {"option_greeks", "ts", cfg.OptionGreeksDays},
		{"oi_snapshots_options", "ts", cfg.OptionGreeksDays}, {"oi_snapshots_equity", "ts", cfg.Bars1mDays},
		{"oi_snapshots_futures", "ts", cfg.Bars1mDays}, {"oi_snapshots_index", "ts", cfg.Bars1mDays},
		{"pcr_snapshots", "ts", cfg.QuoteSnapshotsDays}, {"gainers_losers_snapshots", "ts", cfg.QuoteSnapshotsDays},
		{"oibuildup_snapshots", "ts", cfg.QuoteSnapshotsDays}, {"putcallratio_snapshots", "ts", cfg.QuoteSnapshotsDays},
		{"symbol_perf_snapshot", "ts", cfg.QuoteSnapshotsDays},
	}
}
func (s *Store) CleanupRetention(ctx context.Context, cfg config.RetentionConfig, loc *time.Location) (map[string]int64, error) {
	result := map[string]int64{}
	if !cfg.EnableCleanup {
		return result, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	run := func() error {
		var failures []error
		for _, rule := range retentionRules(cfg) {
			if ctx.Err() != nil {
				return errors.Join(append(failures, ctx.Err())...)
			}
			counts, err := s.cleanupGovernedTable(ctx, rule, cutoffUTC(time.Now(), rule.Days, loc), cfg.DryRun)
			for key, value := range counts {
				result[rule.Table+"."+key] = value
			}
			if err != nil {
				failures = append(failures, fmt.Errorf("%s: %w", rule.Table, err))
			}
		}
		return errors.Join(failures...)
	}
	if cfg.DryRun {
		return result, run()
	}
	err := s.withAdvisoryLock(ctx, s.Schema+":cleanup", run)
	return result, err
}
func cutoffUTC(now time.Time, days int, loc *time.Location) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	if days < 1 {
		days = 1
	}
	d := now.In(loc).AddDate(0, 0, -days)
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, loc).UTC()
}
func cutoffHoursUTC(now time.Time, hours int, loc *time.Location) time.Time {
	if hours < 1 {
		hours = 1
	}
	return now.Add(-time.Duration(hours) * time.Hour).UTC()
}
func pgxIdentifier(value string) string { return pgx.Identifier{value}.Sanitize() }

var rangeBound = regexp.MustCompile(`^FOR VALUES FROM \('[^']+'\) TO \('([^']+)'\)$`)

// Actual catalog bounds, never name heuristics. DEFAULT/multi-key bounds are held.
func expiredPartition(bound string, cutoff time.Time) bool {
	m := rangeBound.FindStringSubmatch(bound)
	if len(m) != 2 {
		return false
	}
	for _, layout := range []string{"2006-01-02 15:04:05-07", "2006-01-02 15:04:05-07:00", time.RFC3339} {
		if upper, err := time.Parse(layout, m[1]); err == nil {
			return !upper.After(cutoff)
		}
	}
	return false
}
func (s *Store) cleanupGovernedTable(ctx context.Context, rule retentionRule, cutoff time.Time, dry bool) (counts map[string]int64, err error) {
	counts = map[string]int64{"rows_deleted": 0, "partitions_dropped": 0, "partition_bytes_before_drop": 0}
	// Only report committed changes; errors roll back the entire table batch.
	defer func() {
		if err != nil {
			counts["rows_deleted"] = 0
			counts["partitions_dropped"] = 0
			counts["partition_bytes_before_drop"] = 0
		}
	}()
	mode := pgx.ReadWrite
	if dry {
		mode = pgx.ReadOnly
	}
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{AccessMode: mode})
	if err != nil {
		return counts, err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, "SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='1s'; SET LOCAL timezone='UTC'"); err != nil {
		return counts, err
	}
	qualified := pgx.Identifier{s.Schema, rule.Table}.Sanitize()
	var present, gatePresent bool
	if err = tx.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL,to_regclass('operations.retention_gate') IS NOT NULL", qualified).Scan(&present, &gatePresent); err != nil {
		return counts, err
	}
	if !present {
		counts["missing"] = 1
		return counts, nil
	}
	var approved bool
	var retainFrom time.Time
	var rollingCutoff bool
	if gatePresent {
		err = tx.QueryRow(ctx, `SELECT true,retain_from,rolling_cutoff FROM operations.retention_gate WHERE relation_name=$1
   AND expires_at>now() AND daily_coverage_verified AND paper_evidence_verified
   AND dependencies_verified AND (restore_verified OR backup_waived)
   AND policy_version='RETENTION-20260907.1'`, s.Schema+"."+rule.Table).Scan(&approved, &retainFrom, &rollingCutoff)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return counts, err
		}
		err = nil
	}
	if !approved {
		counts["blocked_unverified"] = 1
	}
	if approved && !rollingCutoff && retainFrom.Before(cutoff) {
		cutoff = retainFrom
	}
	if !dry && !approved {
		return counts, nil
	}
	rows, err := tx.Query(ctx, `SELECT cn.nspname,c.relname,pg_get_expr(c.relpartbound,c.oid),pg_total_relation_size(c.oid)
 FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
 WHERE i.inhparent=to_regclass($1) ORDER BY c.oid`, qualified)
	if err != nil {
		return counts, err
	}
	type part struct {
		schema, name, bound string
		bytes               int64
	}
	var parts []part
	for rows.Next() {
		var p part
		if err = rows.Scan(&p.schema, &p.name, &p.bound, &p.bytes); err != nil {
			rows.Close()
			return counts, err
		}
		parts = append(parts, p)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return counts, err
	}
	for _, p := range parts {
		if !expiredPartition(p.bound, cutoff) {
			continue
		}
		counts["eligible_partitions"]++
		counts["eligible_partition_bytes"] += p.bytes
		if dry {
			continue
		}
		if _, err = tx.Exec(ctx, "DROP TABLE "+pgx.Identifier{p.schema, p.name}.Sanitize()); err != nil {
			return counts, err
		}
		counts["partitions_dropped"]++
		counts["partition_bytes_before_drop"] += p.bytes
	}
	if !dry {
		// tableoid+ctid prevents cross-partition ctid collisions. One bounded batch/run.
		stmt := fmt.Sprintf(`WITH expired AS(SELECT tableoid,ctid FROM %s WHERE %s<$1 LIMIT 10000 FOR UPDATE SKIP LOCKED)
   DELETE FROM %s t USING expired e WHERE t.tableoid=e.tableoid AND t.ctid=e.ctid`, qualified, pgxIdentifier(rule.Column), qualified)
		tag, e := tx.Exec(ctx, stmt, cutoff)
		if e != nil {
			return counts, e
		}
		counts["rows_deleted"] = tag.RowsAffected()
		_, err = tx.Exec(ctx, `INSERT INTO operations.retention_result(relation_name,cutoff,rows_deleted,partitions_dropped,partition_bytes_before_drop)
   VALUES($1,$2,$3,$4,$5)`, s.Schema+"."+rule.Table, cutoff, counts["rows_deleted"], counts["partitions_dropped"], counts["partition_bytes_before_drop"])
		if err != nil {
			return counts, err
		}
	}
	err = tx.Commit(ctx)
	return counts, err
}
