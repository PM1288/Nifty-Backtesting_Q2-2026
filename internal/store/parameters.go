package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type StrategyParameter struct {
	Scope     string
	Name      string
	Value     json.RawMessage
	UpdatedAt time.Time
	UpdatedBy *string
}

type StrategyParameterSeed struct {
	Name  string
	Value json.RawMessage
}

type StrategyParameterHistory struct {
	ID        int64
	Scope     string
	Name      string
	Value     json.RawMessage
	UpdatedAt time.Time
	UpdatedBy *string
}

func (s *Store) EnsureStrategyParameters(ctx context.Context, scope string, seeds []StrategyParameterSeed, updatedBy *string) error {
	if len(seeds) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.strategy_parameters
  (scope, name, value, updated_at, updated_by)
VALUES ($1,$2,$3, now(), $4)
ON CONFLICT (scope, name) DO NOTHING`, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, seed := range seeds {
		if seed.Name == "" || len(seed.Value) == 0 {
			continue
		}
		batch.Queue(stmt, scope, seed.Name, seed.Value, updatedBy)
	}
	return s.execBatch(ctx, "seed_strategy_parameters", batch)
}

func (s *Store) ListStrategyParameters(ctx context.Context, scope string) (map[string]StrategyParameter, error) {
	query := fmt.Sprintf(`
SELECT scope, name, value, updated_at, updated_by
FROM %s.strategy_parameters
WHERE scope = $1
ORDER BY name`, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, query, scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]StrategyParameter{}
	for rows.Next() {
		var param StrategyParameter
		if err := rows.Scan(&param.Scope, &param.Name, &param.Value, &param.UpdatedAt, &param.UpdatedBy); err != nil {
			return nil, err
		}
		out[param.Name] = param
	}
	return out, rows.Err()
}

func (s *Store) UpsertStrategyParameter(ctx context.Context, param StrategyParameter) error {
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		stmt := fmt.Sprintf(`
INSERT INTO %s.strategy_parameters
  (scope, name, value, updated_at, updated_by)
VALUES ($1,$2,$3, now(), $4)
ON CONFLICT (scope, name) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by`, quoteIdent(s.Schema))
		if _, err := tx.Exec(ctx, stmt, param.Scope, param.Name, param.Value, param.UpdatedBy); err != nil {
			return err
		}
		historyStmt := fmt.Sprintf(`
INSERT INTO %s.strategy_parameter_history
  (scope, name, value, updated_at, updated_by)
VALUES ($1,$2,$3, now(), $4)`, quoteIdent(s.Schema))
		if _, err := tx.Exec(ctx, historyStmt, param.Scope, param.Name, param.Value, param.UpdatedBy); err != nil {
			return err
		}
		return nil
	})
}

func (s *Store) ListStrategyParameterHistory(ctx context.Context, scope string, limit int) ([]StrategyParameterHistory, error) {
	if limit <= 0 {
		limit = 50
	}
	query := fmt.Sprintf(`
SELECT id, scope, name, value, updated_at, updated_by
FROM %s.strategy_parameter_history
WHERE scope = $1
ORDER BY updated_at DESC
LIMIT $2`, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, query, scope, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StrategyParameterHistory
	for rows.Next() {
		var row StrategyParameterHistory
		if err := rows.Scan(&row.ID, &row.Scope, &row.Name, &row.Value, &row.UpdatedAt, &row.UpdatedBy); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
