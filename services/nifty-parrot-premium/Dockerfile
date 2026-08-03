FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=18184
ENV SERVE_CLIENT=1
EXPOSE 18184

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

WORKDIR /app/server
CMD ["node", "dist/index.js"]
