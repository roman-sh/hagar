FROM node:22-bookworm AS base
WORKDIR /app

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
# Use the "shell" form of CMD to ensure the environment variable is substituted.
CMD node --env-file=${ENV_FILE_PATH} dist/main.js 