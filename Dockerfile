# syntax=docker/dockerfile:1.7
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd ./cmd
COPY db ./db
COPY internal ./internal
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -o /out/collector ./cmd/collector && \
    go build -o /out/strategy ./cmd/strategy && \
    go build -o /out/watchlist ./cmd/watchlist && \
    go build -o /out/backtest ./cmd/backtest && \
    go build -o /out/equilibrium ./cmd/equilibrium && \
    go build -o /out/maxpain ./cmd/maxpain && \
    go build -o /out/rsiwillr ./cmd/rsiwillr

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
RUN adduser -D -g '' appuser
WORKDIR /app
COPY --from=build /out/collector /app/collector
COPY --from=build /out/strategy /app/strategy
COPY --from=build /out/watchlist /app/watchlist
COPY --from=build /out/backtest /app/backtest
COPY --from=build /out/equilibrium /app/equilibrium
COPY --from=build /out/maxpain /app/maxpain
COPY --from=build /out/rsiwillr /app/rsiwillr
USER appuser
ENTRYPOINT ["/app/collector"]
CMD ["--config","/app/config.yaml"]
