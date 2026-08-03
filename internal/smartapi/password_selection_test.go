package smartapi

import (
	"testing"

	"trading-stack/internal/config"
)

func TestSelectLoginPasswordPrefersMPINOverPassword(t *testing.T) {
	cfg := config.SmartAPIConfig{
		Password: "CHANGE_ME_SMARTAPI_PASSWORD",
		MPIN:     "1214",
	}

	if got := selectLoginPassword(cfg); got != "1214" {
		t.Fatalf("expected MPIN to win over password, got %q", got)
	}
}
