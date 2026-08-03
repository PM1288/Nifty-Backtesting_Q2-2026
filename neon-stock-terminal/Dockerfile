# syntax=docker/dockerfile:1.7
FROM node:20-bookworm AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,target=/root/.npm npm ci --workspaces --include-workspace-root --no-audit --no-fund

FROM deps AS builder

WORKDIR /app

ARG VITE_BASE_PATH=/
ARG VITE_API_BASE_URL=
ARG VITE_WS_URL=
ARG VITE_GA_MEASUREMENT_ID=
ARG VITE_CLARITY_PROJECT_ID=
ARG VITE_MATOMO_BASE_URL=
ARG VITE_MATOMO_SITE_ID=
ARG VITE_FIREBASE_API_KEY=
ARG VITE_DEV_LOCAL_AUTH_ENABLED=0
ARG VITE_AUTO_AUTH_GATE=false

COPY apps/api ./apps/api
COPY apps/web ./apps/web

ENV VITE_BASE_PATH=${VITE_BASE_PATH}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}
ENV VITE_CLARITY_PROJECT_ID=${VITE_CLARITY_PROJECT_ID}
ENV VITE_MATOMO_BASE_URL=${VITE_MATOMO_BASE_URL}
ENV VITE_MATOMO_SITE_ID=${VITE_MATOMO_SITE_ID}
ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
ENV VITE_DEV_LOCAL_AUTH_ENABLED=${VITE_DEV_LOCAL_AUTH_ENABLED}
ENV VITE_AUTO_AUTH_GATE=${VITE_AUTO_AUTH_GATE}

RUN npm run prisma:generate --workspace=@app/api \
  && npm run build --workspace=@app/api \
  && npm run build --workspace=@app/web \
  && rm -rf apps/api/web-dist \
  && mkdir -p apps/api/web-dist \
  && cp -r apps/web/dist/. apps/api/web-dist/ \
  && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=18184
ENV SERVE_CLIENT=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/web-dist ./apps/api/web-dist

EXPOSE 18184

CMD ["node", "apps/api/dist/server.js"]
