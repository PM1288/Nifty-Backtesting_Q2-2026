package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/logging"
	"trading-stack/internal/rsiwillr"
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
	runtimeCfg.ServiceName = "rsi-willr-monitor"
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

	if err := st.Migrate(ctx); err != nil {
		if strings.Contains(err.Error(), "migration checksum mismatch") {
			logger.Warn("migration checksum mismatch; continuing in runtime mode", "err", err)
		} else {
			logger.Error("migration failed", "err", err)
			os.Exit(1)
		}
	}

	if *dbMigrateOnly {
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

	service := rsiwillr.NewService(cfg.RSIWillRMonitor, st, baseLogger, loc)
	if err := service.Run(ctx); err != nil && ctx.Err() == nil {
		logger.Error("rsi-willr monitor exited", "err", err)
		os.Exit(1)
	}
}
