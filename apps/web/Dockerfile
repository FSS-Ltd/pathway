# Build stage
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

FROM base AS deps
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web

# Install dependencies (install all to ensure workspace package deps are hoisted)
# Disable husky during docker build to avoid .git can't be found noise
ENV HUSKY=0
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web

# Copy .pnpm store from deps stage to reuse downloaded packages
# Then re-run pnpm install to recreate proper symlinks
# This is necessary because copying node_modules breaks symlinks
COPY --from=deps /app/node_modules/.pnpm ./node_modules/.pnpm

# Re-run pnpm install to recreate node_modules symlinks properly
# Using --prefer-offline to use existing .pnpm store, --frozen-lockfile for consistency
ENV HUSKY=0
RUN pnpm install --frozen-lockfile --prefer-offline

# Build from workspace root using pnpm filter
# This ensures workspace binaries are resolved correctly
# Accept NEXT_PUBLIC_API_URL as build argument for production builds
# This is required because Next.js embeds NEXT_PUBLIC_* vars at build time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_STANDALONE=true
ENV NODE_ENV=production
RUN pnpm --filter @pathway/web build

# Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output (Next.js preserves the app directory structure)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Next.js standalone creates server.js in the app directory structure
# Note: With standalone output, we use node directly (not pnpm start) since the output is self-contained
CMD ["node", "apps/web/server.js"]
