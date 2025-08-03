FROM node:22-bookworm AS base
WORKDIR /app

# Install the official, minimal set of system dependencies required by Puppeteer/Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
   ca-certificates \
   fonts-liberation \
   libasound2 \
   libatk-bridge2.0-0 \
   libatk1.0-0 \
   libcups2 \
   libdbus-1-3 \
   libexpat1 \
   libfontconfig1 \
   libgbm1 \
   libgconf-2-4 \
   libgdk-pixbuf2.0-0 \
   libglib2.0-0 \
   libgtk-3-0 \
   libnspr4 \
   libnss3 \
   libpango-1.0-0 \
   libpangocairo-1.0-0 \
   libstdc++6 \
   libx11-6 \
   libx11-xcb1 \
   libxcb1 \
   libxcomposite1 \
   libxcursor1 \
   libxdamage1 \
   libxext6 \
   libxfixes3 \
   libxi6 \
   libxrandr2 \
   libxrender1 \
   libxss1 \
   libxtst6 \
   lsb-release \
   wget \
   xdg-utils \
   && rm -rf /var/lib/apt/lists/*

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
# We no longer need ARG here. The env file path will be set at runtime.
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
# The CMD now simply runs the application.
# The environment variables will be injected directly by Docker Compose.
CMD [ "node", "dist/main.js" ] 