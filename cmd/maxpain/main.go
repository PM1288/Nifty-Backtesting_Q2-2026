package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/logging"
	"trading-stack/internal/maxpain"
	"trading-stack/internal/store"
)

func main() {
	configPath := flag.String("config", "/app/config.yaml", "Path to config file")
	dbMigrateOnly := flag.Bool("db-migrate-only", false, "Run migrations and exit")
	dbValidateOnly := flag.Bool("db-validate-only", false, "Validate schema and exit")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "config load failed: %v\n", err)
		os.Exit(1)
	}

	runtimeCfg := cfg.Runtime
	runtimeCfg.ServiceName = "max_pain"
	baseLogger := logging.New(runtimeCfg)
	logger := logging.WithModule(baseLogger, "main")

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	loc, err := time.LoadLocation(cfg.Runtime.Timezone)
	if err != nil {
		logger.Error("timezone load failed", "err", err)
		os.Exit(1)
	}

	st, err := store.New(ctx, cfg.Postgres, baseLogger)
	if err != nil {
		logger.Error("postgres init failed", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	if *dbMigrateOnly {
		if err := st.Migrate(ctx); err != nil {
			logger.Error("migration failed", "err", err)
			os.Exit(1)
		}
		logger.Info("migration complete")
		return
	}
	if *dbValidateOnly {
		if err := st.ValidateSchema(ctx); err != nil {
			logger.Error("schema validation failed", "err", err)
			os.Exit(1)
		}
		logger.Info("schema validation complete")
		return
	}

	if err := st.Migrate(ctx); err != nil {
		logger.Error("migration failed", "err", err)
		os.Exit(1)
	}

	runner := maxpain.NewRunner(cfg, st, baseLogger, loc)
	if err := runner.Run(ctx); err != nil && ctx.Err() == nil {
		logger.Error("max_pain runner exited", "err", err)
		os.Exit(1)
	}
}
