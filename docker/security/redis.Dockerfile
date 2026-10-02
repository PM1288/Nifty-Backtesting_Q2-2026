FROM redis:alpine@sha256:8096655e437712b07503796fb64d81359256cfcff0ab29d95a7da72863786efb
RUN apk upgrade --no-cache && redis-server --version
