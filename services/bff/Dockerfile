FROM node:18-alpine

WORKDIR /app

COPY package.json ./
# If package-lock exists copy it, but we are just starting so it might not
# COPY package-lock.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
