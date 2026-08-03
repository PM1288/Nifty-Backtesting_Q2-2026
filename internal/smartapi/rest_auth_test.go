package smartapi

import (
	"testing"
	"time"

	"trading-stack/internal/config"
)

func TestResolveTOTPValueUsesExplicitCode(t *testing.T) {
	t.Parallel()

	value, err := resolveTOTPValue(config.SmartAPIConfig{TOTPCode: "654321"}, time.Unix(0, 0))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if value != "654321" {
		t.Fatalf("expected explicit code to pass through, got %q", value)
	}
}

func TestResolveTOTPValueAcceptsLegacySixDigitSecretInput(t *testing.T) {
	t.Parallel()

	value, err := resolveTOTPValue(config.SmartAPIConfig{TOTPSecret: "233709"}, time.Unix(0, 0))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if value != "233709" {
		t.Fatalf("expected legacy six-digit secret input to be treated as current TOTP code, got %q", value)
	}
}

func TestResolveTOTPValueGeneratesFromSeed(t *testing.T) {
	t.Parallel()

	value, err := resolveTOTPValue(config.SmartAPIConfig{TOTPSecret: "JBSWY3DPEHPK3PXP"}, time.Unix(0, 0))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if value != "282760" {
		t.Fatalf("expected deterministic TOTP from seed, got %q", value)
	}
}

func TestResolveTOTPValueRejectsInvalidExplicitCode(t *testing.T) {
	t.Parallel()

	_, err := resolveTOTPValue(config.SmartAPIConfig{TOTPCode: "abc"}, time.Unix(0, 0))
	if err == nil {
		t.Fatal("expected validation error for invalid explicit totp code")
	}
}
