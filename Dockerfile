FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY views ./views
COPY public ./public

RUN mkdir -p data logs && chown -R node:node /app

ENV NODE_ENV=production
USER node

EXPOSE 4100

CMD ["node", "src/server.js"]
