package store

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Store) EnsureFuturePartitions(ctx context.Context, table string, monthsAhead int) error {
	if table == "" {
		return nil
	}
	if monthsAhead < 0 {
		monthsAhead = 0
	}
	now := time.Now().UTC()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i <= monthsAhead; i++ {
		if err := s.EnsureMonthlyPartition(ctx, table, start.AddDate(0, i, 0)); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) EnsureMonthlyPartition(ctx context.Context, table string, monthStart time.Time) error {
	partitioned, err := s.isPartitionedTable(ctx, table)
	if err != nil || !partitioned {
		return err
	}
	monthStart = time.Date(monthStart.Year(), monthStart.Month(), 1, 0, 0, 0, 0, time.UTC)
	nextMonth := monthStart.AddDate(0, 1, 0)
	partitionName := fmt.Sprintf("%s_%04d_%02d", table, monthStart.Year(), int(monthStart.Month()))
	target := pgx.Identifier{s.Schema, partitionName}.Sanitize()
	parent := pgx.Identifier{s.Schema, table}.Sanitize()
	stmt := fmt.Sprintf(
		"CREATE TABLE IF NOT EXISTS %s PARTITION OF %s FOR VALUES FROM ('%s') TO ('%s')",
		target,
		parent,
		monthStart.Format("2006-01-02"),
		nextMonth.Format("2006-01-02"),
	)
	_, err = s.exec(ctx, "ensure_partition_"+table, stmt)
	return err
}

func (s *Store) isPartitionedTable(ctx context.Context, table string) (bool, error) {
	query := `
SELECT EXISTS (
  SELECT 1
  FROM pg_partitioned_table p
  JOIN pg_class c ON p.partrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = $1 AND c.relname = $2
)`
	var exists bool
	start := time.Now()
	err := s.Pool.QueryRow(ctx, query, s.Schema, table).Scan(&exists)
	s.logQuery("check_partitioned_"+table, start, 2, err)
	return exists, err
}

func (s *Store) listPartitions(ctx context.Context, table string) ([]string, error) {
	query := `
SELECT c.relname
FROM pg_inherits i
JOIN pg_class c ON i.inhrelid = c.oid
JOIN pg_class p ON i.inhparent = p.oid
JOIN pg_namespace n ON p.relnamespace = n.oid
WHERE n.nspname = $1 AND p.relname = $2`
	start := time.Now()
	rows, err := s.Pool.Query(ctx, query, s.Schema, table)
	if err != nil {
		s.logQuery("list_partitions_"+table, start, 2, err)
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	err = rows.Err()
	s.logQuery("list_partitions_"+table, start, 2, err)
	return names, err
}

func parsePartitionMonth(name string) (time.Time, bool) {
	// Current readable convention: <table>_YYYY_MM.
	if len(name) >= 8 {
		suffix := name[len(name)-7:]
		if suffix[4] == '_' {
			year, yearErr := strconv.Atoi(suffix[:4])
			month, monthErr := strconv.Atoi(suffix[5:])
			if yearErr == nil && monthErr == nil && month >= 1 && month <= 12 {
				return time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC), true
			}
		}
	}
	// Backward compatibility for legacy <table>_yYYYYmMM partitions.
	idx := strings.LastIndex(name, "_y")
	if idx < 0 {
		return time.Time{}, false
	}
	suffix := name[idx+2:]
	if len(suffix) != 7 || suffix[4] != 'm' {
		return time.Time{}, false
	}
	year, err := strconv.Atoi(suffix[:4])
	if err != nil {
		return time.Time{}, false
	}
	month, err := strconv.Atoi(suffix[5:])
	if err != nil || month < 1 || month > 12 {
		return time.Time{}, false
	}
	return time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC), true
}
