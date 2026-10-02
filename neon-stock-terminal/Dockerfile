# syntax=docker/dockerfile:1.7
FROM node:22-trixie AS deps

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
ARG VITE_FIREBASE_AUTH_CONTINUE_URL=
ARG VITE_DEV_LOCAL_AUTH_ENABLED=0
ARG VITE_AUTO_AUTH_GATE=false
ARG VITE_UI_COMPACT_V5=false
ARG VITE_TODAY_SUMMARY_DETAIL_V1=false
ARG VITE_TRADING_ANALYTICS_ENABLED=true

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
ENV VITE_FIREBASE_AUTH_CONTINUE_URL=${VITE_FIREBASE_AUTH_CONTINUE_URL}
ENV VITE_DEV_LOCAL_AUTH_ENABLED=${VITE_DEV_LOCAL_AUTH_ENABLED}
ENV VITE_AUTO_AUTH_GATE=${VITE_AUTO_AUTH_GATE}
ENV VITE_UI_COMPACT_V5=${VITE_UI_COMPACT_V5}
ENV VITE_TODAY_SUMMARY_DETAIL_V1=${VITE_TODAY_SUMMARY_DETAIL_V1}
ENV VITE_TRADING_ANALYTICS_ENABLED=${VITE_TRADING_ANALYTICS_ENABLED}

RUN npm run prisma:generate --workspace=@app/api \
  && npm run build --workspace=@app/api \
  && npm run build --workspace=@app/web \
  && rm -rf apps/api/web-dist \
  && mkdir -p apps/api/web-dist \
  && cp -r apps/web/dist/. apps/api/web-dist/

# A fresh API-only install avoids retaining frontend dependencies from the builder.
FROM node:22-trixie-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --omit=optional --workspace=@app/api --include-workspace-root --no-audit --no-fund \
    && mkdir -p apps/api/node_modules

FROM node:22-trixie-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=18184
ENV SERVE_CLIENT=1

RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/web-dist ./apps/api/web-dist

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

USER node

EXPOSE 18184

CMD ["node", "apps/api/dist/server.js"]
