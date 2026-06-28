# syntax=docker/dockerfile:1
# Multi-stage build producing a minimal Next.js standalone image for Cloud Run.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* is inlined at build time, so the Vault's worker URL must be
# provided as a build arg: docker build --build-arg NEXT_PUBLIC_WORKER_URL=...
ARG NEXT_PUBLIC_WORKER_URL
ENV NEXT_PUBLIC_WORKER_URL=$NEXT_PUBLIC_WORKER_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
# Cloud Run injects PORT (default 8080); the standalone server reads it.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["node", "server.js"]
