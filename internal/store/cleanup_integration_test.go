package store

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"testing"
	"time"
)

// Only point RETENTION_TEST_DSN at a disposable database named retention_fixture.
func TestRetentionIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("RETENTION_TEST_DSN")
	if dsn == "" {
		t.Skip("isolated RETENTION_TEST_DSN required")
	}
	if !strings.Contains(dsn, "/retention_fixture") {
		t.Fatal("fixture database required")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, e := pool.Exec(ctx, q, args...); e != nil {
			t.Fatal(e)
		}
	}
	script, e := os.ReadFile("../../scripts/sql/retention_safety_20260907.sql")
	if e != nil {
		t.Fatal(e)
	}
	exec(string(script))
	exec(`CREATE SCHEMA fixture;
 CREATE TABLE fixture.bars_1m(ts timestamptz NOT NULL,v int) PARTITION BY RANGE(ts);
 CREATE TABLE fixture.old PARTITION OF fixture.bars_1m FOR VALUES FROM('2026-07-01') TO('2026-08-01');
 CREATE TABLE fixture.boundary PARTITION OF fixture.bars_1m FOR VALUES FROM('2026-08-01') TO('2026-09-01');
 CREATE TABLE fixture.recent PARTITION OF fixture.bars_1m FOR VALUES FROM('2026-09-01') TO('2026-10-01');
 INSERT INTO fixture.bars_1m VALUES('2026-07-05',1),('2026-08-05',2),('2026-08-25',3),('2026-09-05',4)`)
	st := &Store{Pool: pool, Schema: "fixture"}
	rule := retentionRule{"bars_1m", "ts", 15}
	cutoff := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	t.Run("unverified apply holds all data", func(t *testing.T) {
		c, e := st.cleanupGovernedTable(ctx, rule, cutoff, false)
		if e != nil || c["blocked_unverified"] != 1 {
			t.Fatal(c, e)
		}
	})
	t.Run("read-only plan reports catalog candidates without changes", func(t *testing.T) {
		c, e := st.cleanupGovernedTable(ctx, rule, cutoff, true)
		if e != nil || c["eligible_partitions"] != 1 || c["partitions_dropped"] != 0 {
			t.Fatal(c, e)
		}
		var n int
		pool.QueryRow(ctx, "select count(*) from fixture.bars_1m").Scan(&n)
		if n != 4 {
			t.Fatal(n)
		}
	})
	exec(`INSERT INTO operations.retention_gate(relation_name,retain_from,expires_at,daily_coverage_verified,paper_evidence_verified,dependencies_verified,restore_verified,evidence_uri,approved_by)
 VALUES('fixture.bars_1m','2026-08-20',now()+interval '1 hour',true,true,true,true,'isolated synthetic fixture','test')`)
	t.Run("partition and boundary expiry retains recent colliding ctids", func(t *testing.T) {
		c, e := st.cleanupGovernedTable(ctx, rule, cutoff, false)
		if e != nil || c["partitions_dropped"] != 1 || c["rows_deleted"] != 1 {
			t.Fatal(c, e)
		}
		var n int
		pool.QueryRow(ctx, "select count(*) from fixture.bars_1m where v in(3,4)").Scan(&n)
		if n != 2 {
			t.Fatal(n)
		}
	})
	t.Run("rerun is idempotent", func(t *testing.T) {
		c, e := st.cleanupGovernedTable(ctx, rule, cutoff, false)
		if e != nil || c["rows_deleted"] != 0 || c["partitions_dropped"] != 0 {
			t.Fatal(c, e)
		}
	})
	t.Run("expired approval fails closed", func(t *testing.T) {
		exec("update operations.retention_gate set expires_at=now()-interval '1 second'")
		c, e := st.cleanupGovernedTable(ctx, rule, cutoff, false)
		if e != nil || c["blocked_unverified"] != 1 {
			t.Fatal(c, e)
		}
	})
	t.Run("lock released on callback failure", func(t *testing.T) {
		e := st.withAdvisoryLock(ctx, "test", func() error { return os.ErrNotExist })
		if e != os.ErrNotExist {
			t.Fatal(e)
		}
		var n int
		pool.QueryRow(ctx, "select count(*) from pg_locks where locktype='advisory' and classid=0").Scan(&n)
		if n != 0 {
			t.Fatal("leaked", n)
		}
	})
}
