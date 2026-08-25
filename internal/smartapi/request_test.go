package smartapi

import (
	"testing"

	"trading-stack/internal/config"
)

func TestOrderPathsAreBlockedEvenWhenConfigFlagIsFalse(t *testing.T) {
	for _, target := range []string{
		"https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder",
		"https://apiconnect.angelone.in/rest/secure/angelbroking/gtt/v1/createRule",
	} {
		if err := guardNoLiveOrders(config.SmartAPIConfig{DisableLiveOrders: false}, target); err == nil {
			t.Fatalf("expected collector to block broker mutation endpoint %s", target)
		}
	}
}

func TestMarketDataPathRemainsAllowed(t *testing.T) {
	target := "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote"
	if err := guardNoLiveOrders(config.SmartAPIConfig{}, target); err != nil {
		t.Fatalf("market data path must remain available: %v", err)
	}
}
