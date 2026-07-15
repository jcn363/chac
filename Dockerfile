# Multi-stage Dockerfile for Chac
# Stage 1: Install dependencies
FROM oven/bun:latest AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Stage 2: Production image
FROM oven/bun:distroless AS runtime
WORKDIR /app

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Create data and tmp directories
RUN mkdir -p data tmp

# Expose port
EXPOSE 3000

# Environment defaults
ENV PORT=3000
ENV NODE_ENV=production

# Health check — uses Bun's built-in fetch (no curl needed in distroless)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:3000/api/status').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

# Run the application
CMD ["bun", "run", "src/main.ts"]
