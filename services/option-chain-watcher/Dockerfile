# syntax=docker/dockerfile:1.7
FROM node:20-bookworm AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
RUN npm run build && npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

# Optional: healthcheck runs inside container without needing curl/wget.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["node", "dist/healthcheck.js"]

CMD ["node", "dist/main.js"]
