FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production
EXPOSE 18183

USER node
CMD ["node", "src/server.js"]
