# Keep the deployed PostgreSQL 16.13 server/data format; patch OS and privilege helper.
FROM golang:1.26.8-alpine3.23 AS gosu
RUN CGO_ENABLED=0 go install github.com/tianon/gosu@1.19

FROM postgres:16@sha256:78df81b1442dcc764c1104154da7162635e40cfffe67579c42a1c1b96dfc209c
RUN apt-mark hold postgresql-16 postgresql-client-16 libpq5 \
    && apt-get update && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY --from=gosu /go/bin/gosu /usr/local/bin/gosu
RUN gosu nobody true && postgres --version
