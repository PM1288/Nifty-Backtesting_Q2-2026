package smartapi

import (
	"context"
	"encoding/binary"
	"github.com/gorilla/websocket"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestReadLoopCancellationUnblocksSocketAndFullOutput(t *testing.T) {
	for _, sendTick := range []bool{false, true} {
		t.Run(map[bool]string{false: "idle_socket", true: "blocked_output"}[sendTick], func(t *testing.T) {
			ready := make(chan struct{})
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				conn, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
				if err != nil {
					return
				}
				defer conn.Close()
				if sendTick {
					data := make([]byte, 51)
					data[0] = 1
					data[1] = 1
					copy(data[2:27], "123")
					binary.LittleEndian.PutUint64(data[43:51], 10000)
					_ = conn.WriteMessage(websocket.BinaryMessage, data)
				}
				close(ready)
				for {
					if _, _, err := conn.ReadMessage(); err != nil {
						return
					}
				}
			}))
			defer srv.Close()
			conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			go func() { done <- (&Streamer{}).readLoop(ctx, conn, make(chan Tick)) }()
			<-ready
			time.Sleep(20 * time.Millisecond)
			cancel()
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("read loop leaked after cancellation")
			}
		})
	}
}

func TestReconnectWaitCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := waitReconnect(ctx, time.Minute); err != context.Canceled {
		t.Fatalf("got %v", err)
	}
}
