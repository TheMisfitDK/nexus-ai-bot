FROM node:20-alpine

WORKDIR /app

# Install system deps for canvas/sharp
RUN apk add --no-cache \
  cairo-dev pango-dev libjpeg-turbo-dev giflib-dev librsvg-dev \
  python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
