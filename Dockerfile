# relay - all-in-one production image: FalkorDB + Next.js 16 in ONE container.
#
# Portable across: Hugging Face Spaces (PORT=7860), Railway, Zeabur, Render, Fly.io,
# docker compose, and plain `docker run` (PORT honored via $PORT).
#
# Build:  docker build -t roojool/relay .
# Run:    docker run -p 7860:7860 --env-file .env.local roojool/relay
#        docker run -p 3000:3000 roojool/relay          # defaults to 3000
#
# Set RUN_FALKORDB=0 to attach an external database instead (FALKORDB_URL then honored as-is).

FROM falkordb/falkordb:latest AS db

FROM node:24-trixie-slim AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:24-trixie-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-trixie-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV RUN_FALKORDB=1
ENV FALKORDB_URL=redis://127.0.0.1:6379
# Signs anonymous workspace cookies. Override with a real secret on your host.
ENV SESSION_SECRET=relay-demo-secret-change-on-host

# Runtime libs required by the FalkorDB engine + module.
# libgomp1 is dlopen'd by falkordb.so at runtime (OpenMP) - invisible to ldd, fatal on Railway.
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 libzstd1 libstdc++6 libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*

# FalkorDB engine (glibc binaries + module from the official image)
COPY --from=db /usr/local/bin/redis-server /usr/local/bin/redis-server
COPY --from=db /usr/local/bin/redis-cli /usr/local/bin/redis-cli
COPY --from=db /var/lib/falkordb /var/lib/falkordb

# Next.js standalone output + static assets + production node_modules (falkordb, zod, ...)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data

EXPOSE 7860
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1);}).on('error',()=>process.exit(1));"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
