package logging

import (
	"log/slog"
	"os"
	"strings"

	"trading-stack/internal/config"
)

func New(cfg config.RuntimeConfig) *slog.Logger {
	level := parseLevel(cfg.LogLevel)
	opts := &slog.HandlerOptions{Level: level}
	var handler slog.Handler
	if cfg.LogJSON {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}
	return slog.New(handler).With(
		"service", cfg.ServiceName,
		"version", cfg.ServiceVersion,
	)
}

func WithModule(logger *slog.Logger, module string) *slog.Logger {
	if logger == nil {
		return nil
	}
	return logger.With("module", module)
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
