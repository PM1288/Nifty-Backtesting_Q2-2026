package smartapi

import (
	"encoding/binary"
	"testing"
)

func TestParseBinaryTickPreservesModeSequenceAndRaw(t *testing.T) {
	packet := make([]byte, 51)
	packet[0] = 3
	packet[1] = 1
	copy(packet[2:27], []byte("12345"))
	binary.LittleEndian.PutUint64(packet[27:35], 77)
	binary.LittleEndian.PutUint64(packet[35:43], 1786333500)
	binary.LittleEndian.PutUint64(packet[43:51], 12345)
	tick, ok := parseBinaryTick(packet)
	if !ok {
		t.Fatal("valid packet was rejected")
	}
	if tick.Mode != 3 || tick.Sequence != 77 || tick.Exchange != "NSE" || tick.Token != "12345" || tick.LTP != 123.45 {
		t.Fatalf("unexpected tick: %+v", tick)
	}
	if len(tick.Raw) != len(packet) || tick.ReceivedAt.IsZero() {
		t.Fatalf("archive metadata missing: %+v", tick)
	}
	packet[0] = 1
	if tick.Raw[0] != 3 {
		t.Fatal("raw packet must be copied, not aliased")
	}
}

func TestParseBinaryTickQuarantinesImpossibleOIChange(t *testing.T) {
	for _, value := range []int64{-4607714335521942500, -101, -100, 0, 1000000} {
		packet := make([]byte, 147)
		packet[0], packet[1] = 3, 2
		copy(packet[2:27], []byte("12345"))
		binary.LittleEndian.PutUint64(packet[139:147], uint64(value))
		tick, ok := parseBinaryTick(packet)
		if !ok {
			t.Fatal("OI error must not discard an otherwise valid quote")
		}
		if value < -100 && tick.OIChangePct != nil {
			t.Fatalf("invalid OI percentage escaped: %v", *tick.OIChangePct)
		}
		if value >= -100 && (tick.OIChangePct == nil || *tick.OIChangePct != float64(value)) {
			t.Fatalf("valid OI percentage lost: %d", value)
		}
		if binary.LittleEndian.Uint64(tick.Raw[139:147]) != uint64(value) {
			t.Fatal("raw evidence changed")
		}
	}
}
