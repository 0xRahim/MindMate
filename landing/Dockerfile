FROM docker.io/oven/bun:1-slim

WORKDIR /app

# curl is needed for the container HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install deps first for better layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# App source. Large 3D assets (VRM/FBX/GLB) resolve in this order:
# 1) baked-in landing/public/models + landing/public/animations,
# 2) bind-mounted at /assets at runtime (see compose.yaml, ASSETS_DIR)
# and served by the /models|/animations|/background route handlers.
COPY . .

ENV NODE_ENV=production
ENV ASSETS_DIR=/assets
RUN bun run build

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-8081}/api/models || exit 1

# PORT is injected by compose (.env LANDING_PORT); default 8081.
CMD ["sh", "-c", "bun run start -- --port ${PORT:-8081} --hostname 0.0.0.0"]
