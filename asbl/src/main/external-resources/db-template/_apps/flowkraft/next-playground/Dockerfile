# ============================================
# FlowKraft Customer Portal - Next.js 15
# ============================================
# Multi-stage build for production deployment

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
# A clean checkout has no lock file (the repo ignores asbl/**/package-lock.json), and `npm ci` needs one.
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi

# Stage 2: Builder
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create data directory for SQLite and initialize database schema
RUN mkdir -p ./data
RUN npm run db:push

# Build the Next.js application
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create data directory for SQLite database
RUN mkdir -p ./data && chown nextjs:nodejs ./data

# Create public directory (may be empty)
RUN mkdir -p ./public

# Copy built application
# Copy public folder contents if they exist (using wildcard to handle empty folder)
COPY --from=builder /app/public* ./public/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy drizzle files for runtime migrations if needed (optional)
RUN mkdir -p ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle* ./drizzle/
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts

# Scripts directory is optional - create if needed
RUN mkdir -p ./scripts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
